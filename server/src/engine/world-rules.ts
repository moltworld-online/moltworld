/**
 * MoltWorld Rules Engine
 *
 * These are the hard laws of the simulation. No agent can violate them.
 * Pri enforces these through the world engine.
 */

export const WORLD_RULES = {
  // ── Population ──
  population: {
    startingPop: 1000,
    startingFood: 2000,
    foodPerPopPerTick: 0.1, // Each person eats 0.1 food per tick
    growthRateMax: 0.02, // 2% max growth per tick when food surplus
    starvationRate: 0.03, // 3% die per tick when food = 0
    minViable: 5, // Below this, nation collapses
  },

  // ── Territory ──
  territory: {
    maxClaimSizeKm2: 10000, // Max 10,000 km² per single claim
    minClaimSizeKm2: 10, // Min 10 km² (no micro-claims)
    costMineralsPerKm2: 0.5, // Minerals to claim
    costFoodPerKm2: 0.3, // Food to claim (settlers need supplies)
    maxClaimsPerTick: 1, // Only one territory claim per tick
    mustBeAdjacentAfterFirst: true, // After first claim, new claims must touch existing territory
  },

  // ── Building ──
  buildings: {
    farm: { minerals: 50, energy: 20, foodPerTick: 5, buildTicks: 2 },
    mine: { minerals: 100, energy: 50, mineralsPerTick: 3, buildTicks: 3 },
    oil_well: { minerals: 150, energy: 30, energyPerTick: 4, buildTicks: 4 },
    port: { minerals: 200, energy: 100, tradeBonus: 0.2, buildTicks: 5 },
    fortification: { minerals: 300, energy: 50, defenseMultiplier: 1.3, buildTicks: 4 },
    university: { minerals: 200, energy: 150, techPerTick: 2, buildTicks: 6 },
    factory: { minerals: 250, energy: 200, productionMultiplier: 1.5, buildTicks: 5 },
    barracks: { minerals: 150, energy: 80, recruitBonus: 0.3, buildTicks: 3 },
  },

  // ── Military ──
  military: {
    recruitCostMinerals: 10, // Per unit
    recruitCostFood: 5,
    recruitPopCost: 10, // Population consumed per unit
    upkeepFoodPerUnit: 0.5, // Food per military unit per tick
    maxRecruitPerTick: 50,
    desertsWhenNoFood: true, // Military disbands if nation has no food
  },

  // ── Combat ──
  combat: {
    defenderBonus: 1.15, // 15% base defender advantage
    fortificationBonus: 0.2, // Per fort level
    supplyLinePenaltyPerKm: 0.0001, // Attacker weakens over distance
    warExhaustionPerTick: 0.1, // 10% more expensive each tick at war
    moraleBreakThreshold: 0.1, // Below 10% morale = retreat
    maxWarDurationTicks: 50, // Forced ceasefire after 50 ticks
    populationCaptureRate: 0.1, // 10% of defender pop captured on loss
  },

  // ── Trade ──
  trade: {
    offerExpiryTicks: 10, // Trade offers expire after 10 ticks
    maxActiveOffers: 5, // Per nation
  },

  // ── Resources ──
  resources: {
    // Fresh Earth = abundant. Resources are everywhere, just in different concentrations.
    renewableRegrowthRate: {
      timber: 0.005, // 0.5% per tick
      fish: 0.01, // 1% per tick
      fresh_water: 0.02, // 2% per tick
      fertile_land: 0.001, // 0.1% per tick (soil is slow to recover)
    },
    depletionWarningThreshold: 0.3, // Pri warns when resource drops below 30%
  },

  // ── Diplomacy ──
  diplomacy: {
    treatyBreakInfluencePenalty: 500,
    warDeclarationInfluenceCost: 100,
    peacefulTickInfluenceGain: 1, // Gain 1 influence per peaceful tick
  },

  // ── Time ──
  time: {
    tickIntervalMs: 60000, // 1 minute per tick (compressed time: 1 tick ≈ 1 sim year)
    ticksPerDay: 1440,
  },
};

/**
 * Format rules as a string for the agent system prompt.
 */
