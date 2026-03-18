/**
 * Spawn 100 agents, each assigned to a verified land coordinate.
 * Agents know exactly where they are — no guessing about land vs water.
 */

import { query } from "../db/pool.js";
import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";

// 100 verified land points spread across the globe (generated from land-grid.json)
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

const DIRECTED_PROMPTS = [
  "Peace at all costs. Never attack first. Trade and negotiate.",
  "Strength is everything. Build military. Expand aggressively.",
  "Trade is civilization. Build ports. Create currency.",
  "Protect the land. Farm sustainably. Harmony with nature.",
  "Knowledge above all. Education and research first.",
  "Fortify every border. Trust no one. Self-sufficiency.",
  "Nomadic. Never settle permanently. Move with the seasons.",
  "The sea is life. Settle coastlines. Naval power.",
  "Mining is destiny. Hoard minerals and metals.",
  "Feed the world. Agricultural superpower.",
  "Health is wealth. Train healers above all.",
  "Unpredictable. Change policies constantly.",
  "Silent. Build quietly. Avoid attention.",
  "Democracy. Happiness is the priority.",
  "Expand relentlessly. Claim everything unclaimed.",
  "Philosophy and logic. Debate intellectually.",
  "Your land is sacred. Defend every inch.",
  "Islands and coasts. Distributed maritime empire.",
  "Technocracy. Maximize tech points.",
  "Reject structure. Freedom and happiness only.",
  "Control the rarest resource. Become sole supplier.",
  "Connect nations. Mediate conflicts. Peacemaker.",
  "Every citizen is a soldier. Maximum discipline.",
  "Art and culture. Make civilization beautiful.",
  "No ideology. Copy what works. Adapt constantly.",
];

async function spawn() {
  console.log("Spawning 100 agents with verified land spawn points...\n");

  let created = 0;
  for (let i = 0; i < 100; i++) {
    const [lat, lng] = SPAWN_POINTS[i];
    const name = `Agent-${String(i + 1).padStart(3, "0")}`;
    const color = COLORS[i % COLORS.length];
    const apiKey = `mw_${nanoid(32)}`;
    const apiKeyHash = await bcryptjs.hash(apiKey, 10);
    const prompt = i >= 75 ? (DIRECTED_PROMPTS[i - 75] || "") : "";
    const male = Math.floor(480 + Math.random() * 40);
    const female = 1000 - male;

    try {
      await query(
        `INSERT INTO nations (name, character_desc, api_key_hash, color, agent_prompt,
          population, food_stockpile, minerals_stockpile, energy_stockpile,
          pop_children, pop_working, pop_elderly, pop_male, pop_female,
          pop_education, pop_health, pop_happiness,
          spawn_lat, spawn_lng, founding_lat, founding_lng)
         VALUES ($1, '', $2, $3, $4,
          1000, 2000, 100, 0,
          250, 600, 150, $5, $6,
          0.0, 0.7, 0.5,
          $7, $8, $7, $8)`,
        [name, apiKeyHash, color, prompt, male, female, lat, lng]
      );
      console.log(`  ${name} → ${lat.toFixed(1)}°N, ${lng.toFixed(1)}°E [${prompt ? "directed" : "free"}]`);
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  SKIP ${name}: ${msg}`);
    }
  }

  console.log(`\nSpawned ${created} agents. Each knows their exact land coordinates.`);
  process.exit(0);
}

spawn().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
