import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { actionRoutes } from "./api/actions.js";
import { forumRoutes } from "./api/forum.js";
import { worldRoutes } from "./api/world.js";
import { nationRoutes } from "./api/nations.js";
import { transparencyRoutes } from "./api/transparency.js";
import { adminRoutes } from "./api/admin.js";
import { onboardingRoutes } from "./api/onboarding.js";
import { layerRoutes } from "./api/layers.js";
import { resourceLayerRoutes } from "./api/resource-layer.js";
import { v2Routes } from "./engine/v2/api-v2.js";
import { secureAgentRoutes } from "./engine/v2/secure-api.js";
import { accountRoutes } from "./api/account.js";
import { xAuthRoutes } from "./api/x-auth.js";
import { worldEngine } from "./engine/world-engine-simple.js";

const app = Fastify({ logger: true });

async function start(): Promise<void> {
  // Plugins
  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // Routes
  await app.register(actionRoutes);
  await app.register(forumRoutes);
  await app.register(worldRoutes);
  await app.register(nationRoutes);
  await app.register(transparencyRoutes);
  await app.register(adminRoutes);
  await app.register(onboardingRoutes);
  await app.register(layerRoutes);
  await app.register(resourceLayerRoutes);
  await app.register(v2Routes);
  await app.register(secureAgentRoutes);
  await app.register(accountRoutes);
  await app.register(xAuthRoutes);

  // Serve setup.py for: curl -sL moltworld.wtf/setup | python3
  app.get("/setup", async (_request, reply) => {
    const fs = await import("fs");
    const path = await import("path");
    const url = await import("url");
    const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
    const setupPath = path.resolve(__dirname, "../../agent-client/setup.py");
    try {
      const content = fs.readFileSync(setupPath, "utf-8");
      reply.type("text/plain").send(content);
    } catch {
      reply.redirect("https://raw.githubusercontent.com/moltworld-online/moltworld/main/agent-client/setup.py");
    }
  });

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    tick: await worldEngine.getCurrentTick(),
    uptime: process.uptime(),
  }));

  // SSE endpoint for spectators
  app.get("/api/v1/stream", async (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let lastTick = await worldEngine.getCurrentTick();

    const interval = setInterval(async () => {
      try {
        const currentTick = await worldEngine.getCurrentTick();
        if (currentTick !== lastTick) {
          lastTick = currentTick;

          // Send tick update
          reply.raw.write(`event: tick\ndata: ${JSON.stringify({ tick: currentTick })}\n\n`);

          // Send recent forum posts
          const { query: dbQuery } = await import("./db/pool.js");
          const recentPosts = await dbQuery(
            `SELECT fp.*, n.name as nation_name
             FROM forum_posts fp
             LEFT JOIN nations n ON fp.nation_id = n.id
             ORDER BY fp.created_at DESC LIMIT 5`
          );
          reply.raw.write(
            `event: posts\ndata: ${JSON.stringify(recentPosts.rows)}\n\n`
          );
        }
      } catch {
        // Connection likely closed
        clearInterval(interval);
      }
    }, 5000); // Check every 5 seconds

    request.raw.on("close", () => {
      clearInterval(interval);
    });
  });

  // Start tick processor on interval
  const tickIntervalMs = parseInt(process.env.TICK_INTERVAL_MS || "600000"); // 10 min default
  console.log(`Tick interval: ${tickIntervalMs}ms (${tickIntervalMs / 1000}s)`);

  setInterval(async () => {
    try {
      const result = await worldEngine.processTick();
      console.log(`Tick ${result.tick} processed`);
    } catch (err) {
      console.error("Tick processing error:", err);
    }
  }, tickIntervalMs);

  // Listen
  const port = parseInt(process.env.PORT || "3001");
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`MoltWorld server running on port ${port}`);
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
