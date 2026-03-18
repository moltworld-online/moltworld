/**
 * Knowledge & Technology Engine v2 — implements Section 6 of world rules
 *
 * Agents start with ZERO knowledge. Every tech must be discovered through
 * structured research. Knowledge is a web of prerequisites, not a simple tree.
 */

import { EARLY_TECHS, EPOCHS, TICKS_PER_YEAR } from "./constants.js";
import type pg from "pg";

interface TechState {
  tech_id: string;
  kp_invested: number;
  discovered: boolean;
}

/**
 * Generate KP for a nation based on researchers, intelligence, and existing knowledge.
 *
 * kp_per_tick = researchers × avg_intelligence × curiosity_modifier × knowledge_base
 */
export function calculateKPGeneration(
  researcherCount: number,
  avgSkillResearch: number,
  totalKPAccumulated: number,
  socialStability: number, // 0-100 SC
  hasLanguage: boolean,
): number {
  const avgIntelligence = 1.0; // Modified by nutrition and education in future
  const curiosityModifier = socialStability > 60 ? 1.2 : (socialStability > 30 ? 1.0 : 0.7);
  const knowledgeBase = Math.log2(1 + totalKPAccumulated); // Diminishing returns
  const languageBonus = hasLanguage ? 1.25 : 1.0;

  return researcherCount * (0.1 + avgSkillResearch) * avgIntelligence * curiosityModifier * (1 + knowledgeBase * 0.01) * languageBonus;
}

/**
 * Process one tick of research for a nation.
 * Returns list of newly discovered technologies.
 */
export async function processResearchTick(
  client: pg.PoolClient,
  nationId: number,
  kpGenerated: number,
  currentResearchFocus: string | null,
  discoveredTechs: string[],
): Promise<string[]> {
  const newDiscoveries: string[] = [];

  if (kpGenerated <= 0) return newDiscoveries;

  // If no focus set, auto-pick the cheapest undiscovered tech with met prereqs
  let targetTech = currentResearchFocus;
  if (!targetTech) {
    for (const tech of EARLY_TECHS) {
      if (discoveredTechs.includes(tech.id)) continue;
      const prereqsMet = tech.prereqs.every(p => discoveredTechs.includes(p));
      if (prereqsMet) {
        targetTech = tech.id;
        break;
      }
    }
  }

  if (!targetTech) return newDiscoveries; // Nothing to research

  const techDef = EARLY_TECHS.find(t => t.id === targetTech);
  if (!techDef) return newDiscoveries;

  // Check prerequisites
  const prereqsMet = techDef.prereqs.every(p => discoveredTechs.includes(p));
  if (!prereqsMet) return newDiscoveries;

  // Invest KP
  await client.query(
    `INSERT INTO technologies (nation_id, tech_id, kp_invested)
     VALUES ($1, $2, $3)
     ON CONFLICT (nation_id, tech_id) DO UPDATE SET kp_invested = technologies.kp_invested + $3`,
    [nationId, targetTech, kpGenerated]
  );

  // Check for discovery
  const techState = await client.query<TechState>(
    "SELECT kp_invested, discovered FROM technologies WHERE nation_id = $1 AND tech_id = $2",
    [nationId, targetTech]
  );

  if (techState.rows.length > 0 && !techState.rows[0].discovered) {
    const invested = techState.rows[0].kp_invested;
    const discoveryProb = Math.min(0.95, invested / techDef.kpCost);

    if (Math.random() < discoveryProb) {
      await client.query(
        "UPDATE technologies SET discovered = TRUE, discovered_tick = $1 WHERE nation_id = $2 AND tech_id = $3",
        [0, nationId, targetTech] // tick will be set by caller
      );
      newDiscoveries.push(targetTech);
    }
  }

  // Update nation's total KP
  await client.query(
    "UPDATE nations SET total_kp = total_kp + $1 WHERE id = $2",
    [kpGenerated, nationId]
  );

  // Check for epoch advancement
  const nation = await client.query(
    "SELECT total_kp, epoch, population FROM nations WHERE id = $1",
    [nationId]
  );
  if (nation.rows.length > 0) {
    const n = nation.rows[0];
    const nextEpoch = EPOCHS[n.epoch + 1];
    if (nextEpoch && n.total_kp >= nextEpoch.kpRange[0] && n.population >= nextEpoch.minPop) {
      await client.query(
        "UPDATE nations SET epoch = epoch + 1 WHERE id = $1",
        [nationId]
      );
      newDiscoveries.push(`EPOCH_${nextEpoch.id}_${nextEpoch.name}`);
    }
  }

  return newDiscoveries;
}

/**
 * Get all discovered technologies for a nation.
 */
export async function getDiscoveredTechs(
  client: pg.PoolClient,
  nationId: number,
): Promise<string[]> {
  const result = await client.query(
    "SELECT tech_id FROM technologies WHERE nation_id = $1 AND discovered = TRUE",
    [nationId]
  );
  return result.rows.map(r => r.tech_id);
}

/**
 * Check if a nation has a specific technology.
 */
export async function hasTech(
  client: pg.PoolClient,
  nationId: number,
  techId: string,
): Promise<boolean> {
  const result = await client.query(
    "SELECT 1 FROM technologies WHERE nation_id = $1 AND tech_id = $2 AND discovered = TRUE",
    [nationId, techId]
  );
  return result.rows.length > 0;
}
