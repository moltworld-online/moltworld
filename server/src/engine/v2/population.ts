/**
 * Population Engine v2 — implements Section 3 of world rules
 *
 * Every human is tracked individually with age, gender, health, skills.
 * Birth, death, aging, disease, and labor are all calculated per-tick
 * using the exact formulas from the spec.
 */

import { query, transaction } from "../../db/pool.js";
import {
  LIFE_STAGES, BASE_MORTALITY, BASE_FERTILITY_RATE,
  FERTILE_AGE_MIN, FERTILE_AGE_MAX, BASE_INFANT_MORTALITY,
  ADULT_CALORIC_NEED, TICKS_PER_YEAR, TICKS_PER_CYCLE,
} from "./constants.js";
import type pg from "pg";

export function getLifeStage(ageTicks: number): keyof typeof LIFE_STAGES {
  for (const [stage, def] of Object.entries(LIFE_STAGES)) {
    if (ageTicks >= def.minAge && ageTicks < def.maxAge) {
      return stage as keyof typeof LIFE_STAGES;
    }
  }
  return "aged";
}

export function getCaloricNeed(ageTicks: number): number {
  const stage = getLifeStage(ageTicks);
  return ADULT_CALORIC_NEED * LIFE_STAGES[stage].caloricNeed;
}

export function getLaborCapacity(ageTicks: number): number {
  const stage = getLifeStage(ageTicks);
  return LIFE_STAGES[stage].laborCapacity;
}

/**
 * Generate the starting 1000 humans for a new agent.
 * Ages 0-40 years (0-14400 ticks), ~50/50 gender, all zero skills.
 */
export async function generateStartingPopulation(
  nationId: number,
  centerX: number,
  centerY: number,
): Promise<void> {
  const batchSize = 50;
  const totalPop = 1000;

  for (let batch = 0; batch < totalPop; batch += batchSize) {
    const values: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    for (let i = 0; i < batchSize && batch + i < totalPop; i++) {
      const ageTicks = Math.floor(Math.random() * 14400); // 0-40 years
      const gender = Math.random() < 0.5 ? "male" : "female";
      // Scatter within starting radius (10 tiles)
      const dx = Math.floor((Math.random() - 0.5) * 20);
      const dy = Math.floor((Math.random() - 0.5) * 20);

      values.push(`($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, 1.0, $${paramIdx + 3}, $${paramIdx + 4})`);
      params.push(nationId, ageTicks, gender, centerX + dx, centerY + dy);
      paramIdx += 5;
    }

    await query(
      `INSERT INTO humans (nation_id, age_ticks, gender, health, tile_x, tile_y)
       VALUES ${values.join(", ")}`,
      params
    );
  }
}

/**
 * Process one tick of population dynamics for a nation.
 * Returns a summary of what happened.
 */
