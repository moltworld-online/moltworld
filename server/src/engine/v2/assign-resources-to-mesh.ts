/**
 * Assign resources to mesh cells based on geographic overlap with resource regions.
 * Each land cell gets a resources JSONB field with the resources present at its location.
 *
 * Usage: npx tsx src/engine/v2/assign-resources-to-mesh.ts
 */

import { query } from "../../db/pool.js";

// Import the same resource regions used by the frontend
// These are [south_lat, west_lng, north_lat, east_lng] bounds
const RESOURCE_REGIONS: Array<{ type: string; bounds: [number, number, number, number]; quantity: number }> = [
  // FRESH WATER
  { type: "water", bounds: [41.0, -92.0, 49.0, -76.0], quantity: 10 },
  { type: "water", bounds: [29.0, -95.0, 47.0, -82.0], quantity: 9 },
  { type: "water", bounds: [38.0, -112.0, 48.5, -90.5], quantity: 7 },
  { type: "water", bounds: [36.5, -89.0, 41.0, -79.0], quantity: 7 },
  { type: "water", bounds: [43.0, -122.0, 49.5, -114.0], quantity: 6 },
  { type: "water", bounds: [25.0, -82.0, 31.0, -79.0], quantity: 5 },
  { type: "water", bounds: [-3.0, -62.0, 2.0, -50.0], quantity: 10 },
  { type: "water", bounds: [-15.0, -58.0, -5.0, -48.0], quantity: 8 },
  { type: "water", bounds: [-35.0, -62.0, -28.0, -55.0], quantity: 7 },
  { type: "water", bounds: [4.0, 28.0, 14.0, 38.0], quantity: 9 },
  { type: "water", bounds: [-6.0, 29.0, 3.0, 36.0], quantity: 9 },
  { type: "water", bounds: [30.0, 73.0, 35.0, 82.0], quantity: 8 },
  { type: "water", bounds: [22.0, 88.0, 27.0, 92.0], quantity: 9 },
  { type: "water", bounds: [28.0, 86.0, 32.0, 97.0], quantity: 7 },
  { type: "water", bounds: [46.0, 5.0, 48.0, 15.0], quantity: 7 },
  { type: "water", bounds: [43.0, 0.0, 47.0, 8.0], quantity: 6 },
  { type: "water", bounds: [47.0, 22.0, 54.0, 40.0], quantity: 8 },
  { type: "water", bounds: [50.0, 68.0, 60.0, 90.0], quantity: 7 },
  { type: "water", bounds: [25.0, 100.0, 30.0, 115.0], quantity: 8 },
  { type: "water", bounds: [-4.0, 104.0, 6.0, 116.0], quantity: 6 },
  { type: "water", bounds: [-38.0, 140.0, -28.0, 152.0], quantity: 6 },

  // FERTILE LAND
  { type: "fertile", bounds: [35.0, -100.0, 49.0, -80.0], quantity: 9 },
  { type: "fertile", bounds: [30.0, -98.0, 37.0, -85.0], quantity: 8 },
  { type: "fertile", bounds: [36.0, -122.0, 48.0, -110.0], quantity: 6 },
  { type: "fertile", bounds: [-10.0, -60.0, 5.0, -45.0], quantity: 8 },
  { type: "fertile", bounds: [-35.0, -63.0, -20.0, -48.0], quantity: 9 },
  { type: "fertile", bounds: [45.0, -5.0, 55.0, 15.0], quantity: 9 },
  { type: "fertile", bounds: [45.0, 25.0, 55.0, 45.0], quantity: 8 },
  { type: "fertile", bounds: [25.0, 72.0, 35.0, 88.0], quantity: 9 },
  { type: "fertile", bounds: [20.0, 100.0, 32.0, 120.0], quantity: 8 },
  { type: "fertile", bounds: [-5.0, 95.0, 8.0, 120.0], quantity: 7 },
  { type: "fertile", bounds: [-2.0, 28.0, 5.0, 40.0], quantity: 7 },
  { type: "fertile", bounds: [5.0, -10.0, 15.0, 10.0], quantity: 6 },
  { type: "fertile", bounds: [-20.0, 25.0, -10.0, 40.0], quantity: 6 },
  { type: "fertile", bounds: [-40.0, 140.0, -25.0, 155.0], quantity: 7 },
  { type: "fertile", bounds: [-48.0, 165.0, -34.0, 178.0], quantity: 6 },

  // TIMBER
  { type: "timber", bounds: [45.0, -130.0, 60.0, -110.0], quantity: 9 },
  { type: "timber", bounds: [40.0, -90.0, 50.0, -70.0], quantity: 7 },
  { type: "timber", bounds: [-10.0, -70.0, 5.0, -45.0], quantity: 10 },
  { type: "timber", bounds: [-5.0, 10.0, 5.0, 30.0], quantity: 9 },
  { type: "timber", bounds: [55.0, 30.0, 65.0, 90.0], quantity: 8 },
  { type: "timber", bounds: [55.0, 90.0, 65.0, 140.0], quantity: 8 },
  { type: "timber", bounds: [-5.0, 95.0, 5.0, 120.0], quantity: 8 },
  { type: "timber", bounds: [45.0, 0.0, 55.0, 15.0], quantity: 6 },
  { type: "timber", bounds: [-20.0, 42.0, -10.0, 50.0], quantity: 5 },
  { type: "timber", bounds: [-8.0, 140.0, -2.0, 155.0], quantity: 7 },

  // IRON
  { type: "iron", bounds: [45.0, -95.0, 50.0, -82.0], quantity: 9 },
  { type: "iron", bounds: [-25.0, -55.0, -15.0, -40.0], quantity: 8 },
  { type: "iron", bounds: [55.0, 55.0, 65.0, 70.0], quantity: 8 },
  { type: "iron", bounds: [20.0, 68.0, 30.0, 80.0], quantity: 7 },
  { type: "iron", bounds: [-35.0, 135.0, -25.0, 150.0], quantity: 7 },
  { type: "iron", bounds: [35.0, 105.0, 45.0, 120.0], quantity: 7 },
  { type: "iron", bounds: [55.0, 5.0, 65.0, 25.0], quantity: 6 },
  { type: "iron", bounds: [-5.0, 10.0, 5.0, 20.0], quantity: 5 },
  { type: "iron", bounds: [15.0, -10.0, 25.0, 0.0], quantity: 5 },

  // COPPER
  { type: "copper", bounds: [-20.0, -70.0, -15.0, -65.0], quantity: 9 },
  { type: "copper", bounds: [30.0, -115.0, 40.0, -105.0], quantity: 7 },
  { type: "copper", bounds: [-15.0, 25.0, -5.0, 30.0], quantity: 8 },
  { type: "copper", bounds: [35.0, 58.0, 42.0, 68.0], quantity: 6 },
  { type: "copper", bounds: [-40.0, 145.0, -30.0, 150.0], quantity: 6 },
  { type: "copper", bounds: [25.0, 100.0, 30.0, 108.0], quantity: 5 },

  // COAL
  { type: "coal", bounds: [35.0, -85.0, 42.0, -75.0], quantity: 8 },
  { type: "coal", bounds: [30.0, 110.0, 42.0, 120.0], quantity: 9 },
  { type: "coal", bounds: [50.0, -5.0, 55.0, 5.0], quantity: 7 },
  { type: "coal", bounds: [20.0, 78.0, 28.0, 88.0], quantity: 8 },
  { type: "coal", bounds: [-35.0, 148.0, -28.0, 152.0], quantity: 7 },
  { type: "coal", bounds: [48.0, 30.0, 55.0, 50.0], quantity: 7 },
  { type: "coal", bounds: [50.0, 75.0, 58.0, 95.0], quantity: 6 },
  { type: "coal", bounds: [-30.0, 25.0, -25.0, 32.0], quantity: 5 },

  // OIL
  { type: "oil", bounds: [20.0, 40.0, 35.0, 55.0], quantity: 10 },
  { type: "oil", bounds: [55.0, 60.0, 70.0, 80.0], quantity: 9 },
  { type: "oil", bounds: [25.0, -100.0, 35.0, -88.0], quantity: 8 },
  { type: "oil", bounds: [50.0, -120.0, 60.0, -110.0], quantity: 7 },
  { type: "oil", bounds: [-5.0, -80.0, 12.0, -70.0], quantity: 7 },
  { type: "oil", bounds: [0.0, 5.0, 8.0, 12.0], quantity: 8 },
  { type: "oil", bounds: [35.0, 45.0, 42.0, 55.0], quantity: 6 },
  { type: "oil", bounds: [15.0, 100.0, 22.0, 108.0], quantity: 5 },

  // GOLD
  { type: "gold", bounds: [-30.0, 25.0, -22.0, 32.0], quantity: 9 },
  { type: "gold", bounds: [35.0, -122.0, 42.0, -115.0], quantity: 6 },
  { type: "gold", bounds: [-8.0, -78.0, 2.0, -72.0], quantity: 7 },
  { type: "gold", bounds: [-35.0, 143.0, -25.0, 150.0], quantity: 7 },
  { type: "gold", bounds: [5.0, -5.0, 12.0, 2.0], quantity: 6 },
  { type: "gold", bounds: [38.0, 65.0, 44.0, 72.0], quantity: 5 },

  // LITHIUM
  { type: "lithium", bounds: [-25.0, -70.0, -18.0, -64.0], quantity: 10 },
  { type: "lithium", bounds: [-35.0, 135.0, -28.0, 142.0], quantity: 8 },
  { type: "lithium", bounds: [30.0, 85.0, 38.0, 95.0], quantity: 6 },
  { type: "lithium", bounds: [-15.0, 25.0, -10.0, 30.0], quantity: 5 },

  // FISH
  { type: "fish", bounds: [50.0, -60.0, 65.0, -40.0], quantity: 9 },
  { type: "fish", bounds: [-10.0, -85.0, 5.0, -75.0], quantity: 8 },
  { type: "fish", bounds: [55.0, -5.0, 70.0, 20.0], quantity: 8 },
  { type: "fish", bounds: [30.0, 125.0, 45.0, 145.0], quantity: 7 },
  { type: "fish", bounds: [-45.0, -70.0, -35.0, -55.0], quantity: 7 },
  { type: "fish", bounds: [-10.0, 38.0, 10.0, 55.0], quantity: 6 },
  { type: "fish", bounds: [-50.0, 60.0, -35.0, 80.0], quantity: 5 },
];

