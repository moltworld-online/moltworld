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

  // Lightweight resource centroids — just [lat, lng, type, qty] arrays, ~500KB vs 10MB
  app.get("/api/v2/resource-points", async (_request, reply) => {
    const cells = await query(
      `SELECT seed_lat, seed_lng, resources
       FROM mesh_cells
       WHERE jsonb_array_length(COALESCE(resources, '[]'::jsonb)) > 0`
    );

    const points = cells.rows.map((c: any) => {
      const resources = c.resources || [];
      const dominant = resources.reduce((best: any, r: any) =>
        (!best || r.quantity > best.quantity) ? r : best, null);
      return [
        Math.round(parseFloat(c.seed_lat) * 100) / 100,
        Math.round(parseFloat(c.seed_lng) * 100) / 100,
        dominant?.type || "stone",
        dominant?.quantity || 1,
      ];
    });

    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send(points);
  });

  // Viewport-filtered resource polygons — for zoomed-in detail view
  app.get<{ Querystring: { south: string; west: string; north: string; east: string } }>(
    "/api/v2/resource-cells",
    async (request, reply) => {
      const { south, west, north, east } = request.query;
      if (!south || !west || !north || !east) {
        return reply.status(400).send({ error: "Provide south, west, north, east bounds" });
      }

      const cells = await query(
        `SELECT id, polygon, seed_lat, seed_lng, resources, wild_species
         FROM mesh_cells
         WHERE seed_lat >= $1 AND seed_lat <= $2 AND seed_lng >= $3 AND seed_lng <= $4
         AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) > 0`,
        [parseFloat(south), parseFloat(north), parseFloat(west), parseFloat(east)]
      );

      const features = cells.rows.map((c: any) => {
        const resources = c.resources || [];
        const species = c.wild_species || [];
        const dominant = resources.reduce((best: any, r: any) =>
          (!best || r.quantity > best.quantity) ? r : best, null);
        return {
          type: "Feature" as const,
          properties: {
            cell_id: c.id,
            dominant_type: dominant?.type || "unknown",
            dominant_quantity: dominant?.quantity || 0,
            resources,
            wild_species: species,
          },
          geometry: { type: "Polygon" as const, coordinates: c.polygon },
        };
      });

      reply.header("Cache-Control", "public, max-age=60");
      return reply.send({ type: "FeatureCollection", features });
    }
  );

  // Full resource GeoJSON (all cells) — very heavy, prefer resource-cells with bounds
  app.get("/api/v2/resources", async (_request, reply) => {
    const cells = await query(
      `SELECT id, polygon, seed_lat, seed_lng, resources
       FROM mesh_cells
       WHERE jsonb_array_length(COALESCE(resources, '[]'::jsonb)) > 0`
    );

    const features = cells.rows.map((c: any) => {
      // Get dominant resource (highest quantity)
      const resources = c.resources || [];
      const dominant = resources.reduce((best: any, r: any) =>
        (!best || r.quantity > best.quantity) ? r : best, null);

      return {
        type: "Feature" as const,
        properties: {
          cell_id: c.id,
          dominant_type: dominant?.type || "unknown",
          dominant_quantity: dominant?.quantity || 0,
          resources,
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: c.polygon,
        },
      };
    });

    return reply.send({ type: "FeatureCollection", features });
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
