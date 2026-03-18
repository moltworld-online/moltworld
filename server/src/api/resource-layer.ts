import type { FastifyInstance } from "fastify";
import { query } from "../db/pool.js";

/**
 * Aggregated resource layer for the map.
 * Groups 62K+ deposits into ~2° grid cells with dominant resource type and total quantity.
 * This is what the frontend renders — not individual deposits.
 */
export async function resourceLayerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/layers/resource-grid", async (_request, reply) => {
    // Aggregate deposits into 2° × 2° grid cells
    const cells = await query(`
      SELECT
        FLOOR(lat / 2) * 2 as cell_lat,
        FLOOR(lng / 2) * 2 as cell_lng,
        resource_type,
        COUNT(*) as deposit_count,
        SUM(quantity_remaining) as total_quantity,
        AVG(quantity_remaining) as avg_quantity
      FROM resource_deposits
      WHERE quantity_remaining > 0
      GROUP BY cell_lat, cell_lng, resource_type
      ORDER BY cell_lat, cell_lng, total_quantity DESC
    `);

    // Group by cell, pick top resource types per cell
    const cellMap = new Map<string, Array<{
      type: string;
      count: number;
      total: number;
      avg: number;
    }>>();

    for (const row of cells.rows) {
      const key = `${row.cell_lat},${row.cell_lng}`;
      if (!cellMap.has(key)) cellMap.set(key, []);
      cellMap.get(key)!.push({
        type: row.resource_type,
        count: parseInt(row.deposit_count),
        total: parseFloat(row.total_quantity),
        avg: parseFloat(row.avg_quantity),
      });
    }

    // Convert to array for frontend
    const gridCells: Array<{
      lat: number;
      lng: number;
      resources: Array<{ type: string; count: number; total: number }>;
      dominant: string;
      totalQuantity: number;
    }> = [];

    for (const [key, resources] of cellMap.entries()) {
      const [lat, lng] = key.split(",").map(Number);
      const totalQuantity = resources.reduce((sum, r) => sum + r.total, 0);
      const dominant = resources[0].type; // Already sorted by total DESC

      gridCells.push({
        lat,
        lng,
        resources: resources.slice(0, 5), // Top 5 resource types per cell
        dominant,
        totalQuantity,
      });
    }

    return reply.send({ cells: gridCells, cellSize: 2 });
  });
}