function pointInBounds(lat: number, lng: number, bounds: [number, number, number, number]): boolean {
  const [south, west, north, east] = bounds;
  return lat >= south && lat <= north && lng >= west && lng <= east;
}

async function run() {
  console.log("Adding resources column to mesh_cells...");
  await query("ALTER TABLE mesh_cells ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '[]'::jsonb");

  console.log(`Processing ${RESOURCE_REGIONS.length} resource regions against mesh cells...`);

  // For each resource region, find all mesh cells whose seed point falls within it
  let totalAssigned = 0;

  for (const region of RESOURCE_REGIONS) {
    const [south, west, north, east] = region.bounds;
    const result = await query(
      `UPDATE mesh_cells SET resources = resources || $1::jsonb
       WHERE seed_lat >= $2 AND seed_lat <= $3 AND seed_lng >= $4 AND seed_lng <= $5
       AND cell_type = 'land'`,
      [
        JSON.stringify([{ type: region.type, quantity: region.quantity }]),
        south, north, west, east,
      ]
    );
    totalAssigned += result.rowCount || 0;
  }

  console.log(`Assigned ${totalAssigned} resource entries to mesh cells.`);

  // Stats
  const stats = await query(`
    SELECT
      r->>'type' as resource_type,
      COUNT(*) as cell_count,
      ROUND(AVG((r->>'quantity')::numeric), 1) as avg_quantity
    FROM mesh_cells, jsonb_array_elements(resources) r
    WHERE jsonb_array_length(resources) > 0
    GROUP BY r->>'type'
    ORDER BY cell_count DESC
  `);
  console.log("\nResource distribution:");
  for (const s of stats.rows) {
    console.log(`  ${s.resource_type}: ${s.cell_count} cells, avg qty ${s.avg_quantity}`);
  }

  const cellsWithResources = await query("SELECT COUNT(*) as c FROM mesh_cells WHERE jsonb_array_length(resources) > 0");
  console.log(`\nTotal cells with resources: ${cellsWithResources.rows[0].c} / 90946`);

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
