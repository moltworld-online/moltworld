/**
 * Check what resources each nation has in their territory.
 * Usage: npx tsx src/engine/v2/check-nation-resources.ts
 */
import { query } from "../../db/pool.js";

async function run() {
  const nations = await query("SELECT id, name, spawn_lat, spawn_lng FROM nations WHERE alive = TRUE ORDER BY id");

  for (const n of nations.rows) {
    const res = await query(
      `SELECT r->>'type' as rtype, COUNT(*) as cells, ROUND(AVG((r->>'quantity')::numeric), 1) as avg_qty
       FROM mesh_cells mc, jsonb_array_elements(mc.resources) r
       WHERE mc.owner_id = $1
       GROUP BY r->>'type' ORDER BY cells DESC`,
      [n.id]
    );
    console.log(`\n${n.name} (#${n.id}) — spawn: ${n.spawn_lat}, ${n.spawn_lng}`);
    if (res.rows.length === 0) {
      console.log("  NO RESOURCES IN TERRITORY");
    } else {
      for (const r of res.rows) {
        console.log(`  ${r.rtype}: ${r.cells} cells, avg qty ${r.avg_qty}`);
      }
    }
  }

  // Also check global distribution
  console.log("\n--- GLOBAL BASELINE ---");
  const global = await query(
    `SELECT r->>'type' as rtype, COUNT(*) as cells, ROUND(AVG((r->>'quantity')::numeric), 1) as avg_qty
     FROM mesh_cells mc, jsonb_array_elements(mc.resources) r
     WHERE mc.cell_type = 'land'
     GROUP BY r->>'type' ORDER BY cells DESC`
  );
  for (const r of global.rows) {
    console.log(`  ${r.rtype}: ${r.cells} cells (${(parseInt(r.cells) / 81469 * 100).toFixed(1)}% of land), avg qty ${r.avg_qty}`);
  }

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
