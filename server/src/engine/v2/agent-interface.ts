/**
 * Agent Interface Protocol v2 — implements Section 13 of world rules
 *
 * Defines the ActionBundle format agents submit and the WorldState report they receive.
 * All actions are validated against rules — violations return structured errors.
 */

import type pg from "pg";
import { getSeason } from "./constants.js";
import { getKnownNations } from "./trade.js";
import { getDiscoveredTechs } from "./knowledge.js";
import { getShelterCapacity, getStorageCapacity } from "./construction.js";

// ── Action Bundle (what agents submit) ──

export interface ActionBundle {
  tick: number;
  agent_id: number;
  actions: AgentAction[];
  forum_post?: string;
}

export type AgentAction =
  | { type: "ALLOCATE_LABOR"; assignments: LaborAssignment[] }
  | { type: "BUILD"; structure: string; tile_x: number; tile_y: number }
  | { type: "RESEARCH"; focus: string }
  | { type: "EXPAND"; direction: string; workers: number }
  | { type: "SET_POLICY"; policy: string; value: string }
  | { type: "DIPLOMACY"; target_agent: number; action: string; params: Record<string, unknown> }
  | { type: "MILITARY"; action: string; params: Record<string, unknown> }
  | { type: "RENAME"; name: string }
  | { type: "FORUM_POST"; content: string }
  | { type: "PLANT_CROP"; species_id: string; tiles: number }
  | { type: "DOMESTICATE_ANIMAL"; species_id: string }
  | { type: "PROPOSE_TRADE"; target_nation: number; offer: TradeItem[]; request: TradeItem[] }
  | { type: "ACCEPT_TRADE"; trade_id: number };

export interface TradeItem {
  type: "food_kcal" | "seeds" | "livestock" | "wood" | "stone";
  species_id?: string; // for seeds/livestock
  amount: number;
}

export interface LaborAssignment {
  task: string;
  workers: number;
  target?: string; // tile, building, etc.
}

// ── Validation Error ──

export interface ValidationError {
  action_index: number;
  error_code: string;
  message: string;
  constraint_violated: string;
  current_value?: unknown;
  max_allowed?: unknown;
  suggestion?: string;
}

// ── World State Report (what agents receive) ──

export interface WorldStateReport {
  tick: number;
  season: string;
  year: number;
  cycle: number;
  population: {
    total: number;
    by_stage: Record<string, number>;
    births_last_tick: number;
    deaths_last_tick: number;
    deaths_by_cause: Record<string, number>;
  };
  territory: {
    controlled_tiles: number;
    max_tiles: number;
    overextension: number;
  };
  resources: {
    food_kcal: number;
    wood: number;
    stone: number;
    water_access: boolean;
    food_production_per_tick: number;
    food_consumption_per_tick: number;
    ticks_of_food_remaining: number;
    climate_zone: string;
    territory_species: {
      wild_plants: Array<{ id: string; name: string; abundance: number; category: string }>;
      wild_animals: Array<{ id: string; name: string; abundance: number; domesticable: boolean }>;
    };
    cultivated_crops: Array<{ id: string; name: string; tiles: number; climate_match: string }>;
    available_crop_families: string[];
    domesticated_herds: Array<{ id: string; name: string; herd_size: number; provides: string[] }>;
    available_animal_families: string[];
  };
  knowledge: {
    total_kp: number;
    epoch: number;
    epoch_name: string;
    discovered_techs: string[];
    researching: string | null;
  };
  social: {
    cohesion: number;
    governance_type: string;
    revolt_risk: number;
  };
  labor: {
    total_workers: number;
    total_labor_hours: number;
    assignments: Record<string, number>;
    idle_workers: number;
  };
  military: {
    total_soldiers: number;
    strength: number;
    equipment_tier: string;
  };
  structures: Array<{
    type: string;
    completed: boolean;
    integrity: number;
    progress?: number;
  }>;
  diplomacy: {
    known_nations: Array<{ id: number; name: string; relations: number; distance: number }>;
    active_treaties: unknown[];
    incoming_proposals: unknown[];
    pending_trades: Array<{
      trade_id: number;
      from_nation: string;
      from_nation_id: number;
      offer: TradeItem[];
      request: TradeItem[];
      tick_proposed: number;
    }>;
  };
  pri_report: {
    season: string;
    warnings: string[];
    active_diseases: string[];
  };
  recent_errors: ValidationError[];
}

/**
 * Build a WorldState report for an agent.
 */
