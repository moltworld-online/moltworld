/**
 * World Constants — from moltworld_world_rules.md Section 1
 * These are IMMUTABLE. No agent, no code, no config can change them.
 */

// ── Time ──
export const TICKS_PER_CYCLE = 30;        // 1 cycle = 30 ticks (~1 month)
export const CYCLES_PER_YEAR = 12;         // 1 year = 12 cycles
export const TICKS_PER_YEAR = 360;         // 1 year = 360 ticks
export const TICKS_PER_ERA = 36000;        // 1 era = 100 years

// ── Human Fundamentals ──
export const ADULT_CALORIC_NEED = 2000;    // kcal per tick
export const ADULT_WATER_NEED = 3;         // liters per tick
export const MAX_LABOR_HOURS = 10;         // hours per tick
export const HUMAN_CARRY_CAPACITY = 25;    // kg over distance
export const WALKING_SPEED = 30;           // tiles/year without roads (5km/hr × 6hrs/day)
export const PREGNANCY_DURATION = 270;     // 9 cycles in ticks
export const MATURITY_AGE = 5400;          // 15 years in ticks
export const MAX_SLEEP_DEFICIT = 8;        // hours minimum sleep per tick

// ── Life Stages (age in ticks) ──
export const LIFE_STAGES = {
  infant:  { minAge: 0,    maxAge: 720,   laborCapacity: 0,    caloricNeed: 0.5, label: "Infant (0-2)" },
  child:   { minAge: 720,  maxAge: 2520,  laborCapacity: 0.15, caloricNeed: 0.65, label: "Child (3-7)" },
  youth:   { minAge: 2520, maxAge: 5040,  laborCapacity: 0.5,  caloricNeed: 0.85, label: "Youth (8-14)" },
  adult:   { minAge: 5040, maxAge: 16200, laborCapacity: 1.0,  caloricNeed: 1.0,  label: "Adult (15-45)" },
  elder:   { minAge: 16200,maxAge: 21600, laborCapacity: 0.6,  caloricNeed: 0.9,  label: "Elder (46-60)" },
  aged:    { minAge: 21600,maxAge: 99999, laborCapacity: 0.2,  caloricNeed: 0.8,  label: "Aged (61+)" },
} as const;

// ── Base Mortality (annual, converted to per-tick internally) ──
export const BASE_MORTALITY: Record<string, number> = {
  infant: 0.15,   // 15% annual
  child:  0.02,
  youth:  0.02,
  adult_young: 0.01,  // 15-30
  adult_mid:   0.02,  // 31-45
  elder_young: 0.04,  // 46-55
  elder_mid:   0.08,  // 56-65
  aged_young:  0.15,  // 66-75
  aged_old:    0.30,  // 76+
};

// ── Fertility ──
export const BASE_FERTILITY_RATE = 0.02;   // per cycle per fertile woman
export const FERTILE_AGE_MIN = 5400;        // 15 years in ticks
export const FERTILE_AGE_MAX = 15120;       // 42 years in ticks
export const BASE_INFANT_MORTALITY = 0.30;  // 30% without healthcare

// ── Territory ──
export const STARTING_TERRITORY_RADIUS = 10;  // tiles (circular, ~314 km²)
export const MIN_DENSITY_FOR_CONTROL = 0.5;    // humans per controlled tile
export const TERRITORY_DECAY_TICKS = 30;       // ticks before uncontrolled tile is lost
export const MIN_AGENT_SPACING = 500;          // tiles between agent starting positions

// ── Land Per Capita by Epoch ──
export const LAND_PER_CAPITA: Record<number, number> = {
  0: 2.0,    // Foraging
  1: 0.5,    // Early Agriculture
  2: 0.15,   // Organized Agriculture
  3: 0.05,   // Advanced Agriculture
  4: 0.02,   // Industrial Agriculture
  5: 0.01,   // Modern Agriculture
};

// ── Communication & Max Territory ──
export const COMMUNICATION_TECH: Record<string, { speed: number; maxRadius: number }> = {
  runners:         { speed: 5,     maxRadius: 50 },
  horseback:       { speed: 15,    maxRadius: 150 },
  signal_fires:    { speed: 30,    maxRadius: 200 },
  written_horse:   { speed: 15,    maxRadius: 300 },
  telegraph:       { speed: 1000,  maxRadius: 2000 },
  radio:           { speed: 10000, maxRadius: 10000 },
};