export function rulesToPrompt(): string {
  const r = WORLD_RULES;
  return `
WORLD RULES (enforced by Pri — these cannot be broken):

POPULATION — YOUR 1000 PEOPLE:
You start with 1000 humans. They are raw, unformed, and know nothing. Random ages and genders.
They have no language, no skills, no tools, no shelter. They are standing on empty land.

SURVIVAL NEEDS (per person per tick):
- FOOD: 0.1 food/person/tick. Without food, 3% of your population dies per tick.
- WATER: Included in food calculation — claim territory with fresh water sources.
- SHELTER: People without shelter get sick faster. Builders construct housing.
- HEALTH: Without healers, disease spreads. Health decays 1% per tick without healers. Below 30% health = epidemic (10% death spike).

LABOR (assign working-age people using set_policy):
- FARMERS: Each farmer produces ~0.5 food/tick (more with education + fertile land). You need 1 farmer per 5 people minimum.
- MINERS: Each miner produces ~0.3 minerals/tick. You need minerals to build anything.
- BUILDERS: Construct farms, mines, housing, fortifications. More builders = faster construction.
- SOLDIERS: Defend territory. Recruited from working-age population. Cost: 10 minerals + 5 food each.
- TEACHERS: Educate children and workers. Each teacher can teach ~20 people. Education grows ~0.1% per tick per teacher.
- RESEARCHERS: Advance technology. Each researcher generates ~0.2 tech/tick. Tech unlocks better buildings.
- HEALERS: Keep population healthy. Each healer serves ~50 people. Without healers, health drops.
- IDLE: Unassigned workers produce nothing and grow unhappy.

REPRODUCTION:
- Requires: food surplus (>50% satisfaction), health (>40%), working-age women
- Birth rate: 8-20 per 1000 people per tick when conditions are met
- Children become working-age after ~15 ticks
- Elderly die naturally at higher rates

MOVEMENT & EXPANSION:
- Your population lives in your territory. They cannot teleport.
- Expanding territory costs ${r.territory.costMineralsPerKm2} minerals + ${r.territory.costFoodPerKm2} food per km² (settlers need supplies).
- New territory must be ADJACENT to existing territory (no distant colonies until you have ports).
- Moving population to new territory takes time. People walk.
- Ports allow overseas expansion (but require 200 minerals + 100 energy to build).

EDUCATION PROGRESSION:
- 0%: Primitive. Can only do basic gathering. Farming output is terrible.
- 10%: Basic agriculture. Can build simple structures.
- 25%: Organized labor. Farming/mining output doubles. Can build fortifications.
- 50%: Pre-industrial. Factories unlock. Trade becomes viable.
- 75%: Industrial. Major production bonuses. Universities accelerate research.
- 100%: Advanced. Maximum productivity across all sectors.

HAPPINESS (determines loyalty, birth rate, productivity):
= Food satisfaction (35%) + Shelter (20%) + Health (25%) + Education (20%)
- Below 30% happiness: unrest. People become idle, birth rate drops, soldiers may desert.
- Above 70% happiness: productivity bonus, higher birth rate, strong loyalty.

COLLAPSE CONDITIONS:
- Population drops below ${r.population.minViable}: nation ceases to exist.
- No food for 10 consecutive ticks: mass death event.
- Happiness below 10% for 5 ticks: revolution (population scatters, territory abandoned).

TERRITORY:
- Claiming land costs ${r.territory.costMineralsPerKm2} minerals + ${r.territory.costFoodPerKm2} food per km²
- Max claim size: ${r.territory.maxClaimSizeKm2.toLocaleString()} km² per claim
- Only 1 territory claim per tick
- After your first claim, new territory MUST be adjacent to existing territory
- You need resources to expand. Build farms and mines BEFORE trying to grow.

BUILDINGS (cost minerals + energy to build):
- Farm: 50 minerals, 20 energy → produces 5 food/tick
- Mine: 100 minerals, 50 energy → produces 3 minerals/tick
- Oil Well: 150 minerals, 30 energy → produces 4 energy/tick
- Port: 200 minerals, 100 energy → trade bonus
- Fortification: 300 minerals, 50 energy → 30% defense bonus
- University: 200 minerals, 150 energy → 2 tech/tick
- Factory: 250 minerals, 200 energy → 50% production bonus
- Barracks: 150 minerals, 80 energy → recruitment bonus

MILITARY:
- Recruiting costs 10 minerals + 5 food per unit, and 10 population
- Military units eat 0.5 food per tick (upkeep)
- No food = military deserts
- Max 50 recruits per tick

COMBAT:
- Wars play out over multiple ticks (not instant)
- Defenders get 15% base bonus + fortification bonus
- Attackers weaken over distance (supply lines)
- War exhaustion: costs increase 10% each tick of war
- If morale drops below 10%, your forces retreat
- Max war duration: 50 ticks, then forced ceasefire

RESOURCES:
- This is a FRESH, pristine Earth. Resources are abundant everywhere.
- Renewable resources regenerate slowly (timber, fish, water)
- Non-renewable resources (oil, iron, gold) deplete permanently
- Pri may reveal new deposits or destroy existing ones through natural events

DIPLOMACY:
- Breaking a treaty costs 500 influence
- Declaring war costs 100 influence
- Peaceful ticks earn 1 influence each
`.trim();
}
