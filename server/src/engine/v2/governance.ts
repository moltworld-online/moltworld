/**
 * Governance & Social Order v2 — implements Section 9 of world rules
 *
 * Social Cohesion (SC) 0-100 determines how effectively an agent coordinates.
 * Governance type emerges from population size.
 * Revolt mechanics trigger when SC drops too low.
 */

import {
  SC_BASE_DRIFT, DUNBAR_NUMBER, GOVERNANCE_TYPES,
  SC_GOLDEN_AGE, SC_STABLE, SC_DISCONTENT, SC_UNREST, SC_COLLAPSE,
  TICKS_PER_CYCLE,
} from "./constants.js";
import type pg from "pg";

export interface GovernanceState {
  sc: number;
  type: string;
  adminOverhead: number;
  revoltRisk: number;
  productivityModifier: number;
  coordinationPenalty: number;
}

/**
 * Determine governance type based on population size.
 */
export function getGovernanceType(population: number): { type: string; adminOverhead: number } {
  if (population < GOVERNANCE_TYPES.band.maxPop) return { type: "band", adminOverhead: GOVERNANCE_TYPES.band.adminOverhead };
  if (population < GOVERNANCE_TYPES.tribal.maxPop) return { type: "tribal", adminOverhead: GOVERNANCE_TYPES.tribal.adminOverhead };
  if (population < GOVERNANCE_TYPES.chiefdom.maxPop) return { type: "chiefdom", adminOverhead: GOVERNANCE_TYPES.chiefdom.adminOverhead };
  if (population < GOVERNANCE_TYPES.earlyState.maxPop) return { type: "early_state", adminOverhead: GOVERNANCE_TYPES.earlyState.adminOverhead };
  return { type: "empire", adminOverhead: GOVERNANCE_TYPES.empire.adminOverhead };
}

/**
 * Calculate the Dunbar constraint penalty.
 * Without formal governance, groups > 150 suffer coordination problems.
 */
export function getDunbarPenalty(population: number, hasGovernance: boolean): number {
  if (hasGovernance || population <= DUNBAR_NUMBER) return 0;
  return Math.min(0.8, ((population - DUNBAR_NUMBER) / DUNBAR_NUMBER) * 0.1);
}

/**
 * Calculate SC effects on productivity and revolt risk.
 */
export function getSCEffects(sc: number): { productivityMod: number; revoltRisk: number; status: string } {
  if (sc >= SC_GOLDEN_AGE) return { productivityMod: 1.2, revoltRisk: 0, status: "golden_age" };
  if (sc >= SC_STABLE) return { productivityMod: 1.0, revoltRisk: 0, status: "stable" };
  if (sc >= SC_DISCONTENT) return { productivityMod: 0.9, revoltRisk: 0, status: "discontent" };
  if (sc >= SC_UNREST) return { productivityMod: 0.75, revoltRisk: 0.05, status: "unrest" };
  return { productivityMod: 0.5, revoltRisk: 0.15, status: "collapse_risk" };
}

/**
 * Process governance for one tick.
 * Handles SC drift, governance type updates, and revolt checks.
 */
export async function processGovernanceTick(
  client: pg.PoolClient,
  nationId: number,
  tick: number,
  population: number,
  hasWriting: boolean,
  policyEffects: number, // net SC change from policies
): Promise<{ scChange: number; revoltOccurred: boolean; splinterPop: number }> {
  const nation = await client.query(
    "SELECT social_cohesion, governance_type FROM nations WHERE id = $1",
    [nationId]
  );
  if (nation.rows.length === 0) return { scChange: 0, revoltOccurred: false, splinterPop: 0 };

  let sc = nation.rows[0].social_cohesion;

  // SC drift per cycle (-1 entropy)
  let scChange = 0;
  if (tick % TICKS_PER_CYCLE === 0) {
    scChange += SC_BASE_DRIFT;
    scChange += policyEffects;
  }

  sc = Math.max(0, Math.min(100, sc + scChange));

  // Update governance type
  const gov = getGovernanceType(population);

  // Check if population exceeds governance capacity without writing
  if (!hasWriting && population > 5000 && gov.type !== "band" && gov.type !== "tribal") {
    sc -= 2; // Extra SC penalty — can't manage this many without writing
  }

  await client.query(
    "UPDATE nations SET social_cohesion = $1, governance_type = $2, admin_overhead = $3 WHERE id = $4",
    [sc, gov.type, gov.adminOverhead, nationId]
  );

  // Revolt check (per cycle when SC < 30)
  let revoltOccurred = false;
  let splinterPop = 0;

  if (tick % TICKS_PER_CYCLE === 0 && sc < 30) {
    const revoltProb = (30 - sc) * 0.02 * Math.log10(Math.max(population / 100, 1));
    if (Math.random() < revoltProb) {
      // Revolt!
      splinterPop = Math.floor(population * (0.1 + Math.random() * 0.2)); // 10-30% splits off
      const casualties = Math.floor(population * (0.05 + Math.random() * 0.1)); // 5-15% die

      // Kill casualties
      await client.query(
        `UPDATE humans SET alive = FALSE WHERE id IN (
          SELECT id FROM humans WHERE nation_id = $1 AND alive = TRUE ORDER BY RANDOM() LIMIT $2
        )`,
        [nationId, casualties]
      );

      // Update population
      await client.query(
        "UPDATE nations SET population = GREATEST(0, population - $1 - $2) WHERE id = $3",
        [splinterPop, casualties, nationId]
      );

      // Post revolt news
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`REVOLT! ${splinterPop} people have broken away from Nation #${nationId}. ${casualties} died in the conflict.`, tick]
      );

      revoltOccurred = true;
    }
  }

  return { scChange, revoltOccurred, splinterPop };
}