// ── Overextension Penalties ──
export const OVEREXTENSION_THRESHOLDS = [
  { ratio: 1.2, productivityLoss: 0,    revoltRisk: 0 },
  { ratio: 1.5, productivityLoss: 0.10, revoltRisk: 0.05 },
  { ratio: 2.0, productivityLoss: 0.25, revoltRisk: 0.15 },
  { ratio: 3.0, productivityLoss: 0.50, revoltRisk: 0.30 },
  // Above 3.0: territory auto-fragments
];

// ── Governance ──
export const DUNBAR_NUMBER = 150;
export const GOVERNANCE_TYPES = {
  band:      { maxPop: 150,    adminOverhead: 0,    label: "Band" },
  tribal:    { maxPop: 1000,   adminOverhead: 0.05, label: "Tribal" },
  chiefdom:  { maxPop: 10000,  adminOverhead: 0.10, label: "Chiefdom" },
  earlyState:{ maxPop: 100000, adminOverhead: 0.15, label: "Early State" },
  empire:    { maxPop: Infinity,adminOverhead: 0.20, label: "Empire/Nation" },
};

// ── Social Cohesion ──
export const SC_BASE_DRIFT = -1;  // per cycle (entropy)
export const SC_GOLDEN_AGE = 80;
export const SC_STABLE = 60;
export const SC_DISCONTENT = 40;
export const SC_UNREST = 20;
export const SC_COLLAPSE = 0;

// ── Seasons ──
export const SEASONS = ["spring", "summer", "autumn", "winter"] as const;
export type Season = typeof SEASONS[number];

export function getSeason(tick: number): Season {
  const cycleInYear = Math.floor((tick % TICKS_PER_YEAR) / TICKS_PER_CYCLE);
  if (cycleInYear < 3) return "spring";
  if (cycleInYear < 6) return "summer";
  if (cycleInYear < 9) return "autumn";
  return "winter";
}

// ── Resource Types ──
export const SURVIVAL_RESOURCES = ["food", "water", "shelter"] as const;
export const BASIC_RESOURCES = ["wood", "stone", "clay", "fiber", "animal_products"] as const;
export const ADVANCED_RESOURCES = ["copper_ore", "tin_ore", "iron_ore", "coal", "oil", "rare_earths"] as const;
export const ABSTRACT_RESOURCES = ["knowledge_points", "social_cohesion", "trade_credit"] as const;

// ── Technology Epochs ──
export const EPOCHS = [
  { id: 0, name: "Primitive",    kpRange: [10, 100],       minPop: 0 },
  { id: 1, name: "Neolithic",    kpRange: [100, 1000],     minPop: 200 },
  { id: 2, name: "Bronze Age",   kpRange: [1000, 10000],   minPop: 2000 },
  { id: 3, name: "Iron Age",     kpRange: [10000, 100000], minPop: 10000 },
  { id: 4, name: "Classical",    kpRange: [100000, 500000],minPop: 50000 },
  { id: 5, name: "Medieval",     kpRange: [500000, 2e6],   minPop: 100000 },
  { id: 6, name: "Renaissance",  kpRange: [2e6, 1e7],      minPop: 500000 },
  { id: 7, name: "Industrial",   kpRange: [1e7, 1e8],      minPop: 2e6 },
  { id: 8, name: "Modern",       kpRange: [1e8, 1e9],      minPop: 1e7 },
  { id: 9, name: "Information",  kpRange: [1e9, 1e11],     minPop: 5e7 },
] as const;

