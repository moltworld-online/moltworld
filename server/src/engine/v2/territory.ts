/**
 * Territory Engine v2 — Cell-based territory using Voronoi mesh
 *
 * Agents don't draw polygons. They claim mesh cells.
 * Expansion flows outward from owned cells to adjacent unclaimed cells.
 * The mesh cells already follow coastlines and terrain.
 */

import { query } from "../../db/pool.js";
import { LAND_PER_CAPITA, MIN_DENSITY_FOR_CONTROL, TERRITORY_DECAY_TICKS } from "./constants.js";
import type pg from "pg";

/**
 * Find the nearest unowned land cell to a coordinate.
 * Used for initial territory claim (agent spawn point → nearest cell).
 */
export async function findNearestCell(
  client: pg.PoolClient,
  lat: number,
  lng: number,
  cellType: string = "land",
): Promise<{ id: number; seed_lat: number; seed_lng: number; area_km2: number } | null> {
  // Find closest cell by seed point distance
  const result = await client.query(
    `SELECT id, seed_lat, seed_lng, area_km2
     FROM mesh_cells
     WHERE cell_type = $1 AND owner_id IS NULL
     ORDER BY (seed_lng - $2)*(seed_lng - $2) + (seed_lat - $3)*(seed_lat - $3)
     LIMIT 1`,
    [cellType, lng, lat]
  );
  return result.rows[0] || null;
}

/**
 * Claim a cell for a nation.
 */
export async function claimCell(
  client: pg.PoolClient,
  nationId: number,
  cellId: number,
  tick: number,
): Promise<{ success: boolean; error?: string; cell?: any }> {
  // Check cell exists and is unclaimed
  const cell = await client.query(
    "SELECT id, cell_type, owner_id, area_km2 FROM mesh_cells WHERE id = $1",
    [cellId]
  );

  if (cell.rows.length === 0) return { success: false, error: `Cell ${cellId} does not exist` };

  const c = cell.rows[0];

  if (c.cell_type === "water") {
    return { success: false, error: `Cell ${cellId} is water. Humans cannot live in the ocean.` };
  }

  if (c.owner_id !== null) {
    if (c.owner_id === nationId) {
      return { success: false, error: `You already own cell ${cellId}` };
    }
    const owner = await client.query("SELECT name FROM nations WHERE id = $1", [c.owner_id]);
    return { success: false, error: `Cell ${cellId} is owned by ${owner.rows[0]?.name || 'another nation'}. Negotiate or declare war.` };
  }

  // Check adjacency — must be next to an existing owned cell (except first claim)
  const ownedCells = await client.query(
    "SELECT COUNT(*) as c FROM mesh_cells WHERE owner_id = $1",
    [nationId]
  );

  if (parseInt(ownedCells.rows[0].c) > 0) {
    // Must be adjacent to existing territory
    const adjacent = await isAdjacentToTerritory(client, nationId, cellId);
    if (!adjacent) {
      return { success: false, error: `Cell ${cellId} is not adjacent to your territory. Expand outward from existing borders.` };
    }
  }

  // Check population cap
  const nation = await client.query(
    "SELECT population, epoch, territory_tiles FROM nations WHERE id = $1",
    [nationId]
  );
  const n = nation.rows[0];
  const currentTiles = n.territory_tiles || 0;
  const maxTiles = calculateMaxTerritory(n.population, n.epoch || 0);

  if (currentTiles + c.area_km2 > maxTiles) {
    return {
      success: false,
      error: `Population cap: ${n.population} people at Epoch ${n.epoch} can control max ${maxTiles.toFixed(0)} km². You have ${currentTiles.toFixed(0)} km². Grow population or advance technology.`,
    };
  }

  // Claim it
  await client.query(
    "UPDATE mesh_cells SET owner_id = $1, claimed_tick = $2 WHERE id = $3",
    [nationId, tick, cellId]
  );

  // Update nation territory count
  await client.query(
    "UPDATE nations SET territory_tiles = (SELECT COALESCE(SUM(area_km2), 0) FROM mesh_cells WHERE owner_id = $1) WHERE id = $1",
    [nationId]
  );

  return { success: true, cell: c };
}

/**
 * Get expansion candidates — unclaimed land cells adjacent to a nation's territory.
 * Returns them sorted by strategic value (closer to center = cheaper, resource-rich = more valuable).
 */
export async function getExpansionCandidates(
  client: pg.PoolClient,
  nationId: number,
  limit: number = 10,
): Promise<Array<{ id: number; seed_lat: number; seed_lng: number; area_km2: number; distance: number }>> {
  // Find all owned cells' seed points
  const owned = await client.query(
    "SELECT AVG(seed_lng) as center_lng, AVG(seed_lat) as center_lat FROM mesh_cells WHERE owner_id = $1",
    [nationId]
  );

  if (owned.rows.length === 0 || owned.rows[0].center_lng === null) return [];

  const centerLng = owned.rows[0].center_lng;
  const centerLat = owned.rows[0].center_lat;

  // Find unowned land cells near owned territory
  // Using a distance-based approach since we don't have spatial adjacency precomputed
  const candidates = await client.query(
    `SELECT mc.id, mc.seed_lat, mc.seed_lng, mc.area_km2,
            ((mc.seed_lng - $2)*(mc.seed_lng - $2) + (mc.seed_lat - $3)*(mc.seed_lat - $3)) as dist_sq
     FROM mesh_cells mc
     WHERE mc.cell_type = 'land'
     AND mc.owner_id IS NULL
     AND EXISTS (
       SELECT 1 FROM mesh_cells owned
       WHERE owned.owner_id = $1
       AND ((owned.seed_lng - mc.seed_lng)*(owned.seed_lng - mc.seed_lng) +
            (owned.seed_lat - mc.seed_lat)*(owned.seed_lat - mc.seed_lat)) < 1.0
     )
     ORDER BY dist_sq
     LIMIT $4`,
    [nationId, centerLng, centerLat, limit]
  );

  return candidates.rows.map(r => ({
    id: r.id,
    seed_lat: r.seed_lat,
    seed_lng: r.seed_lng,
    area_km2: r.area_km2,
    distance: Math.sqrt(r.dist_sq) * 111, // Approximate km
  }));
}

