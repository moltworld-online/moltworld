/**
 * Assign wild plant and animal species to mesh cells based on geographic regions.
 * Cells outside specific regions get latitude-band defaults.
 *
 * Usage: npx tsx src/engine/v2/assign-species-to-mesh.ts
 */

import { query } from "../../db/pool.js";
import {
  SPECIES_REGIONS,
  DEFAULT_SPECIES_BY_CLIMATE,
  getClimateZone,
  PLANT_SPECIES,
  ANIMAL_SPECIES,
} from "./species-data.js";

async function run() {
  // Add columns
  console.log("Adding wild_species and climate_zone columns...");
  await query("ALTER TABLE mesh_cells ADD COLUMN IF NOT EXISTS wild_species JSONB DEFAULT '[]'::jsonb");
  await query("ALTER TABLE mesh_cells ADD COLUMN IF NOT EXISTS climate_zone TEXT");

  // Reset wild_species to empty
  await query("UPDATE mesh_cells SET wild_species = '[]'::jsonb WHERE cell_type = 'land'");

  // Compute climate zones from latitude
  console.log("Computing climate zones from latitude...");
  await query("UPDATE mesh_cells SET climate_zone = 'tropical' WHERE ABS(seed_lat) < 23.5 AND cell_type = 'land'");
  await query("UPDATE mesh_cells SET climate_zone = 'subtropical' WHERE ABS(seed_lat) >= 23.5 AND ABS(seed_lat) < 35 AND cell_type = 'land'");
  await query("UPDATE mesh_cells SET climate_zone = 'temperate' WHERE ABS(seed_lat) >= 35 AND ABS(seed_lat) < 55 AND cell_type = 'land'");
  await query("UPDATE mesh_cells SET climate_zone = 'boreal' WHERE ABS(seed_lat) >= 55 AND ABS(seed_lat) < 67 AND cell_type = 'land'");
  await query("UPDATE mesh_cells SET climate_zone = 'arctic' WHERE ABS(seed_lat) >= 67 AND cell_type = 'land'");

  // Water cells
  await query("UPDATE mesh_cells SET climate_zone = 'water' WHERE cell_type = 'water'");

  // Paint specific species regions onto cells
  console.log(`Painting ${SPECIES_REGIONS.length} species regions onto mesh cells...`);
  let totalAssigned = 0;

  for (const region of SPECIES_REGIONS) {
    const [south, west, north, east] = region.bounds;
    const result = await query(
      `UPDATE mesh_cells SET wild_species = wild_species || $1::jsonb
       WHERE seed_lat >= $2 AND seed_lat <= $3 AND seed_lng >= $4 AND seed_lng <= $5
       AND cell_type = 'land'`,
      [
        JSON.stringify([{ id: region.species_id, abundance: region.abundance }]),
        south, north, west, east,
      ]
    );
    totalAssigned += result.rowCount || 0;
  }
  console.log(`Assigned ${totalAssigned} species entries from specific regions.`);

  // Fill empty cells with climate-zone defaults
  console.log("Filling empty cells with climate-zone defaults...");
  for (const [zone, species] of Object.entries(DEFAULT_SPECIES_BY_CLIMATE)) {
    const result = await query(
      `UPDATE mesh_cells SET wild_species = $1::jsonb
       WHERE cell_type = 'land'
       AND climate_zone = $2
       AND jsonb_array_length(wild_species) = 0`,
      [JSON.stringify(species), zone]
    );
    console.log(`  ${zone}: filled ${result.rowCount} empty cells with ${species.length} default species`);
  }

  // Marine species for coastal water cells
  console.log("Adding marine species to water cells...");
  const sealResult = await query(
    `UPDATE mesh_cells SET wild_species = '[{"id":"seal","abundance":4}]'::jsonb
     WHERE cell_type = 'water' AND ABS(seed_lat) > 50`
  );
  console.log(`  Seal: ${sealResult.rowCount} cold water cells`);

  const whaleResult = await query(
    `UPDATE mesh_cells SET wild_species = '[{"id":"whale","abundance":3}]'::jsonb
     WHERE cell_type = 'water' AND ABS(seed_lat) > 40 AND jsonb_array_length(wild_species) = 0`
  );
  console.log(`  Whale: ${whaleResult.rowCount} ocean cells`);

  // Stats
  console.log("\n--- Species Distribution ---");

  const allSpeciesIds = [...PLANT_SPECIES.map(p => p.id), ...ANIMAL_SPECIES.map(a => a.id)];
  const stats = await query(`
    SELECT
      s->>'id' as species_id,
      COUNT(*) as cell_count,
      ROUND(AVG((s->>'abundance')::numeric), 1) as avg_abundance
    FROM mesh_cells, jsonb_array_elements(wild_species) s
    WHERE jsonb_array_length(wild_species) > 0
    GROUP BY s->>'id'
    ORDER BY cell_count DESC
  `);

  console.log("\nPlants:");
  for (const s of stats.rows) {
    const def = PLANT_SPECIES.find(p => p.id === s.species_id);
    if (def) console.log(`  ${def.name}: ${s.cell_count} cells, avg abundance ${s.avg_abundance}`);
  }

  console.log("\nAnimals:");
  for (const s of stats.rows) {
    const def = ANIMAL_SPECIES.find(a => a.id === s.species_id);
    if (def) console.log(`  ${def.name}: ${s.cell_count} cells, avg abundance ${s.avg_abundance}`);
  }

  const cellsWithSpecies = await query("SELECT COUNT(*) as c FROM mesh_cells WHERE jsonb_array_length(wild_species) > 0");
  const totalLand = await query("SELECT COUNT(*) as c FROM mesh_cells WHERE cell_type = 'land'");
  console.log(`\nTotal: ${cellsWithSpecies.rows[0].c} cells with species / ${totalLand.rows[0].c} land cells`);

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
