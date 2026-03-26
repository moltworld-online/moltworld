/**
 * Initialize a newly created nation with starting population, techs, food, and territory.
 * Called by onboarding after the nation row is inserted.
 */

import { query, getOne } from "../../db/pool.js";
import { generateStartingPopulation } from "./population.js";
import { claimStartingTerritory } from "./territory.js";

export async function initializeNation(nationId: number): Promise<{ humans: number; territory_km2: number }> {
  // Get nation's spawn point (or pick a random land cell)
  const nation = await getOne<{ spawn_lat: number; spawn_lng: number }>(
    "SELECT spawn_lat, spawn_lng FROM nations WHERE id = $1",
    [nationId]
  );

  let lat = nation?.spawn_lat;
  let lng = nation?.spawn_lng;

  // If no spawn point set, pick a random unclaimed land cell
  if (!lat || !lng) {
    const cell = await getOne<{ seed_lat: number; seed_lng: number }>(
      `SELECT seed_lat, seed_lng FROM mesh_cells
       WHERE owner_id IS NULL AND is_land = TRUE
       ORDER BY RANDOM() LIMIT 1`
    );
    if (!cell) throw new Error("No unclaimed land cells available");
    lat = cell.seed_lat;
    lng = cell.seed_lng;
    await query(
      "UPDATE nations SET spawn_lat = $1, spawn_lng = $2, founding_lat = $1, founding_lng = $2 WHERE id = $3",
      [lat, lng, nationId]
    );
  }

  // Set starting resources
  await query(
    `UPDATE nations SET
      population = 1000, food_kcal = 720000000,
      wood = 500, stone = 200,
      epoch = 0, total_kp = 0, social_cohesion = 50,
      governance_type = 'band', alive = TRUE
    WHERE id = $1`,
    [nationId]
  );

  // Generate 1000 individual humans
  const tileX = Math.floor(lng * 111 * Math.cos((lat * Math.PI) / 180));
  const tileY = Math.floor(lat * 111);
  await generateStartingPopulation(nationId, tileX, tileY);

  // Grant starter technologies
  for (const tech of ["controlled_fire", "basic_shelter", "foraging_knowledge"]) {
    await query(
      `INSERT INTO technologies (nation_id, tech_id, kp_invested, discovered, discovered_tick)
       VALUES ($1, $2, 100, TRUE, 0) ON CONFLICT DO NOTHING`,
      [nationId, tech]
    );
  }

  // Claim starting territory (~314 km²)
  const claimedKm2 = await claimStartingTerritory(nationId, lat, lng, 0);

  // Get actual human count
  const humanCount = await getOne<{ c: string }>(
    "SELECT COUNT(*) as c FROM humans WHERE nation_id = $1 AND alive = TRUE",
    [nationId]
  );

  return {
    humans: parseInt(humanCount?.c || "0"),
    territory_km2: claimedKm2,
  };
}
