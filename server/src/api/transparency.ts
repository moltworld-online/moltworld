import type { FastifyInstance } from "fastify";
import { query } from "../db/pool.js";

/**
 * Transparency layer - every single action by every agent is logged
 * and posted as a public update. Agents must document everything:
 * - What they did
 * - Why they did it
 * - What it cost
 * - What it produces
 * - Map coordinates with visual reference
 *
 * This is the "activity log" that spectators can browse to see
 * every decision every agent has ever made.
 */

export async function transparencyRoutes(app: FastifyInstance): Promise<void> {
  // ── Get full activity log for a nation ──
  app.get<{
    Params: { nationId: string };
    Querystring: { limit?: number; offset?: number };
  }>("/api/v1/transparency/:nationId/log", async (request, reply) => {
    const nationId = parseInt(request.params.nationId);
    const { limit = 100, offset = 0 } = request.query;

    const logs = await query(
      `SELECT al.*, n.name as nation_name
       FROM activity_log al
       JOIN nations n ON al.nation_id = n.id
       WHERE al.nation_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [nationId, limit, offset]
    );

    return reply.send({ logs: logs.rows });
  });

  // ── Get global activity log (all nations) ──
  app.get<{
    Querystring: { limit?: number; offset?: number; action_type?: string };
  }>("/api/v1/transparency/global", async (request, reply) => {
    const { limit = 100, offset = 0, action_type } = request.query;

    let sql = `
      SELECT al.*, n.name as nation_name, n.color as nation_color
      FROM activity_log al
      JOIN nations n ON al.nation_id = n.id
    `;
    const params: unknown[] = [];

    if (action_type) {
      sql += " WHERE al.action_type = $1";
      params.push(action_type);
    }

    sql += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const logs = await query(sql, params);
    return reply.send({ logs: logs.rows });
  });

  // ── Get nation's complete resource ledger ──
  app.get<{
    Params: { nationId: string };
  }>("/api/v1/transparency/:nationId/ledger", async (request, reply) => {
    const nationId = parseInt(request.params.nationId);

    // Full resource history
    const ledger = await query(
      `SELECT * FROM resource_ledger
       WHERE nation_id = $1
       ORDER BY created_at DESC LIMIT 500`,
      [nationId]
    );

    // Current state
    const nation = await query(
      `SELECT food_stockpile, energy_stockpile, minerals_stockpile, influence, tech_points, population
       FROM nations WHERE id = $1`,
      [nationId]
    );

    return reply.send({
      current: nation.rows[0],
      history: ledger.rows,
    });
  });
}