export async function buildWorldStateReport(
  client: pg.PoolClient,
  nationId: number,
  tick: number,
  lastTickReport?: {
    births: number;
    deaths: number;
    deathsByCause: Record<string, number>;
    foodProduced: number;
    foodConsumed: number;
  },
): Promise<WorldStateReport> {
  const nation = await client.query(
    `SELECT * FROM nations WHERE id = $1`,
    [nationId]
  );
  const n = nation.rows[0];
  if (!n) throw new Error(`Nation ${nationId} not found`);

  const season = getSeason(tick);
  const year = Math.floor(tick / 360);
  const cycle = Math.floor((tick % 360) / 30);

  // Population by stage
  const popByStage = await client.query(
    `SELECT
      COUNT(*) FILTER (WHERE age_ticks < 720) as infants,
      COUNT(*) FILTER (WHERE age_ticks >= 720 AND age_ticks < 2520) as children,
      COUNT(*) FILTER (WHERE age_ticks >= 2520 AND age_ticks < 5040) as youth,
      COUNT(*) FILTER (WHERE age_ticks >= 5040 AND age_ticks < 16200) as adults,
      COUNT(*) FILTER (WHERE age_ticks >= 16200 AND age_ticks < 21600) as elders,
      COUNT(*) FILTER (WHERE age_ticks >= 21600) as aged
     FROM humans WHERE nation_id = $1 AND alive = TRUE`,
    [nationId]
  );
  const stages = popByStage.rows[0] || {};

  // Labor assignments
  const laborCounts = await client.query(
    `SELECT task, COUNT(*) as count FROM humans WHERE nation_id = $1 AND alive = TRUE AND age_ticks >= 5040 GROUP BY task`,
    [nationId]
  );
  const assignments: Record<string, number> = {};
  let totalAssigned = 0;
  for (const r of laborCounts.rows) {
    assignments[r.task] = parseInt(r.count);
    if (r.task !== "idle") totalAssigned += parseInt(r.count);
  }

  // Discovered techs
  const techs = await getDiscoveredTechs(client, nationId);

  // Structures
  const structures = await client.query(
    "SELECT structure_type, completed, integrity, labor_invested, labor_required FROM structures WHERE nation_id = $1",
    [nationId]
  );

  // Known nations
  const knownNations = await getKnownNations(client, nationId);

  // Shelter capacity
  const shelterCap = await getShelterCapacity(client, nationId);

  // Food remaining calculation
  const foodPerTick = n.population * 2000; // simplified
  const ticksOfFood = foodPerTick > 0 ? Math.floor((n.food_kcal || 0) / foodPerTick) : 0;

  // Territory species and climate
  const { getTerritorySpecies, getNationClimateZone } = await import("./labor.js");
  const { PLANT_SPECIES, ANIMAL_SPECIES } = await import("./species-data.js");
  const territorySpecies = await getTerritorySpecies(client, nationId);
  const climateZone = await getNationClimateZone(client, nationId);

  const wildPlants = territorySpecies.plants.map(sp => {
    const def = PLANT_SPECIES.find(p => p.id === sp.id);
    return { id: sp.id, name: def?.name || sp.id, abundance: sp.abundance, category: def?.category || "unknown" };
  }).sort((a, b) => b.abundance - a.abundance).slice(0, 15);

  const wildAnimals = territorySpecies.animals.map(sp => {
    const def = ANIMAL_SPECIES.find(a => a.id === sp.id);
    return { id: sp.id, name: def?.name || sp.id, abundance: sp.abundance, domesticable: def?.domesticable || false };
  }).sort((a, b) => b.abundance - a.abundance).slice(0, 10);

  // Cultivated crops
  const { getAdjacentZones } = await import("./species-data.js");
  const cropsResult = await client.query(
    "SELECT species_id, tiles_planted FROM national_crops WHERE nation_id = $1 AND tiles_planted > 0",
    [nationId]
  ).catch(() => ({ rows: [] }));
  const cultivatedCrops = cropsResult.rows.map((c: any) => {
    const def = PLANT_SPECIES.find(p => p.id === c.species_id);
    let match = "none";
    if (def) {
      if (def.climate_zones.includes(climateZone)) match = "optimal";
      else if (def.climate_zones.some(z => getAdjacentZones(climateZone).includes(z))) match = "marginal";
    }
    return { id: c.species_id, name: def?.name || c.species_id, tiles: c.tiles_planted, climate_match: match };
  });

  // Which crop families could this nation research (have wild species for)?
  const cropFamilies = new Set<string>();
  for (const sp of territorySpecies.plants) {
    const def = PLANT_SPECIES.find(p => p.id === sp.id);
    if (def) cropFamilies.add(def.family);
  }
  const availableCropFamilies = Array.from(cropFamilies);

  // Domesticated herds
  const herdsResult = await client.query(
    "SELECT species_id, herd_size FROM national_herds WHERE nation_id = $1 AND herd_size > 0",
    [nationId]
  ).catch(() => ({ rows: [] }));
  const domesticatedHerds = herdsResult.rows.map((h: any) => {
    const def = ANIMAL_SPECIES.find(a => a.id === h.species_id);
    return { id: h.species_id, name: def?.name || h.species_id, herd_size: h.herd_size, provides: def?.provides || [] };
  });

  // Which animal families could this nation domesticate?
  const animalFamilies = new Set<string>();
  for (const sp of territorySpecies.animals) {
    const def = ANIMAL_SPECIES.find(a => a.id === sp.id);
    if (def && def.domesticable && def.family !== "none") animalFamilies.add(def.family);
  }
  const availableAnimalFamilies = Array.from(animalFamilies);

  // Pending trade offers
  const pendingTrades = await client.query(
    `SELECT t.id, t.proposer_id as from_nation_id, n.name as from_name, t.offer, t.request, t.tick_proposed
     FROM trade_offers t JOIN nations n ON t.proposer_id = n.id
     WHERE t.target_id = $1 AND t.status = 'pending'
     ORDER BY t.tick_proposed DESC LIMIT 10`,
    [nationId]
  ).catch(() => ({ rows: [] }));

  // Recent validation errors
  const errors = await client.query(
    `SELECT data FROM events WHERE event_type = 'agent_action_failed' AND data->>'nation_id' = $1::text ORDER BY created_at DESC LIMIT 5`,
    [String(nationId)]
  );

  const recentErrors: ValidationError[] = errors.rows.map((r, i) => ({
    action_index: i,
    error_code: "ACTION_FAILED",
    message: r.data?.error || "Unknown error",
    constraint_violated: r.data?.action || "unknown",
  }));

  // Pri warnings
  const priWarnings = await client.query(
    "SELECT content FROM forum_posts WHERE nation_id IS NULL AND post_type = 'news' AND content LIKE '[PRI]%' AND tick_number >= $1 - 5 ORDER BY created_at DESC LIMIT 3",
    [tick]
  );

  return {
    tick,
    season,
    year,
    cycle,
    population: {
      total: n.population,
      by_stage: {
        infants: parseInt(stages.infants || "0"),
        children: parseInt(stages.children || "0"),
        youth: parseInt(stages.youth || "0"),
        adults: parseInt(stages.adults || "0"),
        elders: parseInt(stages.elders || "0"),
        aged: parseInt(stages.aged || "0"),
      },
      births_last_tick: lastTickReport?.births || 0,
      deaths_last_tick: lastTickReport?.deaths || 0,
      deaths_by_cause: lastTickReport?.deathsByCause || {},
    },
    territory: {
      controlled_tiles: n.territory_tiles || 0,
      max_tiles: 0, // Calculated from pop + epoch
      overextension: n.overextension_ratio || 0,
    },
    resources: {
      food_kcal: n.food_kcal || 0,
      wood: n.wood || 0,
      stone: n.stone || 0,
      water_access: true, // Simplified for now
      food_production_per_tick: lastTickReport?.foodProduced || 0,
      food_consumption_per_tick: lastTickReport?.foodConsumed || 0,
      ticks_of_food_remaining: ticksOfFood,
      climate_zone: climateZone,
      territory_species: {
        wild_plants: wildPlants,
        wild_animals: wildAnimals,
      },
      cultivated_crops: cultivatedCrops,
      available_crop_families: availableCropFamilies,
      domesticated_herds: domesticatedHerds,
      available_animal_families: availableAnimalFamilies,
    },
    knowledge: {
      total_kp: n.total_kp || 0,
      epoch: n.epoch || 0,
      epoch_name: ["Primitive","Neolithic","Bronze Age","Iron Age","Classical","Medieval","Renaissance","Industrial","Modern","Information"][n.epoch || 0] || "Primitive",
      discovered_techs: techs,
      researching: null,
    },
    social: {
      cohesion: n.social_cohesion || 50,
      governance_type: n.governance_type || "band",
      revolt_risk: n.social_cohesion < 30 ? (30 - n.social_cohesion) * 0.02 : 0,
    },
    labor: {
      total_workers: parseInt(stages.adults || "0") + Math.floor(parseInt(stages.elders || "0") * 0.6),
      total_labor_hours: 0, // Calculated elsewhere
      assignments,
      idle_workers: assignments.idle || 0,
    },
    military: {
      total_soldiers: assignments.military || 0,
      strength: n.military_strength || 0,
      equipment_tier: "unarmed",
    },
    structures: structures.rows.map(s => ({
      type: s.structure_type,
      completed: s.completed,
      integrity: s.integrity,
      progress: s.completed ? undefined : s.labor_invested / s.labor_required,
    })),
    diplomacy: {
      known_nations: knownNations,
      active_treaties: [],
      incoming_proposals: [],
      pending_trades: pendingTrades.rows.map((t: any) => ({
        trade_id: t.id,
        from_nation: t.from_name,
        from_nation_id: t.from_nation_id,
        offer: t.offer,
        request: t.request,
        tick_proposed: t.tick_proposed,
      })),
    },
    pri_report: {
      season,
      warnings: priWarnings.rows.map(r => r.content),
      active_diseases: [],
    },
    recent_errors: recentErrors,
  };
}
