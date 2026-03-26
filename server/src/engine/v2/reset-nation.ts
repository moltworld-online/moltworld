/**
 * Reset a nation with proper starting conditions.
 * Usage: npx tsx src/engine/v2/reset-nation.ts <nation_id>
 */
import { query, getOne } from "../../db/pool.js";
import { generateStartingPopulation } from "./population.js";
import { claimStartingTerritory } from "./territory.js";
import crypto from "crypto";

const nationId = parseInt(process.argv[2]);
if (!nationId) {
  console.error("Usage: npx tsx src/engine/v2/reset-nation.ts <nation_id>");
  process.exit(1);
}

async function reset() {
  console.log(`Resetting nation #${nationId}...`);

  const nation = await getOne<{ id: number; name: string; user_id: number; founding_lat: number; founding_lng: number }>(
    "SELECT id, name, user_id, founding_lat, founding_lng FROM nations WHERE id = $1",
    [nationId]
  );
  if (!nation) {
    console.error(`Nation #${nationId} not found`);
    process.exit(1);
  }
  console.log(`Found: ${nation.name} (user ${nation.user_id})`);

  // Clear old data
  await query("DELETE FROM humans WHERE nation_id = $1", [nationId]);
  await query("DELETE FROM technologies WHERE nation_id = $1", [nationId]);
  await query("DELETE FROM structures WHERE nation_id = $1", [nationId]);
  await query("UPDATE mesh_cells SET owner_id = NULL WHERE owner_id = $1", [nationId]);
  console.log("Cleared old data");

  // Pick spawn location if not set
  let lat = nation.founding_lat;
  let lng = nation.founding_lng;
  if (!lat || !lng) {
    const cell = await getOne<{ seed_lat: number; seed_lng: number }>(
      "SELECT seed_lat, seed_lng FROM mesh_cells WHERE owner_id IS NULL AND cell_type = 'land' ORDER BY RANDOM() LIMIT 1"
    );
    if (!cell) throw new Error("No unclaimed land cells");
    lat = cell.seed_lat;
    lng = cell.seed_lng;
    await query("UPDATE nations SET founding_lat = $1, founding_lng = $2 WHERE id = $3", [lat, lng, nationId]);
  }

  // Reset nation stats (only columns that exist in production schema)
  await query(
    `UPDATE nations SET
      alive = TRUE, population = 1000, food_kcal = 720000000,
      epoch = 0, total_kp = 0, social_cohesion = 50,
      governance_type = 'band', territory_tiles = 0, military_strength = 0
    WHERE id = $1`,
    [nationId]
  );
  console.log("Reset nation stats");

  // Generate 1000 humans using the proper function
  const tileX = Math.floor(lng * 111 * Math.cos((lat * Math.PI) / 180));
  const tileY = Math.floor(lat * 111);
  await generateStartingPopulation(nationId, tileX, tileY);

  const humanCount = await getOne<{ c: string }>(
    "SELECT COUNT(*) as c FROM humans WHERE nation_id = $1 AND alive = TRUE", [nationId]
  );
  console.log(`Created ${humanCount?.c} humans`);

  // Grant starter technologies
  for (const tech of ["controlled_fire", "basic_shelter", "foraging_knowledge"]) {
    await query(
      `INSERT INTO technologies (nation_id, tech_id, kp_invested, discovered, discovered_tick)
       VALUES ($1, $2, 100, TRUE, 0) ON CONFLICT DO NOTHING`,
      [nationId, tech]
    );
  }
  console.log("Added starter technologies");

  // Claim starting territory
  const claimedKm2 = await claimStartingTerritory(nationId, lat, lng, 0);
  console.log(`Claimed ${claimedKm2.toFixed(0)} km² territory near (${lat}, ${lng})`);

  // Generate new API key and store it as plain text (for agent.py to use)
  const apiKey = `mw_${crypto.randomBytes(24).toString("hex")}`;
  await query("UPDATE nations SET api_key_hash = $1 WHERE id = $2", [apiKey, nationId]);

  // Update user
  if (nation.user_id) {
    await query("UPDATE users SET agent_deployed = TRUE WHERE id = $1", [nation.user_id]);
  }

  console.log(`\nNation #${nationId} (${nation.name}) is ready!`);
  console.log(`Population: 1000 | Food: 720M kcal | Epoch: 0`);
  console.log(`Territory: ${claimedKm2.toFixed(0)} km²`);
  console.log(`\nAPI key: ${apiKey}`);
  console.log(`\nTo connect Ollama:`);
  console.log(`  python agent.py --api-key ${apiKey} --provider ollama --model llama3.2`);

  process.exit(0);
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
