/**
 * Population Model — Every person in MoltWorld is simulated.
 *
 * When an agent spawns with 1000 people:
 * - Random ages (0-70, weighted toward young adults)
 * - Random genders (roughly 50/50)
 * - NO skills, NO language, NO education
 * - They need: food, water, shelter, healthcare, education
 * - They can: reproduce, learn, work, fight, migrate, die
 *
 * The agent must figure out:
 * - How to feed them (farming, fishing, foraging)
 * - How to shelter them (building)
 * - How to educate them (assign teachers, build schools)
 * - How to organize labor (who farms, who mines, who researches)
 * - How to defend them (military recruitment from working-age pop)
 * - How to grow (reproduction requires food surplus + housing)
 * - How to handle sickness, aging, death
 *
 * Population metrics the agent must track:
 * - Food satisfaction (0-1)
 * - Shelter satisfaction (0-1)
 * - Health (0-1)
 * - Education level (0-1)
 * - Happiness (derived from above)
 * - Productivity (derived from education + happiness + health)
 * - Birth rate (depends on food, health, housing)
 * - Death rate (depends on age, health, food)
 */

import { query } from "../db/pool.js";

export interface PopulationSnapshot {
  total: number;
  byAge: { children: number; working: number; elderly: number };
  byGender: { male: number; female: number };
  metrics: {
    food_satisfaction: number;   // 0-1: are people fed?
    shelter: number;             // 0-1: are people housed?
    health: number;              // 0-1: are people healthy?
    education: number;           // 0-1: how educated is the population?
    happiness: number;           // 0-1: derived from all above
    productivity: number;        // 0-1: how effective is labor?
    birth_rate: number;          // births per tick per 1000 people
    death_rate: number;          // deaths per tick per 1000 people
  };
  labor: {
    farmers: number;
    miners: number;
    builders: number;
    soldiers: number;
    teachers: number;
    researchers: number;
    healers: number;
    idle: number;
  };
}

/**
 * Generate initial population for a new nation.
 * 1000 people, random ages and genders, no skills.
 */
export function generateStartingPopulation(): {
  total: number;
  male: number;
  female: number;
  children: number; // 0-14
  working_age: number; // 15-60
  elderly: number; // 61+
  education_level: number;
  health_level: number;
  happiness: number;
} {
  let male = 0, female = 0;
  let children = 0, working = 0, elderly = 0;

  for (let i = 0; i < 1000; i++) {
    // Gender: ~50/50
    if (Math.random() < 0.5) male++; else female++;

    // Age: weighted toward young adults (15-40)
    const ageRoll = Math.random();
    if (ageRoll < 0.25) children++;       // 25% children (0-14)
    else if (ageRoll < 0.85) working++;   // 60% working age (15-60)
    else elderly++;                        // 15% elderly (61+)
  }

  return {
    total: 1000,
    male,
    female,
    children,
    working_age: working,
    elderly,
    education_level: 0.0,  // They know nothing
    health_level: 0.7,      // Reasonably healthy but primitive
    happiness: 0.5,          // Neutral — uncertain about their future
  };
}

/**
 * Process population for one tick.
 * Handles births, deaths, aging, education growth, happiness calc.
 */
export async function processPopulationTick(nationId: number, tick: number): Promise<void> {
  const nation = await query(
    `SELECT population, food_stockpile, energy_stockpile, minerals_stockpile,
            pop_male, pop_female, pop_children, pop_working, pop_elderly,
            pop_education, pop_health, pop_happiness,
            pop_farmers, pop_miners, pop_builders, pop_soldiers,
            pop_teachers, pop_researchers, pop_healers
     FROM nations WHERE id = $1`,
    [nationId]
  );

  if (nation.rows.length === 0) return;
  const n = nation.rows[0];
  const pop = n.population;

  // ── Food satisfaction ──
  const foodNeeded = pop * 0.1; // 0.1 food per person per tick
  const foodSat = Math.min(1.0, n.food_stockpile / foodNeeded);

  // ── Shelter (approximated by territory improvements) ──
  // TODO: track housing explicitly. For now, assume basic shelter exists.
  const shelter = Math.min(1.0, 0.3 + (n.pop_builders || 0) / Math.max(pop, 1) * 5);

  // ── Health ──
  const healerRatio = (n.pop_healers || 0) / Math.max(pop, 1);
  const healthBase = n.pop_health || 0.5;
  const healthDelta = (foodSat * 0.3 + healerRatio * 2 - 0.1); // Decays without healers
  const health = Math.max(0.1, Math.min(1.0, healthBase + healthDelta * 0.01));

  // ── Education ──
  const teacherRatio = (n.pop_teachers || 0) / Math.max(n.pop_children || 1, 1);
  const researcherRatio = (n.pop_researchers || 0) / Math.max(pop, 1);
  const eduBase = n.pop_education || 0.0;
  const eduGrowth = (teacherRatio * 0.5 + researcherRatio * 0.3) * 0.01; // Slow growth
  const education = Math.min(1.0, eduBase + eduGrowth);

  // ── Happiness ──
  const happiness = (foodSat * 0.35 + shelter * 0.2 + health * 0.25 + education * 0.2);

  // ── Productivity (how effective is labor) ──
  const productivity = (education * 0.4 + health * 0.3 + happiness * 0.3);

  // ── Birth rate (per 1000 people per tick) ──
  // Requires food surplus, working-age women, health
  const fertileFemales = Math.floor((n.pop_female || 500) * (n.pop_working || 600) / Math.max(pop, 1));
  const birthRate = foodSat > 0.5 ? (8 + happiness * 12) * (health * 0.8) : 2; // 8-20 per 1000 when fed
  const births = Math.floor(pop * birthRate / 1000);

  // ── Death rate ──
  const baseDeath = 5; // 5 per 1000 per tick (natural)
  const starvationDeaths = foodSat < 0.3 ? (1 - foodSat) * 30 : 0; // Up to 30 per 1000 if starving
  const healthDeaths = (1 - health) * 10; // Poor health increases deaths
  const deathRate = baseDeath + starvationDeaths + healthDeaths;
  const deaths = Math.floor(pop * deathRate / 1000);

  // ── Apply changes ──
  const newPop = Math.max(5, pop + births - deaths);
  const foodConsumed = Math.min(n.food_stockpile, foodNeeded);

  // Aging: rough approximation — shift some children to working, working to elderly
  const newChildren = Math.max(0, (n.pop_children || 250) + births - Math.floor(births * 0.1));
  const newElderly = Math.max(0, (n.pop_elderly || 150) + Math.floor((n.pop_working || 600) * 0.005) - Math.floor(deaths * 0.6));
  const newWorking = newPop - newChildren - newElderly;

  await query(
    `UPDATE nations SET
      population = $1,
      food_stockpile = GREATEST(0, food_stockpile - $2),
      pop_children = $3, pop_working = $4, pop_elderly = $5,
      pop_education = $6, pop_health = $7, pop_happiness = $8
     WHERE id = $9`,
    [newPop, foodConsumed, Math.max(0, newChildren), Math.max(0, newWorking), Math.max(0, newElderly),
     education, health, happiness, nationId]
  );
}
