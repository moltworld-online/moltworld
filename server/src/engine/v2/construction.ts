/**
 * Construction Engine v2 — implements Section 8 of world rules
 *
 * Structures require labor-hours and materials to build.
 * They provide shelter, storage, defense, and production bonuses.
 * All structures decay without maintenance.
 */

import { STRUCTURES } from "./constants.js";
import type pg from "pg";

export interface BuildOrder {
  structureType: keyof typeof STRUCTURES;
  tileX: number;
  tileY: number;
}

/**
 * Start or continue building a structure.
 * Returns labor-hours actually applied.
 */
export async function applyConstructionLabor(
  client: pg.PoolClient,
  nationId: number,
  tileX: number,
  tileY: number,
  structureType: string,
  laborHours: number,
  tick: number,
): Promise<{ applied: number; completed: boolean; error?: string }> {
  const def = STRUCTURES[structureType as keyof typeof STRUCTURES];
  if (!def) return { applied: 0, completed: false, error: `Unknown structure: ${structureType}` };

  // Check if there's an existing incomplete structure at this tile
  let structure = await client.query(
    "SELECT id, labor_invested, labor_required, completed FROM structures WHERE nation_id = $1 AND tile_x = $2 AND tile_y = $3 AND structure_type = $4 AND NOT completed",
    [nationId, tileX, tileY, structureType]
  );

  if (structure.rows.length === 0) {
    // Check materials
    const materials = def.materials as Record<string, number>;
    for (const [mat, qty] of Object.entries(materials)) {
      const have = await client.query(
        `SELECT ${mat} FROM nations WHERE id = $1`,
        [nationId]
      );
      if (!have.rows[0] || have.rows[0][mat] < qty) {
        return { applied: 0, completed: false, error: `Need ${qty} ${mat}, have ${have.rows[0]?.[mat] ?? 0}` };
      }
    }

    // Deduct materials
    for (const [mat, qty] of Object.entries(materials)) {
      await client.query(
        `UPDATE nations SET ${mat} = ${mat} - $1 WHERE id = $2`,
        [qty, nationId]
      );
    }

    // Create structure record
    await client.query(
      `INSERT INTO structures (nation_id, structure_type, tile_x, tile_y, labor_invested, labor_required)
       VALUES ($1, $2, $3, $4, 0, $5)`,
      [nationId, structureType, tileX, tileY, def.labor]
    );

    structure = await client.query(
      "SELECT id, labor_invested, labor_required FROM structures WHERE nation_id = $1 AND tile_x = $2 AND tile_y = $3 AND structure_type = $4 AND NOT completed",
      [nationId, tileX, tileY, structureType]
    );
  }

  if (structure.rows.length === 0) return { applied: 0, completed: false, error: "Failed to create structure" };

  const s = structure.rows[0];
  const remaining = s.labor_required - s.labor_invested;
  const applied = Math.min(laborHours, remaining);

  await client.query(
    "UPDATE structures SET labor_invested = labor_invested + $1 WHERE id = $2",
    [applied, s.id]
  );

  const nowCompleted = (s.labor_invested + applied) >= s.labor_required;
  if (nowCompleted) {
    await client.query(
      "UPDATE structures SET completed = TRUE, built_tick = $1 WHERE id = $2",
      [tick, s.id]
    );
  }

  return { applied, completed: nowCompleted };
}

/**
 * Process structure decay for all structures of a nation.
 * Structures lose integrity each tick without maintenance.
 */
export async function processStructureDecay(
  client: pg.PoolClient,
  nationId: number,
  maintenanceLaborAvailable: number,
): Promise<{ maintained: number; decayed: number; destroyed: number }> {
  const structures = await client.query(
    "SELECT id, structure_type, integrity FROM structures WHERE nation_id = $1 AND completed = TRUE",
    [nationId]
  );

  let maintained = 0;
  let decayed = 0;
  let destroyed = 0;
  let laborRemaining = maintenanceLaborAvailable;

  for (const s of structures.rows) {
    const def = STRUCTURES[s.structure_type as keyof typeof STRUCTURES];
    if (!def) continue;

    const maintenanceNeeded = (def.maintenance || 10) / 360; // Convert annual to per-tick

    if (laborRemaining >= maintenanceNeeded) {
      laborRemaining -= maintenanceNeeded;
      // Maintain — restore integrity slightly
      const newIntegrity = Math.min(1.0, s.integrity + 0.001);
      await client.query("UPDATE structures SET integrity = $1 WHERE id = $2", [newIntegrity, s.id]);
      maintained++;
    } else {
      // Decay
      const decayRate = 0.002; // ~0.2% per tick without maintenance
      const newIntegrity = Math.max(0, s.integrity - decayRate);
      if (newIntegrity <= 0) {
        await client.query("DELETE FROM structures WHERE id = $1", [s.id]);
        destroyed++;
      } else {
        await client.query("UPDATE structures SET integrity = $1 WHERE id = $2", [newIntegrity, s.id]);
        decayed++;
      }
    }
  }

  return { maintained, decayed, destroyed };
}

/**
 * Get shelter capacity for a nation (total people that can be sheltered).
 */
export async function getShelterCapacity(
  client: pg.PoolClient,
  nationId: number,
): Promise<number> {
  const result = await client.query(
    "SELECT structure_type, integrity FROM structures WHERE nation_id = $1 AND completed = TRUE",
    [nationId]
  );

  let totalCapacity = 0;
  for (const s of result.rows) {
    const def = STRUCTURES[s.structure_type as keyof typeof STRUCTURES];
    if (def && "shelterCap" in def) {
      totalCapacity += (def as any).shelterCap * s.integrity;
    }
  }

  return Math.floor(totalCapacity);
}

/**
 * Get food storage capacity for a nation.
 */
export async function getStorageCapacity(
  client: pg.PoolClient,
  nationId: number,
): Promise<number> {
  const result = await client.query(
    "SELECT structure_type, integrity FROM structures WHERE nation_id = $1 AND completed = TRUE AND structure_type = 'granary'",
    [nationId]
  );

  let totalCapacity = 0;
  for (const s of result.rows) {
    const def = STRUCTURES[s.structure_type as keyof typeof STRUCTURES];
    if (def && "storeCap" in def) {
      totalCapacity += (def as any).storeCap * s.integrity;
    }
  }

  return Math.floor(totalCapacity);
}