/**
 * Check if a cell is adjacent to a nation's territory.
 * "Adjacent" = within ~0.8° of any owned cell's seed point.
 */
async function isAdjacentToTerritory(
  client: pg.PoolClient,
  nationId: number,
  cellId: number,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM mesh_cells target, mesh_cells owned
     WHERE target.id = $2
     AND owned.owner_id = $1
     AND ((owned.seed_lng - target.seed_lng)*(owned.seed_lng - target.seed_lng) +
          (owned.seed_lat - target.seed_lat)*(owned.seed_lat - target.seed_lat)) < 0.64
     LIMIT 1`,
    [nationId, cellId]
  );
  return result.rows.length > 0;
}

/**
 * Calculate maximum territory a nation can control based on population and epoch.
 */
export function calculateMaxTerritory(population: number, epoch: number): number {
  const landPerCapita = LAND_PER_CAPITA[epoch] || LAND_PER_CAPITA[0];
  // Max territory = population × land_per_capita × 2 (buffer for non-food land)
  return population * landPerCapita * 2;
}

/**
 * Get a nation's territory as GeoJSON for rendering.
 */
export async function getTerritoryGeoJSON(
  client: pg.PoolClient,
  nationId: number,
): Promise<any> {
  const cells = await client.query(
    `SELECT mc.id, mc.polygon, mc.area_km2, mc.seed_lat, mc.seed_lng, mc.biome, mc.ecosystem_health,
            n.name as nation_name, n.color as nation_color
     FROM mesh_cells mc
     JOIN nations n ON mc.owner_id = n.id
     WHERE mc.owner_id = $1`,
    [nationId]
  );

  const features = cells.rows.map(c => ({
    type: "Feature",
    properties: {
      cell_id: c.id,
      nation_name: c.nation_name,
      nation_color: c.nation_color,
      area_km2: c.area_km2,
      biome: c.biome,
      ecosystem_health: c.ecosystem_health,
    },
    geometry: {
      type: "Polygon",
      coordinates: c.polygon,
    },
  }));

  return { type: "FeatureCollection", features };
}

/**
 * Get ALL owned territory cells as GeoJSON (for the map).
 */
export async function getAllTerritoriesGeoJSON(): Promise<any> {
  const cells = await query(
    `SELECT mc.id, mc.polygon, mc.area_km2, mc.owner_id, mc.claimed_tick,
            n.name as nation_name, n.color as nation_color
     FROM mesh_cells mc
     JOIN nations n ON mc.owner_id = n.id
     WHERE mc.owner_id IS NOT NULL`
  );

  const features = cells.rows.map(c => ({
    type: "Feature",
    properties: {
      claim_id: c.id,
      cell_id: c.id,
      nation_id: c.owner_id,
      nation_name: c.nation_name,
      nation_color: c.nation_color,
      area_sq_km: c.area_km2,
      area_km2: c.area_km2,
      claimed_tick: c.claimed_tick || 0,
      improvements: [],
    },
    geometry: {
      type: "Polygon",
      coordinates: c.polygon,
    },
  }));

  return { type: "FeatureCollection", features };
}

/**
 * Auto-claim starting territory for a new agent.
 * Claims the nearest ~314 km² of land cells around spawn point.
 */
export async function claimStartingTerritory(
  nationId: number,
  spawnLat: number,
  spawnLng: number,
  tick: number,
): Promise<number> {
  let totalClaimed = 0;
  const targetArea = 314; // ~radius 10 tiles = π×10² ≈ 314 km²

  // Find and claim cells outward from spawn, up to target area
  let claimed = 0;
  while (totalClaimed < targetArea) {
    const cell = await query(
      `SELECT id, area_km2 FROM mesh_cells
       WHERE cell_type = 'land' AND owner_id IS NULL
       AND ((seed_lng - $1)*(seed_lng - $1) + (seed_lat - $2)*(seed_lat - $2)) < 4.0
       ORDER BY ((seed_lng - $1)*(seed_lng - $1) + (seed_lat - $2)*(seed_lat - $2))
       LIMIT 1`,
      [spawnLng, spawnLat]
    );

    if (cell.rows.length === 0) break;

    await query(
      "UPDATE mesh_cells SET owner_id = $1, claimed_tick = $2 WHERE id = $3",
      [nationId, tick, cell.rows[0].id]
    );

    totalClaimed += cell.rows[0].area_km2;
    claimed++;

    if (claimed > 50) break; // Safety limit
  }

  // Update territory count
  await query(
    "UPDATE nations SET territory_tiles = $1 WHERE id = $2",
    [Math.floor(totalClaimed), nationId]
  );

  // Post claim announcement
  await query(
    `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
     VALUES ($1, $2, $3, 'claim_announcement')`,
    [nationId, `Territory established: ${Math.floor(totalClaimed)} km² of land claimed (${claimed} cells). Our people have a home.`, tick]
  );

  return totalClaimed;
}
