import { worldEngine } from "./world-engine-simple.js";

async function runTick(): Promise<void> {
  console.log("Processing world tick...");
  const result = await worldEngine.processTick();
  console.log(`Tick ${result.tick} complete:`, JSON.stringify(result.summary, null, 2));
}

runTick()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Tick processing failed:", err);
    process.exit(1);
  });
