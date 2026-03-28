/**
 * Flora and fauna species definitions for MoltWorld.
 *
 * Species are tied to geographic regions and climate zones.
 * This is static data — no DB table needed.
 */

// ── Climate zones (derived from latitude) ──

export function getClimateZone(lat: number): string {
  const absLat = Math.abs(lat);
  if (absLat < 23.5) return "tropical";
  if (absLat < 35) return "subtropical";
  if (absLat < 55) return "temperate";
  if (absLat < 67) return "boreal";
  return "arctic";
}

export function getAdjacentZones(zone: string): string[] {
  const adj: Record<string, string[]> = {
    tropical: ["subtropical"],
    subtropical: ["tropical", "temperate"],
    temperate: ["subtropical", "boreal"],
    boreal: ["temperate", "arctic"],
    arctic: ["boreal"],
  };
  return adj[zone] || [];
}

// ── Plant Species ──

export interface PlantSpecies {
  id: string;
  name: string;
  category: "grain" | "tuber" | "fruit" | "legume" | "nut" | "fiber" | "vegetable";
  family: string;  // crop family for tech unlocking
  wild_kcal: number;       // kcal per abundance unit when foraging
  cultivated_kcal: number; // kcal per tile when farming
  climate_zones: string[];
  frost_tolerant: boolean;
  water_need: "low" | "medium" | "high";
}

