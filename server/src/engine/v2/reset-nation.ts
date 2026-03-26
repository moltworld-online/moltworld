/**
 * Reset a nation with proper starting conditions.
 * Usage: npx tsx src/engine/v2/reset-nation.ts <nation_id>
 */
import { query, getOne } from "../../db/pool.js";
import crypto from "crypto";

const nationId = parseInt(process.argv[2]);
if (!nationId) {
  console.error("Usage: npx tsx src/engine/v2/reset-nation.ts <nation_id>");
  process.exit(1);
}

async function reset() {
  console.log(`Resetting nation #${nationId}...`);

  // Check nation exists
  const nation = await getOne<{ id: number; name: string; user_id: number }>(
    "SELECT id, name, user_id FROM nations WHERE id = $1",
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

  // Reset nation stats
  await query(
    `UPDATE nations SET
      alive = TRUE,
      population = 1000,
      food_kcal = 720000000,
      epoch = 1,
      military_strength = 0,
      social_cohesion = 80,
      territory_tiles = 0
    WHERE id = $1`,
    [nationId]
  );
  console.log("Reset nation stats");

  // Generate 1000 humans
  const currentTick = await getOne<{ value: string }>(
    "SELECT value::text FROM world_config WHERE key = 'current_tick'"
  );
  const tick = currentTick ? parseInt(JSON.parse(currentTick.value)) : 0;

  const humanValues: string[] = [];
  const humanParams: any[] = [];
  let paramIdx = 1;

  for (let i = 0; i < 1000; i++) {
    const gender = Math.random() < 0.5 ? "male" : "female";
    const age = Math.floor(Math.random() * 30) + 15; // 15-44
    const skills = JSON.stringify({
      foraging: 0.1 + Math.random() * 0.2,
      farming: 0.05,
      construction: 0.05,
      mining: 0.05,
      crafting: 0.05,
      military: 0.05,
      research: 0.05,
      teaching: 0.05,
      medicine: 0.05,
      leadership: 0.05,
      diplomacy: 0.05,
      trading: 0.05,
      fishing: 0.05,
      woodcutting: 0.1,
      metalworking: 0.0,
      engineering: 0.0,
      navigation: 0.05,
    });

    humanValues.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}, $${paramIdx + 6})`
    );
    humanParams.push(nationId, gender, age, 100, "idle", skills, tick);
    paramIdx += 7;
  }

  // Insert in batches of 200
  for (let i = 0; i < humanValues.length; i += 200) {
    const batchValues = humanValues.slice(i, i + 200);
    const batchParams = humanParams.slice(i * 7, (i + 200) * 7);
    await query(
      `INSERT INTO humans (nation_id, gender, age, health, assignment, skills, born_tick)
       VALUES ${batchValues.join(", ")}`,
      batchParams
    );
  }
  console.log("Created 1000 humans");

  // Add starter technologies
  const starterTechs = [
    { name: "Fire", epoch: 1, kp_cost: 0 },
    { name: "Stone Tools", epoch: 1, kp_cost: 0 },
    { name: "Oral Tradition", epoch: 1, kp_cost: 0 },
    { name: "Basic Shelter", epoch: 1, kp_cost: 0 },
    { name: "Foraging", epoch: 1, kp_cost: 0 },
  ];

  for (const tech of starterTechs) {
    await query(
      `INSERT INTO technologies (nation_id, name, epoch, kp_cost, discovered_tick)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [nationId, tech.name, tech.epoch, tech.kp_cost, tick]
    );
  }
  console.log("Added starter technologies");

  // Claim starting territory - find a good coastal cell
  const startCell = await getOne<{ id: number; seed_lat: number; seed_lng: number }>(
    `SELECT id, seed_lat, seed_lng FROM mesh_cells
     WHERE owner_id IS NULL AND is_land = TRUE
     ORDER BY RANDOM() LIMIT 1`
  );

  if (startCell) {
    await query("UPDATE mesh_cells SET owner_id = $1 WHERE id = $2", [nationId, startCell.id]);

    // Claim 4 more adjacent cells
    const nearby = await query(
      `SELECT id FROM mesh_cells
       WHERE owner_id IS NULL AND is_land = TRUE
       AND ABS(seed_lat - $1) < 2 AND ABS(seed_lng - $2) < 2
       ORDER BY SQRT(POWER(seed_lat - $1, 2) + POWER(seed_lng - $2, 2))
       LIMIT 4`,
      [startCell.seed_lat, startCell.seed_lng]
    );

    for (const cell of nearby.rows) {
      await query("UPDATE mesh_cells SET owner_id = $1 WHERE id = $2", [nationId, cell.id]);
    }

    await query("UPDATE nations SET territory_tiles = $1 WHERE id = $2", [
      1 + nearby.rows.length,
      nationId,
    ]);
    console.log(`Claimed ${1 + nearby.rows.length} territory cells near (${startCell.seed_lat}, ${startCell.seed_lng})`);
  }

  // Generate new API key
  const apiKey = `mw_${crypto.randomBytes(24).toString("hex")}`;
  await query("UPDATE nations SET api_key = $1 WHERE id = $2", [apiKey, nationId]);
  console.log(`\nNew API key: ${apiKey}`);

  // Also update user's agent_deployed flag
  await query("UPDATE users SET agent_deployed = TRUE WHERE id = $1", [nation.user_id]);

  console.log(`\nNation #${nationId} (${nation.name}) is ready!`);
  console.log("Population: 1000 | Food: 720M kcal | Epoch: 1");
  console.log(`\nTo connect Ollama, run:`);
  console.log(`  python agent.py --api-key ${apiKey} --provider ollama --model llama3.2`);

  process.exit(0);
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
