/**
 * Fill empty land cells with default resources based on latitude and biome.
 * Also assign fish to coastal water cells.
 *
 * Every land cell should have at least one resource.
 *
 * Usage: npx tsx src/engine/v2/fill-empty-resources.ts
 */

import { query } from "../../db/pool.js";

async function run() {
  // Stats before
  const before = await query(`
    SELECT
      COUNT(*) FILTER (WHERE cell_type = 'land') as total_land,
      COUNT(*) FILTER (WHERE cell_type = 'land' AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) > 0) as land_with,
      COUNT(*) FILTER (WHERE cell_type = 'land' AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0) as land_empty,
      COUNT(*) FILTER (WHERE cell_type = 'water') as total_water
    FROM mesh_cells
  `);
  const b = before.rows[0];
  console.log(`Before: ${b.total_land} land (${b.land_with} with resources, ${b.land_empty} empty), ${b.total_water} water`);

  // ── Fill empty land cells based on latitude bands ──

  // Tropical (23.5S to 23.5N): timber, water, fertile
  let r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"timber","quantity":4},{"type":"water","quantity":3},{"type":"fertile","quantity":3}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
    AND seed_lat BETWEEN -23.5 AND 23.5
  `);
  console.log(`Tropical (23.5S-23.5N): filled ${r.rowCount} cells with timber/water/fertile`);

  // Subtropical (23.5-35 and -35 to -23.5): fertile, water
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"fertile","quantity":4},{"type":"water","quantity":2}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
    AND (seed_lat BETWEEN 23.5 AND 35 OR seed_lat BETWEEN -35 AND -23.5)
  `);
  console.log(`Subtropical: filled ${r.rowCount} cells with fertile/water`);

  // Temperate (35-55 and -55 to -35): fertile, timber
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"fertile","quantity":3},{"type":"timber","quantity":3}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
    AND (seed_lat BETWEEN 35 AND 55 OR seed_lat BETWEEN -55 AND -35)
  `);
  console.log(`Temperate: filled ${r.rowCount} cells with fertile/timber`);

  // Boreal (55-67 and -67 to -55): timber, stone
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"timber","quantity":4},{"type":"stone","quantity":2}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
    AND (seed_lat BETWEEN 55 AND 67 OR seed_lat BETWEEN -67 AND -55)
  `);
  console.log(`Boreal: filled ${r.rowCount} cells with timber/stone`);

  // Arctic/Antarctic (>67 or <-67): stone, ice
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"stone","quantity":2}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
    AND (seed_lat > 67 OR seed_lat < -67)
  `);
  console.log(`Arctic/Antarctic: filled ${r.rowCount} cells with stone`);

  // Desert regions (known arid zones that might still be empty)
  // Sahara
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"stone","quantity":3},{"type":"oil","quantity":2}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
    AND seed_lat BETWEEN 15 AND 35 AND seed_lng BETWEEN -17 AND 40
  `);
  console.log(`Sahara: filled ${r.rowCount} cells with stone/oil`);

  // Arabian desert
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"oil","quantity":5},{"type":"stone","quantity":2}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
    AND seed_lat BETWEEN 12 AND 32 AND seed_lng BETWEEN 35 AND 60
  `);
  console.log(`Arabian: filled ${r.rowCount} cells with oil/stone`);

  // Australian outback
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"iron","quantity":3},{"type":"stone","quantity":3}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
    AND seed_lat BETWEEN -35 AND -15 AND seed_lng BETWEEN 115 AND 150
  `);
  console.log(`Australian outback: filled ${r.rowCount} cells with iron/stone`);

  // Central Asian steppe
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"stone","quantity":2},{"type":"copper","quantity":2}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
    AND seed_lat BETWEEN 35 AND 50 AND seed_lng BETWEEN 50 AND 90
  `);
  console.log(`Central Asian steppe: filled ${r.rowCount} cells with stone/copper`);

  // Catch any remaining empty land cells
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"stone","quantity":2},{"type":"water","quantity":1}]'::jsonb
    WHERE cell_type = 'land'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
  `);
  console.log(`Remaining empty land: filled ${r.rowCount} cells with stone/water`);

  // ── Fish in water cells (coastal focus) ──
  // Add fish to water cells that border land (coastal)
  r = await query(`
    UPDATE mesh_cells w SET resources = '[{"type":"fish","quantity":5}]'::jsonb
    WHERE w.cell_type = 'water'
    AND jsonb_array_length(COALESCE(w.resources, '[]'::jsonb)) = 0
    AND EXISTS (
      SELECT 1 FROM mesh_cells land
      WHERE land.cell_type = 'land'
      AND ABS(land.seed_lat - w.seed_lat) < 3
      AND ABS(land.seed_lng - w.seed_lng) < 3
    )
  `);
  console.log(`Coastal water: filled ${r.rowCount} cells with fish`);

  // Deep ocean — less fish
  r = await query(`
    UPDATE mesh_cells SET resources = '[{"type":"fish","quantity":2}]'::jsonb
    WHERE cell_type = 'water'
    AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0
  `);
  console.log(`Deep ocean: filled ${r.rowCount} cells with fish`);

  // Stats after
  const after = await query(`
    SELECT
      COUNT(*) FILTER (WHERE cell_type = 'land' AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) > 0) as land_with,
      COUNT(*) FILTER (WHERE cell_type = 'land' AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) = 0) as land_empty,
      COUNT(*) FILTER (WHERE cell_type = 'water' AND jsonb_array_length(COALESCE(resources, '[]'::jsonb)) > 0) as water_with
    FROM mesh_cells
  `);
  const a = after.rows[0];
  console.log(`\nAfter: ${a.land_with} land with resources (${a.land_empty} still empty), ${a.water_with} water with fish`);

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
