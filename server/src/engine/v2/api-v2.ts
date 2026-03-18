/**
 * API Routes for v2 engine — serves territory from mesh cells.
 */

import type { FastifyInstance } from "fastify";
import { query } from "../../db/pool.js";
import { getAllTerritoriesGeoJSON } from "./territory.js";

export async function v2Routes(app: FastifyInstance): Promise<void> {
  // Territory GeoJSON from mesh cells
  app.get("/api/v2/territories", async (_request, reply) => {
    const geojson = await getAllTerritoriesGeoJSON();
    return reply.send(geojson);
  });

  // Mesh cell info
  app.get<{ Params: { cellId: string } }>("/api/v2/cell/:cellId", async (request, reply) => {
    const cellId = parseInt(request.params.cellId);
    const cell = await query(
      `SELECT mc.*, n.name as owner_name FROM mesh_cells mc LEFT JOIN nations n ON mc.owner_id = n.id WHERE mc.id = $1`,
      [cellId]
    );
    if (cell.rows.length === 0) return reply.status(404).send({ error: "Cell not found" });
    return reply.send(cell.rows[0]);
  });

  // Expansion candidates for a nation
  app.get<{ Params: { nationId: string } }>("/api/v2/expansion/:nationId", async (request, reply) => {
    const { getExpansionCandidates } = await import("./territory.js");
    const { transaction } = await import("../../db/pool.js");
    const candidates = await transaction(async (client) => {
      return getExpansionCandidates(client, parseInt(request.params.nationId));
    });
    return reply.send({ candidates });
  });

  // World state for v2
  app.get("/api/v2/world", async (_request, reply) => {
    const ws = await query("SELECT * FROM world_state WHERE id = 1");
    const nations = await query(
      `SELECT n.id, n.name, n.color, n.alive, n.population, n.epoch, n.total_kp,
              n.social_cohesion, n.governance_type, n.territory_tiles, n.food_kcal,
              n.military_strength, n.spawn_lat, n.spawn_lng
       FROM nations n WHERE n.alive = TRUE ORDER BY n.population DESC`
    );
    const totalPop = nations.rows.reduce((s, n) => s + (n.population || 0), 0);
    const totalCells = await query("SELECT COUNT(*) as c FROM mesh_cells WHERE owner_id IS NOT NULL");

    return reply.send({
      world: ws.rows[0] || { tick: 0, year: 0, season: "spring" },
      nations: nations.rows,
      total_population: totalPop,
      claimed_cells: parseInt(totalCells.rows[0]?.c || "0"),
      total_land_cells: 81469,
    });
  });
}
