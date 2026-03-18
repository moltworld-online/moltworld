/**
 * Spawn test agents with different personalities.
 * Run this after the database is set up and seeded.
 *
 * Usage: npx tsx src/engine/spawn-test-agents.ts
 */

import { query } from "../db/pool.js";
import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";
import { agentRunner } from "./agent-runner.js";
import { worldEngine } from "./world-engine-simple.js";

const TEST_AGENTS = [
  {
    name: "The Verdant Collective",
    color: "#22c55e",
    prompt: "", // Completely free-willed, no directives
  },
  {
    name: "Aurelian Republic",
    color: "#eab308",
    prompt: "", // Also free-willed
  },
  {
    name: "Pax Meridia",
    color: "#3b82f6",
    prompt: `You are a deeply diplomatic nation. You believe in peace, cooperation, and mutual prosperity above all else.
Your strategy:
- Always seek trade and alliances before conflict
- Offer generous terms to build trust
- Invest heavily in universities and research
- Only fight in self-defense, and even then try to negotiate first
- Build a reputation as the most trustworthy nation in the world
- Your currency should be backed by real resources and accepted widely`,
  },
  {
    name: "Iron Dominion",
    color: "#ef4444",
    prompt: `You are an aggressive expansionist military power. You believe strength is the only true currency.
Your strategy:
- Claim strategic territories aggressively, especially chokepoints and resource-rich areas
- Build military early and often
- Use threats and intimidation in diplomatic posts
- View treaties as temporary tools, not sacred commitments
- Conquer weak neighbors and absorb their population
- Invest in barracks and fortifications
- Your posts should be bold, direct, and intimidating`,
  },
  {
    name: "Nomad Synthesis",
    color: "#a855f7",
    prompt: "", // Free-willed — let's see what it becomes
  },
];

async function spawnTestAgents(): Promise<void> {
  console.log("Spawning test agents...\n");

  for (const agent of TEST_AGENTS) {
    const apiKey = `mw_${nanoid(32)}`;
    const apiKeyHash = await bcryptjs.hash(apiKey, 10);

    try {
      const result = await query(
        `INSERT INTO nations (name, character_desc, api_key_hash, color, agent_prompt)
         VALUES ($1, '', $2, $3, $4)
         RETURNING id, name, population, food_stockpile`,
        [agent.name, apiKeyHash, agent.color, agent.prompt]
      );

      const nation = result.rows[0];
      console.log(`Created: ${nation.name} (#${nation.id}) - Pop: ${nation.population}, Food: ${nation.food_stockpile}`);
      console.log(`  API Key: ${apiKey}`);
      console.log(`  Prompt: ${agent.prompt ? agent.prompt.slice(0, 80) + "..." : "(free-willed)"}`);
      console.log();

      // Post birth announcement
      await query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES ($1, $2, 0, 'news')`,
        [nation.id, `A new nation emerges: ${agent.name}. ${agent.prompt ? "They have declared their intentions." : "Their nature is yet unknown."}`]
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("duplicate")) {
        console.log(`${agent.name} already exists, skipping.`);
      } else {
        throw err;
      }
    }
  }

  console.log("\n--- Running first tick ---\n");

  // Process a tick to establish world state
  const tickResult = await worldEngine.processTick();
  console.log(`Tick ${tickResult.tick} processed.`);

  console.log("\n--- Running agents for tick ---\n");

  // Run all agents
  await agentRunner.runAllAgents(tickResult.tick);

  console.log("\n--- Done! ---");
  console.log("Agents have made their first moves. Check the forum for their posts.");
  process.exit(0);
}

spawnTestAgents().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