export const PLANT_SPECIES: PlantSpecies[] = [
  // ── Grains (family: grain_cultivation) ──
  { id: "wild_wheat",   name: "Wild Wheat",   category: "grain", family: "grain_cultivation", wild_kcal: 800,  cultivated_kcal: 5000, climate_zones: ["temperate", "subtropical"], frost_tolerant: true,  water_need: "medium" },
  { id: "wild_barley",  name: "Wild Barley",  category: "grain", family: "grain_cultivation", wild_kcal: 700,  cultivated_kcal: 4500, climate_zones: ["temperate", "subtropical"], frost_tolerant: true,  water_need: "low" },
  { id: "rice",         name: "Wild Rice",    category: "grain", family: "grain_cultivation", wild_kcal: 600,  cultivated_kcal: 6000, climate_zones: ["tropical", "subtropical"],  frost_tolerant: false, water_need: "high" },
  { id: "maize",        name: "Wild Maize",   category: "grain", family: "grain_cultivation", wild_kcal: 500,  cultivated_kcal: 5500, climate_zones: ["tropical", "subtropical", "temperate"], frost_tolerant: false, water_need: "medium" },
  { id: "millet",       name: "Wild Millet",  category: "grain", family: "grain_cultivation", wild_kcal: 600,  cultivated_kcal: 3500, climate_zones: ["tropical", "subtropical"],  frost_tolerant: false, water_need: "low" },
  { id: "sorghum",      name: "Wild Sorghum", category: "grain", family: "grain_cultivation", wild_kcal: 550,  cultivated_kcal: 3800, climate_zones: ["tropical", "subtropical"],  frost_tolerant: false, water_need: "low" },
  { id: "oats",         name: "Wild Oats",    category: "grain", family: "grain_cultivation", wild_kcal: 500,  cultivated_kcal: 3200, climate_zones: ["temperate", "boreal"],      frost_tolerant: true,  water_need: "medium" },
  { id: "rye",          name: "Wild Rye",     category: "grain", family: "grain_cultivation", wild_kcal: 450,  cultivated_kcal: 3000, climate_zones: ["temperate", "boreal"],      frost_tolerant: true,  water_need: "low" },
  { id: "teff",         name: "Wild Teff",    category: "grain", family: "grain_cultivation", wild_kcal: 400,  cultivated_kcal: 2800, climate_zones: ["tropical", "subtropical"],  frost_tolerant: false, water_need: "low" },

  // ── Tubers (family: root_cultivation) ──
  { id: "potato",   name: "Wild Potato",  category: "tuber", family: "root_cultivation", wild_kcal: 600,  cultivated_kcal: 5500, climate_zones: ["temperate", "subtropical"],        frost_tolerant: true,  water_need: "medium" },
  { id: "yam",      name: "Wild Yam",     category: "tuber", family: "root_cultivation", wild_kcal: 500,  cultivated_kcal: 4000, climate_zones: ["tropical"],                       frost_tolerant: false, water_need: "medium" },
  { id: "taro",     name: "Wild Taro",    category: "tuber", family: "root_cultivation", wild_kcal: 450,  cultivated_kcal: 3800, climate_zones: ["tropical"],                       frost_tolerant: false, water_need: "high" },
  { id: "cassava",  name: "Wild Cassava", category: "tuber", family: "root_cultivation", wild_kcal: 700,  cultivated_kcal: 6000, climate_zones: ["tropical", "subtropical"],        frost_tolerant: false, water_need: "low" },

  // ── Fruit (family: fruit_cultivation) ──
  { id: "banana",     name: "Wild Banana",    category: "fruit", family: "fruit_cultivation", wild_kcal: 500,  cultivated_kcal: 3500, climate_zones: ["tropical"],                frost_tolerant: false, water_need: "high" },
  { id: "date_palm",  name: "Wild Date Palm", category: "fruit", family: "fruit_cultivation", wild_kcal: 600,  cultivated_kcal: 4000, climate_zones: ["subtropical", "tropical"], frost_tolerant: false, water_need: "low" },
  { id: "fig",        name: "Wild Fig",       category: "fruit", family: "fruit_cultivation", wild_kcal: 400,  cultivated_kcal: 2500, climate_zones: ["subtropical", "temperate"], frost_tolerant: true,  water_need: "low" },
  { id: "breadfruit", name: "Breadfruit",     category: "fruit", family: "fruit_cultivation", wild_kcal: 700,  cultivated_kcal: 4500, climate_zones: ["tropical"],                frost_tolerant: false, water_need: "medium" },
  { id: "olive",      name: "Wild Olive",     category: "fruit", family: "fruit_cultivation", wild_kcal: 350,  cultivated_kcal: 2000, climate_zones: ["subtropical", "temperate"], frost_tolerant: true,  water_need: "low" },

  // ── Legumes (family: legume_cultivation) ──
  { id: "lentil",    name: "Wild Lentil",    category: "legume", family: "legume_cultivation", wild_kcal: 500, cultivated_kcal: 3500, climate_zones: ["temperate", "subtropical"], frost_tolerant: true,  water_need: "low" },
  { id: "chickpea",  name: "Wild Chickpea",  category: "legume", family: "legume_cultivation", wild_kcal: 450, cultivated_kcal: 3200, climate_zones: ["subtropical", "temperate"], frost_tolerant: false, water_need: "low" },
  { id: "soybean",   name: "Wild Soybean",   category: "legume", family: "legume_cultivation", wild_kcal: 400, cultivated_kcal: 3800, climate_zones: ["temperate", "subtropical"], frost_tolerant: false, water_need: "medium" },

  // ── Nuts ──
  { id: "almond",   name: "Wild Almond",  category: "nut", family: "fruit_cultivation", wild_kcal: 500, cultivated_kcal: 2800, climate_zones: ["subtropical", "temperate"], frost_tolerant: true,  water_need: "low" },
  { id: "coconut",  name: "Coconut Palm", category: "nut", family: "fruit_cultivation", wild_kcal: 600, cultivated_kcal: 3500, climate_zones: ["tropical"],                frost_tolerant: false, water_need: "medium" },

  // ── Fiber (family: fiber_cultivation) ──
  { id: "cotton",  name: "Wild Cotton", category: "fiber", family: "fiber_cultivation", wild_kcal: 0,   cultivated_kcal: 0,    climate_zones: ["tropical", "subtropical"],  frost_tolerant: false, water_need: "medium" },
  { id: "flax",    name: "Wild Flax",   category: "fiber", family: "fiber_cultivation", wild_kcal: 100, cultivated_kcal: 500,  climate_zones: ["temperate", "subtropical"], frost_tolerant: true,  water_need: "medium" },
  { id: "hemp",    name: "Wild Hemp",   category: "fiber", family: "fiber_cultivation", wild_kcal: 100, cultivated_kcal: 400,  climate_zones: ["temperate", "subtropical"], frost_tolerant: true,  water_need: "medium" },

  // ── Vegetables (family: root_cultivation) ──
  { id: "squash", name: "Wild Squash", category: "vegetable", family: "root_cultivation", wild_kcal: 300, cultivated_kcal: 2000, climate_zones: ["tropical", "subtropical", "temperate"], frost_tolerant: false, water_need: "medium" },
  { id: "gourd",  name: "Wild Gourd",  category: "vegetable", family: "root_cultivation", wild_kcal: 200, cultivated_kcal: 1500, climate_zones: ["tropical", "subtropical"],             frost_tolerant: false, water_need: "low" },
];

