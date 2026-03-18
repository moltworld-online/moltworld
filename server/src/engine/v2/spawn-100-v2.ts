/**
 * Spawn 100 agents with v2 engine.
 * Each gets 1000 individual humans and ~314 km² starting territory from the mesh.
 */

import { query } from "../../db/pool.js";
import { generateStartingPopulation } from "./population.js";
import { claimStartingTerritory } from "./territory.js";
import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";

// 100 verified land spawn points, spaced across globe
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
  [-10.8,19.9],[32.9,-105.3],[50.9,-4.8],[46.1,46],[-34.3,135.8],
  [60.8,-132.6],[52.3,158],[64.8,65.4],[30.3,94.4],[23.6,114.1],
  [-30.3,23.2],[-15.2,30.5],[34.7,55],[51.6,-106.4],[-39,-63.5],
  [-15.5,39.9],[25.3,27.5],[64.9,122.4],[-18.4,23.9],[22.3,44.3],
  [-22.2,-52.5],[15.9,15.7],[57.4,32.9],[16,28.8],[24.7,9.5],
  [3,46.1],[1.4,110.8],[41,64.1],[28.1,45.1],[-1.8,133],
  [-31.8,-68.9],[-18.7,136],[-31.3,150.9],[-24.6,-58.5],[31.5,118.7],
  [64,-91],[56.5,8.8],[15.4,104.2],[-15.2,131],[62.8,127.8],
  [61.5,86.1],[48.4,-55.2],[19.9,95.5],[44,111.1],[60.8,26.4],
  [20.5,-12.6],[46.7,122.4],[-20.3,120.7],[62.4,100.8],[1.9,33.4],
];

const COLORS = [
  "#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#06b6d4","#3b82f6",
  "#6366f1","#8b5cf6","#a855f7","#d946ef","#ec4899","#f43f5e",
  "#84cc16","#10b981","#0ea5e9","#7c3aed","#c026d3","#e11d48",
  "#059669","#0284c7","#4f46e5","#9333ea","#db2777","#b91c1c",
  "#0d9488","#2563eb","#7e22ce","#be185d","#b45309",
];

// Personality seeds for last 25 agents
const PROMPTS = [
  "Peace above all. Never attack first.",
  "Strength is everything. Dominate.",
  "Trade is civilization. Build wealth.",
  "Harmony with nature. Sustain.",
  "Knowledge first. Educate everyone.",
  "Fortify everything. Trust no one.",
  "Stay mobile. Never settle permanently.",
  "Master the coastlines and seas.",
  "Mine deep. Hoard resources.",
  "Feed the world. Agricultural power.",
  "Heal everyone. Health is wealth.",
  "Be unpredictable. Change constantly.",
  "Stay silent. Build quietly.",
  "Democracy. People's happiness first.",
  "Expand relentlessly. Claim everything.",
  "Philosophy and debate. Reason rules.",
  "Sacred land. Defend every inch.",
  "Islands and coasts. Maritime empire.",
  "Technology above all. Automate.",
  "Freedom. No structure. Just happiness.",
  "Monopolize the rarest resource.",
  "Connect nations. Be the peacemaker.",
  "Every citizen a soldier.",
  "Art and beauty. Culture matters.",
  "Pragmatism. Copy what works.",
];

async function spawn() {
  console.log("Spawning 100 v2 agents with mesh territory...\n");

  let total = 0;
  for (let i = 0; i < 100; i++) {
    const [lat, lng] = SPAWN_POINTS[i];
    const name = `Agent-${String(i + 1).padStart(3, "0")}`;
    const color = COLORS[i % COLORS.length];
    const apiKeyHash = await bcryptjs.hash(`mw_${nanoid(32)}`, 10);
    const prompt = i >= 75 ? (PROMPTS[i - 75] || "") : "";

    try {
      const result = await query(
        `INSERT INTO nations (name, api_key_hash, color, spawn_lat, spawn_lng, founding_lat, founding_lng,
          agent_prompt, population, food_kcal, wood, stone, epoch, total_kp, social_cohesion, governance_type, territory_tiles)
         VALUES ($1, $2, $3, $4, $5, $4, $5, $6,
          1000, 720000000, 500, 200, 0, 0, 50, 'band', 0)
         RETURNING id`,
        [name, apiKeyHash, color, lat, lng, prompt]
      );
      const nationId = result.rows[0].id;

      // Generate 1000 individual humans
      await generateStartingPopulation(
        nationId,
        Math.floor(lng * 111 * Math.cos((lat * Math.PI) / 180)),
        Math.floor(lat * 111),
      );

      // Grant starter technologies (every early human group had these)
      for (const tech of ["controlled_fire", "basic_shelter", "foraging_knowledge"]) {
        await query(
          `INSERT INTO technologies (nation_id, tech_id, kp_invested, discovered, discovered_tick)
           VALUES ($1, $2, 100, TRUE, 0) ON CONFLICT DO NOTHING`,
          [nationId, tech]
        );
      }

      // Claim starting territory from mesh (~314 km²)
      const claimed = await claimStartingTerritory(nationId, lat, lng, 0);

      total++;
      if (total % 10 === 0 || total <= 5) {
        console.log(`  ${name}: ${claimed.toFixed(0)} km² at ${lat.toFixed(1)}°N ${lng.toFixed(1)}°E [${prompt ? "directed" : "free"}]`);
      }
    } catch (err) {
      console.error(`  SKIP ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Verify
  const nations = await query("SELECT COUNT(*) as c FROM nations");
  const humans = await query("SELECT COUNT(*) as c FROM humans WHERE alive = TRUE");
  const cells = await query("SELECT COUNT(*) as c FROM mesh_cells WHERE owner_id IS NOT NULL");

  console.log(`\n=== SPAWN COMPLETE ===`);
  console.log(`Nations: ${nations.rows[0].c}`);
  console.log(`Humans: ${humans.rows[0].c}`);
  console.log(`Mesh cells claimed: ${cells.rows[0].c}`);

  process.exit(0);
}

spawn().catch(err => { console.error(err); process.exit(1); });