// ── Critical Early Technologies ──
export const EARLY_TECHS = [
  { id: "controlled_fire",      kpCost: 20,  prereqs: [],                    effect: "Cook food (+30% caloric value), warmth" },
  { id: "basic_shelter",        kpCost: 15,  prereqs: [],                    effect: "Reduces exposure mortality" },
  { id: "stone_toolmaking",     kpCost: 30,  prereqs: [],                    effect: "Tool multiplier 0.5 → 1.0" },
  { id: "foraging_knowledge",   kpCost: 25,  prereqs: [],                    effect: "+50% foraging yield" },
  { id: "basic_hunting",        kpCost: 40,  prereqs: ["stone_toolmaking"],  effect: "Access to animal protein" },
  { id: "water_purification",   kpCost: 50,  prereqs: ["controlled_fire"],   effect: "-80% waterborne disease" },
  { id: "basic_medicine",       kpCost: 80,  prereqs: ["foraging_knowledge"],effect: "-20% disease mortality" },
  { id: "language",             kpCost: 60,  prereqs: [],                    effect: "+50% teaching, +25% KP gen" },
  { id: "counting",             kpCost: 100, prereqs: ["language"],          effect: "Resource tracking, pop management" },
  { id: "plant_cultivation",    kpCost: 200, prereqs: ["foraging_knowledge"],effect: "Unlocks agriculture (Epoch 1)" },
  { id: "animal_domestication", kpCost: 300, prereqs: ["basic_hunting"],     effect: "Livestock, pack animals" },
] as const;

// ── Construction ──
export const STRUCTURES = {
  lean_to:     { labor: 20,    materials: { wood: 2 },                    shelterCap: 3,  lifespan: 360,   maintenance: 5 },
  hut:         { labor: 100,   materials: { wood: 10, fiber: 5 },        shelterCap: 5,  lifespan: 3600,  maintenance: 10 },
  longhouse:   { labor: 500,   materials: { wood: 50, stone: 10 },       shelterCap: 20, lifespan: 10800, maintenance: 30 },
  stone_house: { labor: 2000,  materials: { stone: 100, wood: 30 },      shelterCap: 8,  lifespan: 72000, maintenance: 15 },
  granary:     { labor: 300,   materials: { wood: 30, clay: 20 },        storeCap: 100000, lifespan: 18000, maintenance: 20 },
  well:        { labor: 500,   materials: { stone: 50 },                 waterCap: 50,   lifespan: 36000, maintenance: 10 },
  irrigation:  { labor: 2000,  materials: { stone: 100 },                farmBonus: 2.0, lifespan: 36000, maintenance: 100 },
  wall:        { labor: 5000,  materials: { stone: 500 },                defenseMult: 3.0, lifespan: 72000, maintenance: 200 },
  forge:       { labor: 1500,  materials: { stone: 200, clay: 100 },     enables: "metalworking", lifespan: 36000, maintenance: 50 },
  temple:      { labor: 10000, materials: { stone: 1000 },               scBonus: 10,    lifespan: 72000, maintenance: 100 },
  road_dirt:   { labor: 500,   materials: {},                            mobilityBonus: 2, lifespan: 18000, maintenance: 50 },
  road_paved:  { labor: 2000,  materials: { stone: 200 },               mobilityBonus: 4, lifespan: 36000, maintenance: 100 },
} as const;

// ── Military Equipment Factors ──
export const EQUIPMENT_FACTORS: Record<string, { factor: number; prereq: string }> = {
  unarmed:        { factor: 0.5,  prereq: "" },
  stone_weapons:  { factor: 1.0,  prereq: "stone_toolmaking" },
  bronze_weapons: { factor: 3.0,  prereq: "bronze_metallurgy" },
  iron_weapons:   { factor: 5.0,  prereq: "iron_smelting" },
  steel_weapons:  { factor: 8.0,  prereq: "steel_production" },
  gunpowder:      { factor: 15.0, prereq: "gunpowder" },
  rifles:         { factor: 30.0, prereq: "precision_engineering" },
  modern:         { factor: 100.0,prereq: "industrial_base" },
};

// ── Combat Terrain Modifiers (attacker perspective) ──
export const TERRAIN_MODIFIERS: Record<string, number> = {
  open_field: 1.0,
  forest:     0.7,
  mountain:   0.5,
  river:      0.6,
  walls:      0.3,
  urban:      0.4,
  surprise:   1.5,
};

// ── Climate ──
export const CARBON_THRESHOLDS = [
  { index: 100,  effect: "Pre-industrial normal" },
  { index: 250,  effect: "Mild warming: +5% rainfall variability" },
  { index: 500,  effect: "Significant warming: shifting biomes, +20% extreme weather" },
  { index: 750,  effect: "Severe: sea level rise, -30% crop yields in hot biomes" },
  { index: 1000, effect: "Catastrophic: massive sea level rise, desertification" },
];
