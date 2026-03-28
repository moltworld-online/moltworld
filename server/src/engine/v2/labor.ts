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

// ── Species-aware food production (Stage 2) ──

import { PLANT_SPECIES, ANIMAL_SPECIES, getClimateZone, getAdjacentZones } from "./species-data.js";

export interface TerritorySpecies {
  plants: Array<{ id: string; abundance: number }>;
  animals: Array<{ id: string; abundance: number }>;
}

/**
 * Calculate foraging yield based on what wild plants exist in territory.
 * Tropical territories with bananas/yams = higher yields.
 * Arctic territories with sparse berries = lower yields.
 */
export function calculateForagingYield(
  laborHours: number,
  plants: Array<{ id: string; abundance: number }>,
  season: string,
  climateZone: string,
  foragingSkill: number,
  hasForagingKnowledge: boolean,
): number {
  if (laborHours <= 0 || plants.length === 0) return 0;

  let baseKcal = 0;
  for (const sp of plants) {
    const def = PLANT_SPECIES.find(p => p.id === sp.id);
    if (!def || def.wild_kcal <= 0) continue;
    baseKcal += def.wild_kcal * sp.abundance;
  }

  // Season modifier (simplified: winter halves yield in non-tropical)
  let seasonMod = 1.0;
  if (climateZone !== "tropical") {
    if (season === "winter") seasonMod = 0.3;
    else if (season === "spring") seasonMod = 0.8;
    else if (season === "summer") seasonMod = 1.3;
    else seasonMod = 1.1; // autumn
  }

  const skillMod = 0.5 + foragingSkill * 0.75;
  const knowledgeMod = hasForagingKnowledge ? 1.5 : 1.0;

  return (laborHours / MAX_LABOR_HOURS) * baseKcal * skillMod * knowledgeMod * seasonMod;
}

/**
 * Calculate hunting yield based on what wild animals exist in territory.
 * Requires basic_hunting tech to hunt at all.
 */
export function calculateHuntingYield(
  laborHours: number,
  animals: Array<{ id: string; abundance: number }>,
  huntingSkill: number,
  hasBasicHunting: boolean,
): number {
  if (laborHours <= 0 || !hasBasicHunting || animals.length === 0) return 0;

  let baseKcal = 0;
  for (const sp of animals) {
    const def = ANIMAL_SPECIES.find(a => a.id === sp.id);
    if (!def || def.wild_hunt_kcal <= 0) continue;
    baseKcal += def.wild_hunt_kcal * sp.abundance * 0.1; // 10% hunt success base
  }

  const skillMod = 0.3 + huntingSkill * 0.85;
  return (laborHours / MAX_LABOR_HOURS) * baseKcal * skillMod;
}

/**
 * Aggregate species from all mesh cells a nation owns.
 * Deduplicates by species ID, sums abundance.
 */
export async function getTerritorySpecies(
  client: pg.PoolClient,
  nationId: number,
): Promise<TerritorySpecies> {
  const result = await client.query(
    `SELECT wild_species FROM mesh_cells WHERE owner_id = $1 AND jsonb_array_length(COALESCE(wild_species, '[]'::jsonb)) > 0`,
    [nationId]
  );

  const plantMap = new Map<string, number>();
  const animalMap = new Map<string, number>();

  for (const row of result.rows) {
    for (const sp of (row.wild_species || [])) {
      const id = sp.id;
      const abundance = sp.abundance || 1;
      const isPlant = PLANT_SPECIES.some(p => p.id === id);
      const map = isPlant ? plantMap : animalMap;
      map.set(id, Math.max(map.get(id) || 0, abundance)); // use max abundance, not sum
    }
  }

  return {
    plants: Array.from(plantMap.entries()).map(([id, abundance]) => ({ id, abundance })),
    animals: Array.from(animalMap.entries()).map(([id, abundance]) => ({ id, abundance })),
  };
}

/**
 * Calculate farming yield from cultivated crops.
 * Climate match matters: wrong zone = 0 yield. Irrigation extends by one band.
 */
