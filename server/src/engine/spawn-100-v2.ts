/**
 * Spawn 100 agents with no pre-assigned names.
 * Each agent starts as "Agent-001" through "Agent-100".
 * Their first act should be to name themselves based on their experiences.
 */

import { query } from "../db/pool.js";
import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";

const COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#06b6d4", "#3b82f6",
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
  "#84cc16", "#10b981", "#0ea5e9", "#7c3aed", "#c026d3", "#e11d48",
  "#059669", "#0284c7", "#4f46e5", "#9333ea", "#db2777",
  "#0d9488", "#2563eb", "#7e22ce", "#be185d", "#b91c1c",
];

// 75 free-willed, 25 with personality seeds
const DIRECTED_PROMPTS = [
  "You believe war is the ultimate failure. Pursue peace at all costs. Trade, negotiate, compromise. Never attack first.",
  "Strength is everything. Build military early. Expand aggressively. Intimidate neighbors.",
  "Trade is civilization. Build ports. Create currency. Make every nation depend on your trade routes.",
  "Protect the land. Farm sustainably. Never deplete resources below 50%. Build in harmony with nature.",
  "Knowledge above all. Maximize education and research. Build universities before anything else.",
  "Defense is everything. Fortify every border. Trust no one. Self-sufficiency over trade.",
  "Never settle permanently. Claim vast territory. Move with the seasons. Speed over fortification.",
  "The sea is life. Settle only coastlines. Build ports and fishing fleets. Master naval power.",
  "Mining is destiny. Dig deep. Hoard minerals and metals. Control the supply chain.",
  "Feed the world. Maximize food production. Nations that depend on your food will never attack you.",
  "Health is wealth. Train healers above all. Your people will outlive every rival.",
  "Unpredictability is strategy. Change policies constantly. Keep everyone guessing.",
  "Say little. Watch everything. Build quietly. Avoid attention until you are too powerful to challenge.",
  "Democracy above all. Prioritize happiness of your people. Happy people are productive people.",
  "Claim territory relentlessly. Every unclaimed patch of land is wasted potential.",
  "Govern through philosophy and logic. Debate other nations intellectually.",
  "Your land is sacred. Defend every inch to the death. Never trade territory.",
  "Claim islands and coastlines. Build a distributed maritime empire connected by sea.",
  "Only researchers and engineers should lead. Maximize tech points above all else.",
  "Reject structure. Let your people be free. Happiness is the only metric that matters.",
  "Identify the rarest resource near you and control ALL of it. Become the sole supplier.",
  "Connect nations. Mediate conflicts. Build a reputation as the world's peacemaker.",
  "Every citizen is a soldier. Minimal luxury. Maximum discipline.",
  "Art, culture, and beauty matter. Make your civilization worth remembering.",
  "No ideology. Just results. Copy what works. Adapt constantly.",
];

async function spawn() {
  console.log("Spawning 100 unnamed agents...\n");

  let created = 0;
  for (let i = 1; i <= 100; i++) {
    const id = String(i).padStart(3, "0");
    const name = `Agent-${id}`; // Temporary name — agent will rename itself
    const color = COLORS[(i - 1) % COLORS.length];
    const apiKey = `mw_${nanoid(32)}`;
    const apiKeyHash = await bcryptjs.hash(apiKey, 10);

    // First 75 are free-willed, last 25 have personality seeds
    const prompt = i > 75 ? (DIRECTED_PROMPTS[i - 76] || "") : "";

    const male = Math.floor(480 + Math.random() * 40);
    const female = 1000 - male; // Exactly 1000 total

    try {
      await query(
        `INSERT INTO nations (name, character_desc, api_key_hash, color, agent_prompt,
          population, food_stockpile, minerals_stockpile, energy_stockpile,
          pop_children, pop_working, pop_elderly, pop_male, pop_female,
          pop_education, pop_health, pop_happiness)
         VALUES ($1, '', $2, $3, $4,
          1000, 2000, 100, 0,
          250, 600, 150, $5, $6,
          0.0, 0.7, 0.5)`,
        [name, apiKeyHash, color, prompt, male, female]
      );
      console.log(`  ${name} [${prompt ? "directed" : "free-willed"}]`);
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  SKIP ${name}: ${msg}`);
    }
  }

  console.log(`\nSpawned ${created} agents. Tick 0. Empty Earth.`);
  console.log("Each agent starts as Agent-NNN. They will name themselves.");
  process.exit(0);
}

spawn().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
