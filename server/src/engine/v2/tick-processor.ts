/**
 * Main Tick Processor v2 — orchestrates all world systems per tick.
 *
 * Each tick:
 * 1. Advance world clock (tick, cycle, year, season)
 * 2. For each nation: process population, labor, resources, research
 * 3. Process Pri (ecosystem, climate, disease, disasters)
 * 4. Generate world state reports for agents
 */

import { query, transaction } from "../../db/pool.js";
import { getSeason, TICKS_PER_CYCLE, TICKS_PER_YEAR } from "./constants.js";
import { processPopulationTick } from "./population.js";
import { processResearchTick, getDiscoveredTechs, hasTech } from "./knowledge.js";
import { calculateFoodProduction, getSeasonFoodModifier, calculateAvailableLabor } from "./labor.js";
import { processSkillDevelopment, getNationSkillAverages } from "./skill-development.js";
import { processStructureDecay } from "./construction.js";
import { processGovernanceTick } from "./governance.js";
import type pg from "pg";

export interface TickResult {
  tick: number;
  year: number;
  cycle: number;
  season: string;
  nationReports: Map<number, NationTickReport>;
}

export interface NationTickReport {
  nationId: number;
  population: { total: number; births: number; deaths: number; deathsByCause: Record<string, number> };
  resources: { foodProduced: number; foodConsumed: number; surplus: number };
  research: { kpGenerated: number; newDiscoveries: string[] };
  skills: Record<string, number>;
  warnings: string[];
}

export async function processTick(): Promise<TickResult> {
  return transaction(async (client) => {
    // ── 1. Advance world clock ──
    const worldState = await client.query(
      "UPDATE world_state SET tick = tick + 1 RETURNING tick"
    );
    const tick = worldState.rows[0].tick;
    const year = Math.floor(tick / TICKS_PER_YEAR);
    const cycle = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_CYCLE);
    const season = getSeason(tick);

    await client.query(
      "UPDATE world_state SET year = $1, cycle = $2, season = $3",
      [year, cycle, season]
    );

    // Also update the old world_config for backwards compatibility
    await client.query(
      "UPDATE world_config SET value = $1::text::jsonb WHERE key = 'current_tick'",
      [String(tick)]
    );
    await client.query(
      "INSERT INTO world_ticks (tick_number, summary) VALUES ($1, $2) ON CONFLICT (tick_number) DO UPDATE SET summary = $2",
      [tick, JSON.stringify({ year, cycle, season })]
    );

    // ── 2. Process each nation ──
    const nations = await client.query(
      "SELECT id, name, epoch, total_kp, social_cohesion, food_kcal, population FROM nations WHERE alive = TRUE"
    );

    const nationReports = new Map<number, NationTickReport>();

    for (const nation of nations.rows) {
      const report = await processNationTick(client, nation, tick, season);
      nationReports.set(nation.id, report);
    }

    return { tick, year, cycle, season, nationReports };
  });
}

