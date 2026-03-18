/**
 * End-to-end test for v2 engine.
 * Spawns agents, claims starting territory from mesh cells, runs a tick.
 */

import { query, transaction } from "../../db/pool.js";
import { generateStartingPopulation } from "./population.js";
import { claimStartingTerritory, getAllTerritoriesGeoJSON } from "./territory.js";
import { processTick } from "./tick-processor.js";
import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";

const SPAWN_POINTS: [number, number][] = [
  [36.3, 3.9],    // Algeria area
  [35.8, 107.8],  // China
  [41.2, -82.2],  // Ohio
  [-3.2, -56.6],  // Brazil
  [49.6, 28.6],   // Ukraine
];

async function test() {
  console.log("=== V2 Engine Test ===\n");

  // 1. Check mesh
  const meshCount = await query("SELECT COUNT(*) as c FROM mesh_cells WHERE cell_type = 'land'");
  console.log(`Mesh: ${meshCount.rows[0].c} land cells`);

  // 2. Wipe and spawn 5 test agents
  console.log("\nSpawning 5 test agents...");

  // Clean old data (respect FK order)
  await query("DELETE FROM humans");
  await query("UPDATE mesh_cells SET owner_id = NULL, claimed_tick = NULL");
  await query("DELETE FROM technologies");
  await query("UPDATE resource_deposits SET discovered_by = NULL");
  await query("TRUNCATE activity_log, resource_ledger, direct_messages, forum_posts, events, world_ticks, conflicts, active_conflicts, territory_claims, military_units, population_units, currencies, treaties, trade_offers CASCADE");
  await query("DELETE FROM nations");
  await query("UPDATE world_state SET tick = 0, year = 0, cycle = 0, season = 'spring'");
  await query("UPDATE world_config SET value = '0' WHERE key = 'current_tick'");

  for (let i = 0; i < 5; i++) {
    const [lat, lng] = SPAWN_POINTS[i];
    const name = `Agent-${String(i + 1).padStart(3, "0")}`;
    const apiKeyHash = await bcryptjs.hash(`mw_${nanoid(32)}`, 10);

    const result = await query(
      `INSERT INTO nations (name, api_key_hash, color, spawn_lat, spawn_lng, founding_lat, founding_lng,
        population, food_kcal, epoch, total_kp, social_cohesion, governance_type, territory_tiles)
       VALUES ($1, $2, $3, $4, $5, $4, $5, 1000, 0, 0, 0, 50, 'band', 0)
       RETURNING id`,
      [name, apiKeyHash, `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`, lat, lng]
    );
    const nationId = result.rows[0].id;

    // Generate 1000 individual humans
    await generateStartingPopulation(nationId, Math.floor(lng * 111), Math.floor(lat * 111));
    const humanCount = await query("SELECT COUNT(*) as c FROM humans WHERE nation_id = $1 AND alive = TRUE", [nationId]);

    // Claim starting territory from mesh
    const claimed = await claimStartingTerritory(nationId, lat, lng, 0);

    console.log(`  ${name}: ${humanCount.rows[0].c} humans, ${claimed.toFixed(0)} km² territory at ${lat}°N ${lng}°E`);
  }

  // 3. Run one tick
  console.log("\nRunning tick 1...");
  const tickResult = await processTick();
  console.log(`  Tick ${tickResult.tick}, ${tickResult.season}, Year ${tickResult.year}`);
  console.log(`  Nations processed: ${tickResult.nationReports.size}`);

  for (const [nationId, report] of tickResult.nationReports) {
    console.log(`  Nation #${nationId}: pop ${report.population.total}, births ${report.population.births}, deaths ${report.population.deaths}, food produced ${report.resources.foodProduced.toFixed(0)} kcal`);
  }

  // 4. Check territory GeoJSON
  const geojson = await getAllTerritoriesGeoJSON();
  console.log(`\nTerritory GeoJSON: ${geojson.features.length} cells claimed`);
  if (geojson.features.length > 0) {
    const sample = geojson.features[0];
    console.log(`  Sample: ${sample.properties.nation_name}, ${sample.properties.area_km2.toFixed(1)} km²`);
    console.log(`  Polygon points: ${sample.geometry.coordinates[0].length}`);
  }

  // 5. Check forum
  const posts = await query("SELECT COUNT(*) as c FROM forum_posts");
  console.log(`\nForum posts: ${posts.rows[0].c}`);

  console.log("\n=== V2 Test Complete ===");
  process.exit(0);
}

test().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