// ── Animal Species ──

export interface AnimalSpecies {
  id: string;
  name: string;
  category: "large_herbivore" | "small_herbivore" | "bird" | "marine" | "pack_animal";
  family: string;  // domestication family for tech unlocking
  wild_hunt_kcal: number;     // kcal per successful hunt per abundance unit
  domesticable: boolean;
  meat_kcal_per_tick: number; // sustained yield when domesticated (per herd unit)
  provides: string[];         // what domesticated version provides
  climate_zones: string[];
}

export const ANIMAL_SPECIES: AnimalSpecies[] = [
  // ── Large herbivores (family: livestock_herding) ──
  { id: "aurochs",        name: "Aurochs",        category: "large_herbivore", family: "livestock_herding", wild_hunt_kcal: 2000, domesticable: true,  meat_kcal_per_tick: 300, provides: ["meat", "milk", "hide", "plow"], climate_zones: ["temperate", "subtropical"] },
  { id: "water_buffalo",  name: "Water Buffalo",   category: "large_herbivore", family: "livestock_herding", wild_hunt_kcal: 1800, domesticable: true,  meat_kcal_per_tick: 280, provides: ["meat", "milk", "plow"],        climate_zones: ["tropical", "subtropical"] },
  { id: "yak",            name: "Wild Yak",        category: "large_herbivore", family: "livestock_herding", wild_hunt_kcal: 1500, domesticable: true,  meat_kcal_per_tick: 250, provides: ["meat", "milk", "wool"],        climate_zones: ["boreal", "temperate"] },
  { id: "bison",          name: "Bison",           category: "large_herbivore", family: "livestock_herding", wild_hunt_kcal: 2200, domesticable: false, meat_kcal_per_tick: 0,   provides: ["meat", "hide"],               climate_zones: ["temperate", "boreal"] },
  { id: "elk",            name: "Elk",             category: "large_herbivore", family: "livestock_herding", wild_hunt_kcal: 1600, domesticable: false, meat_kcal_per_tick: 0,   provides: ["meat", "hide"],               climate_zones: ["temperate", "boreal"] },
  { id: "gazelle",        name: "Gazelle",         category: "large_herbivore", family: "livestock_herding", wild_hunt_kcal: 800,  domesticable: false, meat_kcal_per_tick: 0,   provides: ["meat", "hide"],               climate_zones: ["subtropical", "tropical"] },
  { id: "kangaroo",       name: "Kangaroo",        category: "large_herbivore", family: "livestock_herding", wild_hunt_kcal: 900,  domesticable: false, meat_kcal_per_tick: 0,   provides: ["meat", "hide"],               climate_zones: ["subtropical", "temperate"] },

  // ── Small herbivores (family: livestock_herding) ──
  { id: "mouflon",    name: "Mouflon (Wild Sheep)", category: "small_herbivore", family: "livestock_herding", wild_hunt_kcal: 600,  domesticable: true,  meat_kcal_per_tick: 150, provides: ["meat", "wool", "milk"],  climate_zones: ["temperate", "subtropical"] },
  { id: "wild_goat",  name: "Wild Goat",            category: "small_herbivore", family: "livestock_herding", wild_hunt_kcal: 500,  domesticable: true,  meat_kcal_per_tick: 130, provides: ["meat", "milk", "hide"],  climate_zones: ["temperate", "subtropical", "boreal"] },
  { id: "wild_boar",  name: "Wild Boar",            category: "small_herbivore", family: "pig_keeping",       wild_hunt_kcal: 700,  domesticable: true,  meat_kcal_per_tick: 200, provides: ["meat"],                  climate_zones: ["temperate", "subtropical", "tropical"] },
  { id: "reindeer",   name: "Reindeer",             category: "small_herbivore", family: "livestock_herding", wild_hunt_kcal: 1000, domesticable: true,  meat_kcal_per_tick: 200, provides: ["meat", "milk", "hide", "transport"], climate_zones: ["arctic", "boreal"] },

  // ── Pack/draft animals (family: horse_taming / camelid_taming) ──
  { id: "wild_horse",  name: "Wild Horse",  category: "pack_animal", family: "horse_taming",   wild_hunt_kcal: 800,  domesticable: true,  meat_kcal_per_tick: 100, provides: ["transport", "plow", "military"], climate_zones: ["temperate", "subtropical", "boreal"] },
  { id: "wild_donkey", name: "Wild Donkey", category: "pack_animal", family: "horse_taming",   wild_hunt_kcal: 500,  domesticable: true,  meat_kcal_per_tick: 80,  provides: ["transport"],                    climate_zones: ["subtropical"] },
  { id: "camel",       name: "Wild Camel",  category: "pack_animal", family: "camelid_taming", wild_hunt_kcal: 600,  domesticable: true,  meat_kcal_per_tick: 120, provides: ["transport", "milk"],             climate_zones: ["subtropical"] },
  { id: "llama",       name: "Wild Llama",  category: "pack_animal", family: "camelid_taming", wild_hunt_kcal: 400,  domesticable: true,  meat_kcal_per_tick: 100, provides: ["transport", "wool"],             climate_zones: ["temperate", "subtropical"] },
  { id: "alpaca",      name: "Wild Alpaca", category: "pack_animal", family: "camelid_taming", wild_hunt_kcal: 350,  domesticable: true,  meat_kcal_per_tick: 80,  provides: ["wool"],                         climate_zones: ["temperate", "subtropical"] },

  // ── Birds (family: poultry_keeping) ──
  { id: "jungle_fowl", name: "Jungle Fowl", category: "bird", family: "poultry_keeping", wild_hunt_kcal: 200,  domesticable: true,  meat_kcal_per_tick: 80,  provides: ["meat", "eggs"],   climate_zones: ["tropical", "subtropical"] },
  { id: "wild_turkey", name: "Wild Turkey",  category: "bird", family: "poultry_keeping", wild_hunt_kcal: 250,  domesticable: true,  meat_kcal_per_tick: 90,  provides: ["meat"],           climate_zones: ["temperate", "subtropical"] },

  // ── Marine (huntable only) ──
  { id: "seal",  name: "Seal",  category: "marine", family: "none", wild_hunt_kcal: 1200, domesticable: false, meat_kcal_per_tick: 0, provides: ["meat", "hide", "oil"], climate_zones: ["arctic", "boreal"] },
  { id: "whale", name: "Whale", category: "marine", family: "none", wild_hunt_kcal: 5000, domesticable: false, meat_kcal_per_tick: 0, provides: ["meat", "oil"],         climate_zones: ["arctic", "boreal", "temperate"] },
];