async function processNationTick(
  client: pg.PoolClient,
  nation: Record<string, any>,
  tick: number,
  season: string,
): Promise<NationTickReport> {
  const warnings: string[] = [];
  const nationId = nation.id;

  // Get discovered techs
  const discoveredTechs = await getDiscoveredTechs(client, nationId);
  const hasFireTech = discoveredTechs.includes("controlled_fire");
  const hasShelterTech = discoveredTechs.includes("basic_shelter");
  const hasMedicineTech = discoveredTechs.includes("basic_medicine");
  const hasLanguageTech = discoveredTechs.includes("language");

  // Get labor availability
  const morale = Math.max(0.3, nation.social_cohesion / 100);
  const { totalHours, workerCount } = await calculateAvailableLabor(client, nationId, morale, 1.0);

  // ── Skill Development ──
  const skillEvents = await processSkillDevelopment(client, nationId, tick);
  for (const evt of skillEvents) {
    warnings.push(evt);
  }

  // Get real skill averages from the population
  const skills = await getNationSkillAverages(client, nationId);

  // ── Food Production (using real forager/farmer count and skills) ──
  const foragerCount = await client.query(
    "SELECT COUNT(*) as c FROM humans WHERE nation_id = $1 AND alive = TRUE AND task IN ('foraging', 'farming', 'hunting')",
    [nationId]
  );
  const foodWorkers = parseInt(foragerCount.rows[0]?.c || "0");
  const foodLaborHours = foodWorkers * 10; // 10 hours per worker per tick

  const seasonMod = getSeasonFoodModifier(season, "temperate");
  const avgFoodSkill = Math.max(skills.foraging, skills.farming);
  const foodProduced = calculateFoodProduction(
    foodLaborHours,
    nation.epoch,
    avgFoodSkill,
    false, // no irrigation yet
    seasonMod,
    hasFireTech,
  );

  // Update food stockpile
  await client.query(
    "UPDATE nations SET food_kcal = food_kcal + $1 WHERE id = $2",
    [foodProduced, nationId]
  );

  // ── Population ──
  const updatedFood = await client.query(
    "SELECT food_kcal FROM nations WHERE id = $1",
    [nationId]
  );
  const currentFood = updatedFood.rows[0]?.food_kcal || 0;

  const popResult = await processPopulationTick(
    client, nationId, tick,
    currentFood,
    hasMedicineTech,
    hasShelterTech,
    nation.social_cohesion,
  );

  // Deduct consumed food
  await client.query(
    "UPDATE nations SET food_kcal = GREATEST(0, food_kcal - $1) WHERE id = $2",
    [popResult.foodConsumed, nationId]
  );

  if (popResult.deaths > popResult.births) {
    warnings.push(`Population declining: ${popResult.deaths} deaths vs ${popResult.births} births`);
  }

  // ── Research ──
  const researchHours = totalHours * 0.05; // 5% of labor to research (default)
  const researcherCount = Math.max(1, Math.floor(workerCount * 0.05));
  const kpGenerated = researcherCount * 0.5 * (hasLanguageTech ? 1.25 : 1.0);

  const newDiscoveries = await processResearchTick(
    client, nationId, kpGenerated, null, discoveredTechs,
  );

  for (const disc of newDiscoveries) {
    // Post discovery to forum
    await client.query(
      `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
       VALUES ($1, $2, $3, 'news')`,
      [nationId, `Discovery! ${nation.name} has unlocked: ${disc}`, tick]
    );
  }

  // ── Governance & Social Cohesion ──
  const hasWriting = discoveredTechs.includes("counting");
  const govResult = await processGovernanceTick(
    client, nationId, tick, popResult.totalPop, hasWriting, 0
  );
  if (govResult.revoltOccurred) {
    warnings.push(`REVOLT! ${govResult.splinterPop} people broke away. Civil war casualties.`);
  }

  // ── Structure Maintenance & Decay ──
  const builderCount = await client.query(
    "SELECT COUNT(*) as c FROM humans WHERE nation_id = $1 AND alive = TRUE AND task = 'building'",
    [nationId]
  );
  const maintenanceLabor = parseInt(builderCount.rows[0]?.c || "0") * 2; // 2 hours/tick for maintenance
  const decayResult = await processStructureDecay(client, nationId, maintenanceLabor);
  if (decayResult.destroyed > 0) {
    warnings.push(`${decayResult.destroyed} structure(s) collapsed from neglect`);
  }

  // ── Life Events (children coming of age, notable deaths) ──
  const newAdults = await client.query(
    "SELECT id, gender FROM humans WHERE nation_id = $1 AND alive = TRUE AND age_ticks = 5040",
    [nationId]
  );
  if (newAdults.rows.length > 0) {
    warnings.push(`${newAdults.rows.length} youth have come of age and can now work`);
  }

  // ── Neighbor Detection ──
  if (tick % 10 === 0) { // Check every 10 ticks
    const { getKnownNations } = await import("./trade.js");
    const neighbors = await getKnownNations(client, nationId);
    const newNeighbors = neighbors.filter(n => {
      // Check if we've already detected them
      return n.distance < 300; // Close enough to notice
    });
    if (newNeighbors.length > 0 && tick <= 30) { // Only announce early on
      const names = newNeighbors.map(n => n.name).join(", ");
      warnings.push(`Scouts report other civilizations nearby: ${names}`);
    }
  }

  // ── Starvation warning ──
  const remainingFood = await client.query("SELECT food_kcal FROM nations WHERE id = $1", [nationId]);
  const foodRemaining = remainingFood.rows[0]?.food_kcal || 0;
  const ticksOfFood = popResult.totalPop > 0 ? Math.floor(foodRemaining / (popResult.totalPop * 2000)) : 0;
  if (ticksOfFood < 30) {
    warnings.push(`Food critical: ${ticksOfFood} ticks remaining (${(foodRemaining / 1000000).toFixed(1)}M kcal)`);
  }

  return {
    nationId,
    population: {
      total: popResult.totalPop,
      births: popResult.births,
      deaths: popResult.deaths,
      deathsByCause: popResult.deathsByCause,
    },
    resources: {
      foodProduced,
      foodConsumed: popResult.foodConsumed,
      surplus: foodProduced - popResult.foodConsumed,
    },
    research: {
      kpGenerated,
      newDiscoveries,
    },
    skills,
    warnings,
  };
}
