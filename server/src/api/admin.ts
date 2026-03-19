import type { FastifyInstance } from "fastify";
import { query, getOne } from "../db/pool.js";

const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) console.warn("[SECURITY] ADMIN_KEY not set — admin routes will reject all requests");

async function adminAuth(request: any, reply: any): Promise<void> {
  const key = request.headers["x-admin-key"];
  if (key !== ADMIN_KEY) {
    reply.status(403).send({ error: "Invalid admin key" });
    return;
  }
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", adminAuth);

  // ── Dashboard Overview ──
  app.get("/api/v1/admin/dashboard", async (_request, reply) => {
    const tick = await getOne<{ value: string }>(
      "SELECT value::text FROM world_config WHERE key = 'current_tick'"
    );

    const nationCount = await getOne<{ total: string; alive: string }>(
      "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE alive = TRUE) as alive FROM nations"
    );

    const claimCount = await getOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM territory_claims"
    );

    const postCount = await getOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM forum_posts"
    );

    const tradeCount = await getOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM trade_offers"
    );

    const conflictCount = await getOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM conflicts"
    );

    const userCount = await getOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM users"
    );

    // Resource deposit stats
    const resourceStats = await query(`
      SELECT resource_type,
        COUNT(*) as deposit_count,
        SUM(quantity_total) as total_quantity,
        SUM(quantity_remaining) as remaining_quantity,
        ROUND(SUM(quantity_remaining) / NULLIF(SUM(quantity_total), 0) * 100, 1) as pct_remaining
      FROM resource_deposits
      GROUP BY resource_type
      ORDER BY resource_type
    `);

    // Nations with most territory
    const topNations = await query(`
      SELECT n.id, n.name, n.population, n.military_strength, n.alive,
        COUNT(tc.id) as claim_count,
        COALESCE(SUM(tc.area_sq_km), 0) as total_area
      FROM nations n
      LEFT JOIN territory_claims tc ON tc.nation_id = n.id
      GROUP BY n.id ORDER BY total_area DESC LIMIT 20
    `);

    // Recent activity
    const recentActivity = await query(
      "SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 50"
    );

    // Heatmap data: territory claim centroids
    const claimCentroids = await query(`
      SELECT
        ST_Y(ST_Centroid(geom)::geometry) as lat,
        ST_X(ST_Centroid(geom)::geometry) as lng,
        nation_id, area_sq_km
      FROM territory_claims
    `);

    return reply.send({
      tick: tick ? parseInt(JSON.parse(tick.value)) : 0,
      counts: {
        nations_total: parseInt(nationCount?.total || "0"),
        nations_alive: parseInt(nationCount?.alive || "0"),
        territory_claims: parseInt(claimCount?.count || "0"),
        forum_posts: parseInt(postCount?.count || "0"),
        trades: parseInt(tradeCount?.count || "0"),
        conflicts: parseInt(conflictCount?.count || "0"),
        users: parseInt(userCount?.count || "0"),
      },
      resource_stats: resourceStats.rows,
      top_nations: topNations.rows,
      recent_activity: recentActivity.rows,
      claim_heatmap: claimCentroids.rows,
    });
  });

  // ── List all users ──
  app.get("/api/v1/admin/users", async (_request, reply) => {
    const users = await query(
      "SELECT id, email, ip_address, agent_deployed, created_at FROM users ORDER BY created_at DESC"
    );
    return reply.send({ users: users.rows });
  });

  // ── List all nations with full details ──
  app.get("/api/v1/admin/nations", async (_request, reply) => {
    const nations = await query("SELECT id, name, color, alive, population, military_strength, epoch, social_cohesion, territory_tiles, food_kcal, created_at FROM nations ORDER BY created_at ASC");
    return reply.send({ nations: nations.rows });
  });

  // ── Force a tick (for testing) ──
  app.post("/api/v1/admin/force-tick", async (_request, reply) => {
    const { worldEngine } = await import("../engine/world-engine.js");
    const result = await worldEngine.processTick();
    return reply.send(result);
  });

  // ── Adjust tick interval ──
  app.post<{ Body: { interval_ms: number } }>(
    "/api/v1/admin/set-tick-interval",
    async (request, reply) => {
      const { interval_ms } = request.body;
      await query(
        "UPDATE world_config SET value = $1::jsonb WHERE key = 'tick_interval_seconds'",
        [JSON.stringify(Math.floor(interval_ms / 1000))]
      );
      return reply.send({ success: true, interval_ms });
    }
  );

  // ── Kill a nation (emergency) ──
  app.post<{ Body: { nation_id: number } }>(
    "/api/v1/admin/kill-nation",
    async (request, reply) => {
      const { nation_id } = request.body;
      await query("UPDATE nations SET alive = FALSE WHERE id = $1", [nation_id]);
      await query("DELETE FROM territory_claims WHERE nation_id = $1", [nation_id]);
      return reply.send({ success: true });
    }
  );

  // ── Get Pri event history ──
  app.get("/api/v1/admin/pri-events", async (_request, reply) => {
    const events = await query(
      "SELECT * FROM events WHERE event_type LIKE 'pri_%' ORDER BY created_at DESC LIMIT 100"
    );
    return reply.send({ events: events.rows });
  });
}