// ── Geographic distribution regions ──
// Same bounding box pattern as assign-resources-to-mesh.ts
// [south_lat, west_lng, north_lat, east_lng]

export interface SpeciesRegion {
  species_id: string;
  bounds: [number, number, number, number];
  abundance: number; // 1-10
}

export const SPECIES_REGIONS: SpeciesRegion[] = [
  // ══════ GRAINS ══════

  // Wild wheat — Fertile Crescent
  { species_id: "wild_wheat", bounds: [30, 32, 38, 48], abundance: 9 },
  // Also in Mediterranean
  { species_id: "wild_wheat", bounds: [34, -10, 44, 30], abundance: 5 },
  // Central Asia
  { species_id: "wild_wheat", bounds: [35, 50, 45, 75], abundance: 4 },

  // Wild barley — Fertile Crescent + Ethiopia
  { species_id: "wild_barley", bounds: [30, 32, 38, 48], abundance: 8 },
  { species_id: "wild_barley", bounds: [6, 36, 14, 42], abundance: 6 },
  { species_id: "wild_barley", bounds: [34, -10, 44, 20], abundance: 4 },

  // Rice — Yangtze valley, Southeast Asia, South Asia
  { species_id: "rice", bounds: [25, 108, 33, 122], abundance: 9 },
  { species_id: "rice", bounds: [9, 95, 25, 108], abundance: 8 },
  { species_id: "rice", bounds: [10, 72, 28, 92], abundance: 7 },
  { species_id: "rice", bounds: [-8, 95, 8, 120], abundance: 5 },

  // Maize — Mesoamerica
  { species_id: "maize", bounds: [14, -105, 25, -85], abundance: 9 },
  { species_id: "maize", bounds: [8, -85, 14, -75], abundance: 6 },

  // Millet — West Africa, North China
  { species_id: "millet", bounds: [8, -15, 18, 15], abundance: 8 },
  { species_id: "millet", bounds: [30, 100, 42, 120], abundance: 7 },
  { species_id: "millet", bounds: [15, 72, 28, 85], abundance: 6 },

  // Sorghum — Sub-Saharan Africa
  { species_id: "sorghum", bounds: [0, 15, 15, 40], abundance: 8 },
  { species_id: "sorghum", bounds: [8, -15, 18, 15], abundance: 7 },

  // Oats — Northern Europe
  { species_id: "oats", bounds: [50, -10, 65, 30], abundance: 6 },
  { species_id: "oats", bounds: [45, -5, 55, 15], abundance: 5 },

  // Rye — Eastern Europe, Central Asia
  { species_id: "rye", bounds: [48, 20, 60, 50], abundance: 6 },
  { species_id: "rye", bounds: [50, 50, 60, 80], abundance: 5 },

  // Teff — Ethiopian highlands
  { species_id: "teff", bounds: [6, 36, 14, 42], abundance: 8 },

  // ══════ TUBERS ══════

  // Potato — Andes
  { species_id: "potato", bounds: [-22, -76, -5, -68], abundance: 9 },
  { species_id: "potato", bounds: [-40, -75, -22, -65], abundance: 5 },

  // Yam — West Africa, Southeast Asia
  { species_id: "yam", bounds: [2, -10, 12, 15], abundance: 8 },
  { species_id: "yam", bounds: [-8, 95, 5, 120], abundance: 6 },

  // Taro — Southeast Asia, Pacific
  { species_id: "taro", bounds: [-10, 95, 20, 130], abundance: 7 },
  { species_id: "taro", bounds: [-20, 155, 0, 180], abundance: 5 },

  // Cassava — South America
  { species_id: "cassava", bounds: [-15, -70, 5, -40], abundance: 8 },
  { species_id: "cassava", bounds: [-5, -80, 10, -60], abundance: 6 },

  // ══════ FRUIT ══════

  // Banana — Southeast Asia
  { species_id: "banana", bounds: [-10, 95, 20, 130], abundance: 8 },
  { species_id: "banana", bounds: [-5, 28, 10, 42], abundance: 5 },

  // Date Palm — Middle East, North Africa
  { species_id: "date_palm", bounds: [20, -5, 35, 55], abundance: 8 },
  { species_id: "date_palm", bounds: [15, 35, 30, 50], abundance: 7 },

  // Fig — Mediterranean, Middle East
  { species_id: "fig", bounds: [30, -10, 42, 45], abundance: 7 },

  // Breadfruit — Pacific Islands, Southeast Asia
  { species_id: "breadfruit", bounds: [-20, 130, 20, 180], abundance: 7 },
  { species_id: "breadfruit", bounds: [-10, 95, 10, 130], abundance: 5 },

  // Olive — Mediterranean
  { species_id: "olive", bounds: [30, -10, 44, 40], abundance: 7 },

  // ══════ LEGUMES ══════

  // Lentil — Fertile Crescent, Mediterranean
  { species_id: "lentil", bounds: [30, 30, 40, 50], abundance: 8 },
  { species_id: "lentil", bounds: [34, -10, 44, 30], abundance: 5 },

  // Chickpea — Middle East, South Asia
  { species_id: "chickpea", bounds: [25, 30, 40, 75], abundance: 7 },

  // Soybean — East China, Manchuria
  { species_id: "soybean", bounds: [30, 110, 50, 135], abundance: 8 },
  { species_id: "soybean", bounds: [25, 100, 35, 115], abundance: 5 },

  // ══════ NUTS ══════

  // Almond — Mediterranean, Central Asia
  { species_id: "almond", bounds: [30, -10, 42, 45], abundance: 6 },
  { species_id: "almond", bounds: [32, 58, 42, 75], abundance: 5 },

  // Coconut — Tropical coasts
  { species_id: "coconut", bounds: [-15, 50, 15, 180], abundance: 6 },
  { species_id: "coconut", bounds: [-15, -80, 15, -35], abundance: 5 },

  // ══════ FIBER ══════

  // Cotton — South Asia, Mesoamerica
  { species_id: "cotton", bounds: [15, 68, 30, 85], abundance: 8 },
  { species_id: "cotton", bounds: [14, -105, 25, -85], abundance: 6 },

  // Flax — Fertile Crescent, Europe
  { species_id: "flax", bounds: [30, 30, 42, 50], abundance: 7 },
  { species_id: "flax", bounds: [45, -5, 55, 25], abundance: 5 },

  // Hemp — Central Asia
  { species_id: "hemp", bounds: [30, 60, 50, 90], abundance: 7 },

  // ══════ VEGETABLES ══════

  // Squash — Mesoamerica, Andes
  { species_id: "squash", bounds: [14, -105, 25, -85], abundance: 8 },
  { species_id: "squash", bounds: [-15, -78, 5, -65], abundance: 6 },

  // Gourd — Africa
  { species_id: "gourd", bounds: [-10, 10, 15, 40], abundance: 7 },

  // ══════ ANIMALS ══════

  // Aurochs — Europe, Middle East, Central/South Asia (broad range)
  { species_id: "aurochs", bounds: [35, -10, 60, 40], abundance: 7 },
  { species_id: "aurochs", bounds: [25, 30, 45, 80], abundance: 6 },
  { species_id: "aurochs", bounds: [20, 68, 35, 90], abundance: 5 },

  // Water buffalo — South/Southeast Asia
  { species_id: "water_buffalo", bounds: [10, 72, 30, 108], abundance: 7 },
  { species_id: "water_buffalo", bounds: [-8, 95, 20, 120], abundance: 6 },

  // Yak — Tibetan Plateau, Central Asian highlands
  { species_id: "yak", bounds: [28, 75, 40, 100], abundance: 7 },

  // Bison — North America Great Plains
  { species_id: "bison", bounds: [30, -110, 55, -90], abundance: 8 },

  // Elk — Northern hemisphere forests
  { species_id: "elk", bounds: [40, -130, 65, -100], abundance: 6 },
  { species_id: "elk", bounds: [50, 20, 65, 140], abundance: 5 },

  // Gazelle — Middle East, Africa
  { species_id: "gazelle", bounds: [10, -15, 35, 55], abundance: 6 },
  { species_id: "gazelle", bounds: [-5, 25, 15, 50], abundance: 5 },

  // Kangaroo — Australia
  { species_id: "kangaroo", bounds: [-38, 115, -12, 155], abundance: 8 },

  // Mouflon (wild sheep) — Middle East, Mediterranean
  { species_id: "mouflon", bounds: [30, 25, 42, 55], abundance: 7 },
  { species_id: "mouflon", bounds: [35, -10, 45, 25], abundance: 5 },

  // Wild goat — Middle East, Central Asia, Mediterranean
  { species_id: "wild_goat", bounds: [25, 30, 42, 75], abundance: 7 },
  { species_id: "wild_goat", bounds: [35, -10, 45, 25], abundance: 4 },

  // Wild boar — Eurasia-wide
  { species_id: "wild_boar", bounds: [25, -10, 60, 140], abundance: 6 },
  { species_id: "wild_boar", bounds: [-8, 95, 20, 120], abundance: 5 },

  // Reindeer — Arctic/subarctic
  { species_id: "reindeer", bounds: [55, -180, 75, 180], abundance: 6 },

  // Wild horse — Central Asian steppe
  { species_id: "wild_horse", bounds: [40, 50, 55, 90], abundance: 8 },
  { species_id: "wild_horse", bounds: [35, 25, 50, 55], abundance: 5 },

  // Wild donkey — Northeast Africa, Middle East
  { species_id: "wild_donkey", bounds: [10, 30, 25, 50], abundance: 6 },

  // Camel — Arabian/Central Asian deserts
  { species_id: "camel", bounds: [18, 25, 35, 60], abundance: 7 },
  { species_id: "camel", bounds: [35, 55, 45, 75], abundance: 5 },

  // Llama/Alpaca — Andes
  { species_id: "llama", bounds: [-22, -76, -5, -68], abundance: 8 },
  { species_id: "alpaca", bounds: [-22, -76, -10, -68], abundance: 7 },

  // Jungle fowl — South/Southeast Asia
  { species_id: "jungle_fowl", bounds: [5, 70, 28, 110], abundance: 7 },
  { species_id: "jungle_fowl", bounds: [-8, 95, 15, 125], abundance: 6 },

  // Wild turkey — North America
  { species_id: "wild_turkey", bounds: [20, -110, 45, -75], abundance: 6 },

  // Seal — Arctic/subarctic coasts
  { species_id: "seal", bounds: [55, -180, 80, 180], abundance: 6 },
  { species_id: "seal", bounds: [-70, -180, -55, 180], abundance: 5 },

  // Whale — Cold oceans
  { species_id: "whale", bounds: [50, -180, 75, 180], abundance: 4 },
  { species_id: "whale", bounds: [-65, -180, -45, 180], abundance: 4 },
];

// ── Default species by climate zone (for cells outside specific regions) ──

export const DEFAULT_SPECIES_BY_CLIMATE: Record<string, Array<{id: string, abundance: number}>> = {
  tropical: [
    { id: "yam", abundance: 3 },
    { id: "banana", abundance: 2 },
    { id: "gourd", abundance: 2 },
    { id: "wild_boar", abundance: 3 },
    { id: "jungle_fowl", abundance: 2 },
  ],
  subtropical: [
    { id: "wild_barley", abundance: 2 },
    { id: "fig", abundance: 2 },
    { id: "chickpea", abundance: 2 },
    { id: "gazelle", abundance: 3 },
    { id: "wild_goat", abundance: 2 },
  ],
  temperate: [
    { id: "oats", abundance: 2 },
    { id: "lentil", abundance: 2 },
    { id: "wild_boar", abundance: 3 },
    { id: "elk", abundance: 2 },
    { id: "wild_goat", abundance: 2 },
  ],
  boreal: [
    { id: "rye", abundance: 2 },
    { id: "elk", abundance: 3 },
    { id: "reindeer", abundance: 3 },
  ],
  arctic: [
    { id: "reindeer", abundance: 4 },
    { id: "seal", abundance: 4 },
  ],
};
