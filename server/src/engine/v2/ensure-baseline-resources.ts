/**
 * Ensure every land cell has baseline survival resources:
 * - fertile (qty 2 minimum)
 * - timber (qty 2 minimum)
 * - water (qty 1 minimum)
 *
 * Adds them if missing, does NOT overwrite existing higher quantities.
 * This means every nation can at least forage, build, and drink regardless of location.
 *
 * Usage: npx tsx src/engine/v2/ensure-baseline-resources.ts
 */

import { query } from "../../db/pool.js";

const BASELINE = [
  { type: "fertile", quantity: 2 },
  { type: "timber", quantity: 2 },
  { type: "water", quantity: 1 },
];

async function run() {
  console.log("Ensuring baseline resources on all land cells...");

  for (const base of BASELINE) {
    // Add to cells that DON'T have this resource type at all
    const added = await query(
      `UPDATE mesh_cells
       SET resources = COALESCE(resources, '[]'::jsonb) || $1::jsonb
       WHERE cell_type = 'land'
       AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(COALESCE(resources, '[]'::jsonb)) r
         WHERE r->>'type' = $2
       )`,
      [JSON.stringify([{ type: base.type, quantity: base.quantity }]), base.type]
    );
    console.log(`  ${base.type} (qty ${base.quantity}): added to ${added.rowCount} cells that were missing it`);
  }

  // Verify
  const check = await query(`
    SELECT
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(resources) r WHERE r->>'type' = 'fertile')) as has_fertile,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(resources) r WHERE r->>'type' = 'timber')) as has_timber,
      COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(resources) r WHERE r->>'type' = 'water')) as has_water,
      COUNT(*) as total
    FROM mesh_cells WHERE cell_type = 'land'
  `);
  const c = check.rows[0];
  console.log(`\nVerification (${c.total} land cells):`);
  console.log(`  fertile: ${c.has_fertile} (${(c.has_fertile / c.total * 100).toFixed(1)}%)`);
  console.log(`  timber:  ${c.has_timber} (${(c.has_timber / c.total * 100).toFixed(1)}%)`);
  console.log(`  water:   ${c.has_water} (${(c.has_water / c.total * 100).toFixed(1)}%)`);

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
