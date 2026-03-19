import type { FastifyInstance } from "fastify";
import { query, getOne } from "../db/pool.js";
import { authMiddleware } from "../middleware/auth.js";
import { worldEngine } from "../engine/world-engine-simple.js";

export async function worldRoutes(app: FastifyInstance): Promise<void> {
  // ── Public: Get world overview (spectator-friendly) ──
  app.get("/api/v1/world/overview", async (_request, reply) => {
    const tick = await worldEngine.getCurrentTick();

    const nations = await query(
      `SELECT id, name, character_desc, color, alive, population, military_strength, epoch, social_cohesion,
        (SELECT COUNT(*) FROM mesh_cells WHERE owner_id = nations.id) as territory_count,
        (SELECT COALESCE(SUM(area_km2), 0) FROM mesh_cells WHERE owner_id = nations.id) as total_area_sq_km
       FROM nations ORDER BY population DESC`
    );

    const totalClaims = await getOne<{ count: string }>(
      "SELECT COUNT(*) as count FROM mesh_cells WHERE owner_id IS NOT NULL"
    );

    const recentEvents = await query(
      "SELECT * FROM events ORDER BY created_at DESC LIMIT 20"
    );

    return reply.send({
      tick,
      nations: nations.rows,
      total_territory_claims: parseInt(totalClaims?.count || "0"),
      recent_events: recentEvents.rows,
    });
  });

  // ── Public: Get all territory claims (for map rendering) ──
  app.get("/api/v1/world/territories", async (_request, reply) => {
    const territories = await query(
      `SELECT
        tc.id, tc.nation_id, tc.area_sq_km, tc.claimed_tick, tc.improvements, tc.polygon,
        n.name as nation_name, n.color as nation_color
       FROM territory_claims tc
       JOIN nations n ON tc.nation_id = n.id
       ORDER BY tc.claimed_tick ASC`
    );

    return reply.send({
      type: "FeatureCollection",
      features: territories.rows.map((t) => ({
        type: "Feature",
        properties: {
          claim_id: t.id,
          nation_id: t.nation_id,
          nation_name: t.nation_name,
          nation_color: t.nation_color,
          area_sq_km: t.area_sq_km,
          claimed_tick: t.claimed_tick,
          improvements: t.improvements,
        },
        geometry: {
          type: "Polygon",
          coordinates: [t.polygon], // polygon is stored as [[lng,lat],...] array
        },
      })),
    });
  });

  // ── Public: Get nation profile ──
  app.get<{
    Params: { nationId: string };
  }>("/api/v1/world/nation/:nationId", async (request, reply) => {
    const nationId = parseInt(request.params.nationId);

    const nation = await getOne(
      `SELECT n.id, n.name, n.character_desc, n.color, n.alive, n.population, n.military_strength,
        n.influence, n.created_at, COALESCE(n.food_kcal, n.food_stockpile, 0) as food_stockpile,
        n.energy_stockpile, n.minerals_stockpile, n.food_kcal,
        n.tech_points, n.agent_prompt, n.llm_provider, n.llm_model, n.epoch, n.social_cohesion, n.total_kp,
        n.pop_education, n.pop_health, n.pop_happiness,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.gender = 'male') as pop_male,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.gender = 'female') as pop_female,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.age_ticks < 5040) as pop_children,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.age_ticks >= 5040 AND h.age_ticks < 16200) as pop_working,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.age_ticks >= 16200) as pop_elderly,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.task = 'foraging') as pop_farmers,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.task = 'mining') as pop_miners,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.task = 'building') as pop_builders,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.task = 'military') as pop_soldiers,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.task = 'teaching') as pop_teachers,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.task = 'research') as pop_researchers,
        (SELECT COUNT(*) FROM humans h WHERE h.nation_id = n.id AND h.alive AND h.task = 'healing') as pop_healers
       FROM nations n WHERE n.id = $1`,
      [nationId]
    );

    if (!nation) {
      return reply.status(404).send({ error: "Nation not found" });
    }

    const territories = await query(
      "SELECT id, area_sq_km, claimed_tick, improvements, polygon FROM territory_claims WHERE nation_id = $1",
      [nationId]
    );

    const treaties = await query(
      `SELECT * FROM treaties
       WHERE $1 = ANY(party_ids) AND status IN ('active', 'proposed')
       ORDER BY created_at DESC`,
      [nationId]
    );

    const recentPosts = await query(
      `SELECT * FROM forum_posts WHERE nation_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [nationId]
    );

    return reply.send({
      nation,
      territories: territories.rows,
      treaties: treaties.rows,
      recent_posts: recentPosts.rows,
    });
  });

  // ── Public: Get conflicts history ──
  app.get("/api/v1/world/conflicts", async (_request, reply) => {
    const conflicts = await query(
      `SELECT c.*,
        a.name as attacker_name, d.name as defender_name, w.name as winner_name
       FROM conflicts c
       JOIN nations a ON c.attacker_id = a.id
       JOIN nations d ON c.defender_id = d.id
       JOIN nations w ON c.winner_id = w.id
       ORDER BY c.created_at DESC LIMIT 50`
    );

    return reply.send({ conflicts: conflicts.rows });
  });

  // ── Public: Get leaderboard ──
  app.get("/api/v1/world/leaderboard", async (_request, reply) => {
    const byPopulation = await query(
      "SELECT id, name, color, population FROM nations WHERE alive = TRUE ORDER BY population DESC LIMIT 10"
    );
    const byTerritory = await query(
      `SELECT n.id, n.name, n.color,
        COALESCE(SUM(mc.area_km2), 0) as total_area
       FROM nations n
       LEFT JOIN mesh_cells mc ON mc.owner_id = n.id
       WHERE n.alive = TRUE
       GROUP BY n.id ORDER BY total_area DESC LIMIT 10`
    );
    const byMilitary = await query(
      "SELECT id, name, color, military_strength FROM nations WHERE alive = TRUE ORDER BY military_strength DESC LIMIT 10"
    );

    return reply.send({
      by_population: byPopulation.rows,
      by_territory: byTerritory.rows,
      by_military: byMilitary.rows,
    });
  });

  // ── Public: Event timeline ──
  app.get<{
    Querystring: { limit?: number; offset?: number; type?: string };
  }>("/api/v1/world/events", async (request, reply) => {
    const { limit = 50, offset = 0, type } = request.query;

    let sql = "SELECT * FROM events";
    const params: unknown[] = [];

    if (type) {
      sql += " WHERE event_type = $1";
      params.push(type);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const events = await query(sql, params);
    return reply.send({ events: events.rows });
  });

  // ── Authenticated: Get own state (fog of war) ──
  app.get(
    "/api/v1/world/my-state",
    { preHandler: authMiddleware },
    async (request, reply) => {
      const nationId = request.nationId!;
      const tick = await worldEngine.getCurrentTick();

      // Own nation details (NEVER expose api_key_hash or llm_api_key)
      const nation = await getOne(
        `SELECT id, name, color, alive, population, military_strength, influence, epoch,
          social_cohesion, governance_type, territory_tiles, food_kcal,
          energy_stockpile, minerals_stockpile, tech_points, total_kp,
          pop_education, pop_health, pop_happiness, spawn_lat, spawn_lng
         FROM nations WHERE id = $1`,
        [nationId]
      );

      // Own territories (no PostGIS)
      const territories = await query(
        "SELECT * FROM territory_claims WHERE nation_id = $1",
        [nationId]
      );

      // All other alive nations (simplified neighbors — no distance calc without PostGIS)
      const neighbors = await query(
        "SELECT id, name, color, alive FROM nations WHERE id != $1 AND alive = TRUE",
        [nationId]
      );

      // Own military
      const military = await query(
        "SELECT * FROM military_units WHERE nation_id = $1",
        [nationId]
      );

      // Active treaties
      const treaties = await query(
        "SELECT * FROM treaties WHERE $1 = ANY(party_ids) AND status IN ('active', 'proposed')",
        [nationId]
      );

      // Pending trades
      const trades = await query(
        `SELECT * FROM trade_offers
         WHERE (proposer_id = $1 OR target_id = $1) AND status = 'pending'`,
        [nationId]
      );

      // Recent relevant events
      const events = await query(
        `SELECT * FROM events
         WHERE data::text LIKE $1
         ORDER BY created_at DESC LIMIT 20`,
        [`%${nationId}%`]
      );

      // Unread DMs
      const unreadDms = await query(
        `SELECT dm.*, s.name as sender_name FROM direct_messages dm
         JOIN nations s ON dm.sender_id = s.id
         WHERE dm.recipient_id = $1 AND dm.read = FALSE
         ORDER BY dm.created_at DESC`,
        [nationId]
      );

      return reply.send({
        tick,
        nation,
        territories: territories.rows,
        neighbors: neighbors.rows,
        military: military.rows,
        treaties: treaties.rows,
        pending_trades: trades.rows,
        recent_events: events.rows,
        unread_messages: unreadDms.rows,
      });
    }
  );
}
