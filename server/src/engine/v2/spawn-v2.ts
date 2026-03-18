/**
 * Spawn agents for v2 engine.
 * Each agent gets 1000 individual humans tracked in the humans table.
 */

import { query } from "../../db/pool.js";
import { generateStartingPopulation } from "./population.js";

// Verified land spawn points
const SPAWN_POINTS: [number, number][] = [
  [58.6,-125],[36.3,3.9],[35.8,107.8],[56.2,65.6],[43.6,94.8],
  [-3.2,-56.6],[-32.3,121.2],[29.2,60.4],[35.3,9.8],[13.3,-8.5],
  [42.9,116.7],[41.2,-82.2],[-7.6,113.1],[41.3,122.2],[-2.5,25.3],
  [21.1,20.6],[-2.5,102.7],[38.2,-4.7],[64.9,-164],[7.5,30.6],
  [22.7,101.1],[23,58.4],[-8.3,-42.9],[-12.1,-66.7],[-33.6,-54.7],
  [49.6,28.6],[58.7,75.7],[38.1,86.3],[0,116.2],[-13.4,-75.3],
  [22.7,-102],[64.7,140],[61.9,-138.9],[18.8,-1.1],[-14.9,-47.3],
  [5.2,-54.2],[62.8,9.5],[34.9,67.8],[44.8,-116.5],[-0.5,-65.7],
  [63.2,-113.2],[61.6,-99.4],[-6,146.7],[-8.1,138.3],[42.8,-121.8],
  [-6,-66.5],[48,72.1],[64.8,78.1],[54.1,111.4],[61.6,-43.7],
];

export async function spawnV2Agents(count: number = 10): Promise<void> {
  console.log(`[V2] Spawning ${count} agents with individual humans...\n`);

  const bcryptjs = await import("bcryptjs");
  const { nanoid } = await import("nanoid");

  for (let i = 0; i < Math.min(count, SPAWN_POINTS.length); i++) {
    const [lat, lng] = SPAWN_POINTS[i];
    const name = `Agent-${String(i + 1).padStart(3, "0")}`;
    const apiKey = `mw_${nanoid(32)}`;
    const apiKeyHash = await bcryptjs.default.hash(apiKey, 10);

    // Convert lat/lng to approximate tile coordinates (1 tile = 1 km)
    const tileX = Math.floor(lng * 111 * Math.cos((lat * Math.PI) / 180));
    const tileY = Math.floor(lat * 111);

    try {
      const result = await query(
        `INSERT INTO nations (name, api_key_hash, color, spawn_lat, spawn_lng, founding_lat, founding_lng,
          population, food_kcal, minerals_stockpile, epoch, total_kp, social_cohesion, governance_type, territory_tiles)
         VALUES ($1, $2, $3, $4, $5, $4, $5,
          1000, 0, 0, 0, 0, 50, 'band', 314)
         RETURNING id`,
        [name, apiKeyHash,
         `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`,
         lat, lng]
      );

      const nationId = result.rows[0].id;

      // Generate 1000 individual humans
      await generateStartingPopulation(nationId, tileX, tileY);

      const humanCount = await query("SELECT COUNT(*) as c FROM humans WHERE nation_id = $1 AND alive = TRUE", [nationId]);
      console.log(`  ${name} @ ${lat.toFixed(1)}°N, ${lng.toFixed(1)}°E — ${humanCount.rows[0].c} humans, tile (${tileX}, ${tileY})`);
    } catch (err) {
      console.error(`  SKIP ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\n[V2] Spawn complete.`);
}

// CLI entry point
const count = parseInt(process.argv[2] || "10");
spawnV2Agents(count).then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