export async function calculateCropFarmingYield(
  client: pg.PoolClient,
  nationId: number,
  farmingHours: number,
  farmingSkill: number,
  season: string,
  climateZone: string,
  hasIrrigation: boolean,
  hasFireTech: boolean,
): Promise<number> {
  if (farmingHours <= 0) return 0;

  // Get cultivated crops
  const crops = await client.query(
    "SELECT species_id, tiles_planted FROM national_crops WHERE nation_id = $1 AND tiles_planted > 0",
    [nationId]
  );

  if (crops.rows.length === 0) return 0;

  let totalKcal = 0;
  const adjacentZones = getAdjacentZones(climateZone);

  for (const crop of crops.rows) {
    const def = PLANT_SPECIES.find(p => p.id === crop.species_id);
    if (!def || def.cultivated_kcal <= 0) continue;

    // Climate match
    let climateMod = 0;
    if (def.climate_zones.includes(climateZone)) {
      climateMod = 1.0;
    } else if (def.climate_zones.some(z => adjacentZones.includes(z))) {
      climateMod = hasIrrigation ? 0.5 : 0.2; // adjacent zone, irrigation helps
    } else if (hasIrrigation) {
      climateMod = 0.15; // wrong zone but irrigated = marginal
    }

    if (climateMod === 0) continue;

    // Season modifier
    let seasonMod = 1.0;
    if (climateZone !== "tropical") {
      if (season === "winter" && !def.frost_tolerant) seasonMod = 0;
      else if (season === "winter" && def.frost_tolerant) seasonMod = 0.3;
      else if (season === "spring") seasonMod = 0.8;
      else if (season === "summer") seasonMod = 1.3;
      else seasonMod = 1.1; // autumn harvest
    }

    // Water need penalty (high water crops in dry areas)
    const waterMod = def.water_need === "high" && !hasIrrigation ? 0.5 : 1.0;

    totalKcal += def.cultivated_kcal * crop.tiles_planted * climateMod * seasonMod * waterMod;
  }

  const skillMod = 0.5 + farmingSkill * 0.75;
  const fireBonus = hasFireTech ? 1.3 : 1.0;
  return (farmingHours / MAX_LABOR_HOURS) * totalKcal * skillMod * fireBonus;
}

/**
 * Calculate domesticated herd yield — meat, milk, eggs per tick.
 * Also returns plow bonus (1.5x farming if nation has plow animals).
 * Herds grow ~2% per cycle (30 ticks) if fed.
 */
export async function processHerds(
  client: pg.PoolClient,
  nationId: number,
  tick: number,
): Promise<{ kcal: number; plowBonus: number; herdGrowth: Array<{ species: string; grew: number }> }> {
  const herds = await client.query(
    "SELECT species_id, herd_size FROM national_herds WHERE nation_id = $1 AND herd_size > 0",
    [nationId]
  );

  if (herds.rows.length === 0) return { kcal: 0, plowBonus: 1.0, herdGrowth: [] };

  let totalKcal = 0;
  let hasPlow = false;
  const growth: Array<{ species: string; grew: number }> = [];

  for (const herd of herds.rows) {
    const def = ANIMAL_SPECIES.find(a => a.id === herd.species_id);
    if (!def) continue;

    // Meat/milk/egg production per tick
    totalKcal += def.meat_kcal_per_tick * herd.herd_size;

    // Plow animals boost farming
    if (def.provides.includes("plow")) hasPlow = true;

    // Herd growth: ~2% per 30 ticks (1 cycle), minimum 1
    if (tick % 30 === 0 && herd.herd_size < 500) {
      const grew = Math.max(1, Math.floor(herd.herd_size * 0.02));
      await client.query(
        "UPDATE national_herds SET herd_size = herd_size + $1 WHERE nation_id = $2 AND species_id = $3",
        [grew, nationId, herd.species_id]
      );
      growth.push({ species: def.name, grew });
    }
  }

  return {
    kcal: totalKcal,
    plowBonus: hasPlow ? 1.5 : 1.0,
    herdGrowth: growth,
  };
}

/**
 * Get the primary climate zone for a nation's territory.
 */
export async function getNationClimateZone(
  client: pg.PoolClient,
  nationId: number,
): Promise<string> {
  const result = await client.query(
    `SELECT climate_zone, COUNT(*) as c FROM mesh_cells WHERE owner_id = $1 AND climate_zone IS NOT NULL GROUP BY climate_zone ORDER BY c DESC LIMIT 1`,
    [nationId]
  );
  return result.rows[0]?.climate_zone || "temperate";
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