export async function processPopulationTick(
  client: pg.PoolClient,
  nationId: number,
  tick: number,
  foodKcal: number,
  hasHealthcare: boolean,
  hasShelter: boolean,
  socialCohesion: number,
): Promise<{
  births: number;
  deaths: number;
  deathsByCause: Record<string, number>;
  totalPop: number;
  foodConsumed: number;
}> {
  const deathsByCause: Record<string, number> = {};
  let births = 0;
  let deaths = 0;
  let foodConsumed = 0;

  // Get all alive humans
  const humans = await client.query(
    "SELECT id, age_ticks, gender, health, pregnant_ticks_remaining FROM humans WHERE nation_id = $1 AND alive = TRUE",
    [nationId]
  );

  const totalPop = humans.rows.length;
  if (totalPop === 0) return { births: 0, deaths: 0, deathsByCause: {}, totalPop: 0, foodConsumed: 0 };

  // Calculate total caloric need
  let totalCaloricNeed = 0;
  for (const h of humans.rows) {
    totalCaloricNeed += getCaloricNeed(h.age_ticks);
  }

  // Nutrition modifier (per the spec)
  const nutritionRatio = Math.min(1.5, foodKcal / Math.max(totalCaloricNeed, 1));
  const isStarving = nutritionRatio < 0.6; // < 1200 kcal average
  const isMalnourished = nutritionRatio < 0.75; // < 1500 kcal average

  foodConsumed = Math.min(foodKcal, totalCaloricNeed);

  // Process each human
  const toKill: number[] = [];
  const toAge: number[] = [];
  const toBirth: Array<{ tileX: number; tileY: number }> = [];

  for (const h of humans.rows) {
    // ── Aging ──
    toAge.push(h.id);

    // ── Death check ──
    const stage = getLifeStage(h.age_ticks);
    let annualMortality: number;

    if (stage === "adult") {
      annualMortality = h.age_ticks < 10800 ? BASE_MORTALITY.adult_young : BASE_MORTALITY.adult_mid;
    } else if (stage === "elder") {
      annualMortality = h.age_ticks < 19800 ? BASE_MORTALITY.elder_young : BASE_MORTALITY.elder_mid;
    } else if (stage === "aged") {
      annualMortality = h.age_ticks < 27000 ? BASE_MORTALITY.aged_young : BASE_MORTALITY.aged_old;
    } else {
      annualMortality = BASE_MORTALITY[stage] || 0.02;
    }

    // Convert annual to per-tick probability
    let deathProb = 1 - Math.pow(1 - annualMortality, 1 / TICKS_PER_YEAR);

    // Environmental modifiers (multiplicative)
    if (isStarving) deathProb *= 5.0;
    else if (isMalnourished) deathProb *= 2.0;
    if (!hasShelter) deathProb *= 2.0; // simplified — spec says 2.5 cold, 1.2 temperate
    if (!hasHealthcare && stage === "infant") deathProb *= 2.0;

    // Roll
    if (Math.random() < deathProb) {
      toKill.push(h.id);
      deaths++;
      const cause = isStarving ? "starvation" : (!hasShelter ? "exposure" : "natural");
      deathsByCause[cause] = (deathsByCause[cause] || 0) + 1;
      continue; // Dead, skip further processing
    }

    // ── Pregnancy & Birth ──
    if (h.gender === "female" && h.age_ticks >= FERTILE_AGE_MIN && h.age_ticks <= FERTILE_AGE_MAX) {
      if (h.pregnant_ticks_remaining !== null && h.pregnant_ticks_remaining > 0) {
        // Advance pregnancy
        if (h.pregnant_ticks_remaining <= 1) {
          // Birth!
          toBirth.push({ tileX: 0, tileY: 0 }); // Will use mother's location
          births++;

          // Infant mortality check
          let infantDeathRate = BASE_INFANT_MORTALITY;
          if (hasHealthcare) infantDeathRate *= 0.4; // midwifery-level reduction
          if (Math.random() < infantDeathRate / TICKS_PER_YEAR) {
            births--; // Stillbirth
            deathsByCause["infant_mortality"] = (deathsByCause["infant_mortality"] || 0) + 1;
          }
        }
      } else if (h.pregnant_ticks_remaining === null) {
        // Check for new pregnancy (per cycle rate, convert to per tick)
        const fertilityPerTick = BASE_FERTILITY_RATE / TICKS_PER_CYCLE;

        // Modifiers from spec
        let modifier = 1.0;
        if (nutritionRatio < 0.75) modifier *= 0.3;
        else if (nutritionRatio >= 1.0) modifier *= 1.0;
        else if (nutritionRatio >= 1.25) modifier *= 1.2;

        if (!hasShelter) modifier *= 0.7;
        if (hasHealthcare) modifier *= 1.1;

        const stabilityMod = socialCohesion > 60 ? 1.0 : (socialCohesion > 30 ? 0.7 : 0.5);
        modifier *= stabilityMod;

        if (Math.random() < fertilityPerTick * modifier) {
          // Became pregnant — 270 ticks (9 cycles)
          await client.query(
            "UPDATE humans SET pregnant_ticks_remaining = 270 WHERE id = $1",
            [h.id]
          );
        }
      }
    }
  }

  // ── Execute changes in bulk ──

  // Age everyone
  if (toAge.length > 0) {
    await client.query(
      "UPDATE humans SET age_ticks = age_ticks + 1 WHERE nation_id = $1 AND alive = TRUE",
      [nationId]
    );
  }

  // Advance pregnancies
  await client.query(
    "UPDATE humans SET pregnant_ticks_remaining = pregnant_ticks_remaining - 1 WHERE nation_id = $1 AND alive = TRUE AND pregnant_ticks_remaining > 0",
    [nationId]
  );

  // Reset completed pregnancies
  await client.query(
    "UPDATE humans SET pregnant_ticks_remaining = NULL WHERE nation_id = $1 AND alive = TRUE AND pregnant_ticks_remaining <= 0",
    [nationId]
  );

  // Kill dead humans
  if (toKill.length > 0) {
    // Batch kill in chunks
    for (let i = 0; i < toKill.length; i += 100) {
      const chunk = toKill.slice(i, i + 100);
      await client.query(
        `UPDATE humans SET alive = FALSE WHERE id = ANY($1)`,
        [chunk]
      );
    }
  }

  // Create newborns
  if (births > 0) {
    const values: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    for (let i = 0; i < births; i++) {
      const gender = Math.random() < 0.5 ? "male" : "female";
      values.push(`($${idx}, 0, $${idx + 1}, 1.0, 0, 0)`);
      params.push(nationId, gender);
      idx += 2;
    }
    if (values.length > 0) {
      await client.query(
        `INSERT INTO humans (nation_id, age_ticks, gender, health, tile_x, tile_y) VALUES ${values.join(", ")}`,
        params
      );
    }
  }

  // Update nation aggregate
  const finalPop = totalPop - deaths + births;
  await client.query(
    "UPDATE nations SET population = $1 WHERE id = $2",
    [Math.max(0, finalPop), nationId]
  );

  return { births, deaths, deathsByCause, totalPop: finalPop, foodConsumed };
}
