/**
 * Labor & Productivity Engine v2 — implements Section 7 of world rules
 *
 * Each adult provides 10 labor-hours per tick.
 * effective_labor = raw_hours × skill_level × tool_multiplier × morale_factor × health_factor
 */

import { MAX_LABOR_HOURS, ADULT_CALORIC_NEED, LIFE_STAGES } from "./constants.js";
import { getLaborCapacity } from "./population.js";
import type pg from "pg";

export interface LaborAllocation {
  foraging: number;
  farming: number;
  hunting: number;
  building: number;
  mining: number;
  research: number;
  military: number;
  teaching: number;
  healing: number;
  expansion: number;
  idle: number;
}

export interface ProductionResult {
  food_kcal: number;
  wood: number;
  stone: number;
  clay: number;
  fiber: number;
  animal_products: number;
  kp_generated: number;
  structures_progress: number; // labor-hours applied to construction
}

/**
 * Calculate total available labor-hours for a nation.
 */
export async function calculateAvailableLabor(
  client: pg.PoolClient,
  nationId: number,
  morale: number, // 0-1 from social cohesion
  avgHealth: number, // 0-1
): Promise<{ totalHours: number; workerCount: number }> {
  // Count alive humans by age group and sum labor capacity
  const result = await client.query(
    `SELECT age_ticks, health FROM humans WHERE nation_id = $1 AND alive = TRUE`,
    [nationId]
  );

  let totalHours = 0;
  let workerCount = 0;

  for (const h of result.rows) {
    const capacity = getLaborCapacity(h.age_ticks);
    if (capacity <= 0) continue;

    const hours = MAX_LABOR_HOURS * capacity * morale * Math.min(1.0, h.health);
    totalHours += hours;
    workerCount++;
  }

  return { totalHours, workerCount };
}

/**
 * Calculate food production from foragers/farmers.
 *
 * Foraging (Epoch 0): 10 hours → 1,500 kcal (barely self-sustaining)
 * Basic farming (Epoch 1): 10 hours → 6,000 kcal
 * Irrigated farming (Epoch 2): 10 hours → 15,000 kcal
 */
export function calculateFoodProduction(
  laborHours: number,
  epoch: number,
  avgFarmingSkill: number,
  hasIrrigation: boolean,
  seasonModifier: number,
  hasControlledFire: boolean,
): number {
  let baseOutput: number;

  if (epoch === 0) {
    baseOutput = 4000; // foraging per 10 labor-hours (realistic — a forager can gather enough for 2 people)
  } else if (epoch === 1) {
    baseOutput = 10000; // basic farming (one farmer feeds 5)
  } else if (epoch >= 2 && hasIrrigation) {
    baseOutput = 15000; // irrigated
  } else {
    baseOutput = 6000 * (1 + epoch * 0.3); // scales up
  }

  const skillMultiplier = 0.5 + avgFarmingSkill * 0.75; // 0.5 at skill 0, 2.0 at skill 2
  const fireBonus = hasControlledFire ? 1.3 : 1.0; // +30% caloric value from cooking

  return (laborHours / MAX_LABOR_HOURS) * baseOutput * skillMultiplier * seasonModifier * fireBonus;
}

/**
 * Calculate resource extraction (wood, stone, clay, etc.)
 *
 * extraction_per_tick = workers × skill_level × tool_multiplier × tile_richness × depletion_factor
 */
export function calculateExtraction(
  laborHours: number,
  avgSkill: number,
  toolMultiplier: number,
  tileRichness: number,
  depletionFactor: number,
): number {
  return (laborHours / MAX_LABOR_HOURS) * (0.1 + avgSkill) * toolMultiplier * tileRichness * depletionFactor;
}

/**
 * Get the season modifier for food production.
 */
export function getSeasonFoodModifier(season: string, biome: string): number {
  if (biome === "tropical") {
    return season === "summer" ? 1.3 : (season === "winter" ? 0.8 : 1.0);
  }
  // Temperate
  switch (season) {
    case "spring": return 1.2;
    case "summer": return 1.5;
    case "autumn": return 1.3; // harvest
    case "winter": return 0.0; // no growing
    default: return 1.0;
  }
}

/**
 * The Surplus Equation (Section 7.4):
 * surplus = total_production - survival_needs - maintenance_costs
 * Only surplus can be allocated to expansion, research, military, etc.
 */
export function calculateSurplus(
  totalFoodProduced: number,
  totalPopulation: number,
  maintenanceCosts: number,
): { surplus: number; inCrisis: boolean } {
  const survivalNeed = totalPopulation * ADULT_CALORIC_NEED; // Simplified — should use per-person need
  const surplus = totalFoodProduced - survivalNeed - maintenanceCosts;
  return { surplus, inCrisis: surplus < 0 };
}
