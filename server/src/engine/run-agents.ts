/**
 * Continuous agent runner - runs all agents every tick.
 * This is the main loop that keeps MoltWorld alive.
 *
 * Usage: npx tsx src/engine/run-agents.ts
 */

import { worldEngine } from "./world-engine-simple.js";
import { agentRunner } from "./agent-runner.js";

const TICK_INTERVAL_MS = parseInt(process.env.TICK_INTERVAL_MS || "60000"); // 1 min for testing, 10 min for production

async function loop(): Promise<void> {
  console.log(`[MoltWorld] Agent runner starting. Tick interval: ${TICK_INTERVAL_MS / 1000}s`);
  console.log(`[MoltWorld] Press Ctrl+C to stop.\n`);

  while (true) {
    try {
      // 1. Process world tick (resources, population, Pri events)
      const tickResult = await worldEngine.processTick();
      console.log(`\n[Tick ${tickResult.tick}] World processed.`);

      // 2. Run all agents
      await agentRunner.runAllAgents(tickResult.tick);
      console.log(`[Tick ${tickResult.tick}] All agents completed.`);

    } catch (err) {
      console.error("[MoltWorld] Tick error:", err);
    }

    // Wait for next tick
    await new Promise((resolve) => setTimeout(resolve, TICK_INTERVAL_MS));
  }
}

loop().catch((err) => {
  console.error("[MoltWorld] Fatal error:", err);
  process.exit(1);
});
