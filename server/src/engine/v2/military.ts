/**
 * Military & Conflict Engine v2 — implements Section 11 of world rules
 *
 * military_strength = soldiers × equipment_factor × training_level × morale × leadership
 * Combat is resolved per the battle_outcome_ratio formula with terrain modifiers.
 * Occupation requires sustained presence over multiple cycles.
 */

import { EQUIPMENT_FACTORS, TERRAIN_MODIFIERS } from "./constants.js";
import type pg from "pg";

export interface MilitaryState {
  totalSoldiers: number;
  strength: number;
  equipmentTier: string;
  trainingLevel: number;
}

export interface BattleResult {
  attackerCasualties: number;
  defenderCasualties: number;
  outcomeRatio: number;
  winner: "attacker" | "defender" | "stalemate";
  routed: boolean;
  capturedSoldiers: number;
}

/**
 * Calculate total military strength for a nation.
 */
export async function calculateMilitaryStrength(
  client: pg.PoolClient,
  nationId: number,
  discoveredTechs: string[],
  socialCohesion: number,
): Promise<MilitaryState> {
  // Count soldiers (humans assigned to military task)
  const soldiers = await client.query(
    "SELECT COUNT(*) as count, AVG(skill_combat) as avg_combat FROM humans WHERE nation_id = $1 AND alive = TRUE AND task = 'military'",
    [nationId]
  );

  const totalSoldiers = parseInt(soldiers.rows[0]?.count || "0");
  const avgCombat = parseFloat(soldiers.rows[0]?.avg_combat || "0");

  // Determine best equipment available
  let equipmentTier = "unarmed";
  let equipmentFactor = 0.5;
  for (const [tier, def] of Object.entries(EQUIPMENT_FACTORS)) {
    if (!def.prereq || discoveredTechs.includes(def.prereq)) {
      if (def.factor > equipmentFactor) {
        equipmentTier = tier;
        equipmentFactor = def.factor;
      }
    }
  }

  // Training level: 0.5 (militia) to 2.0 (professional, 5+ years)
  const trainingLevel = Math.min(2.0, 0.5 + avgCombat * 0.75);

  // Morale from social cohesion
  const morale = Math.max(0.3, socialCohesion / 100);

  // Leadership (from highest leadership skill among soldiers)
  const leader = await client.query(
    "SELECT MAX(skill_leadership) as max_lead FROM humans WHERE nation_id = $1 AND alive = TRUE AND task = 'military'",
    [nationId]
  );
  const leadership = 0.8 + (parseFloat(leader.rows[0]?.max_lead || "0") * 0.2);

  const strength = totalSoldiers * equipmentFactor * trainingLevel * morale * leadership;

  await client.query(
    "UPDATE nations SET military_strength = $1 WHERE id = $2",
    [strength, nationId]
  );

  return { totalSoldiers, strength, equipmentTier, trainingLevel };
}

/**
 * Resolve a battle between two forces.
 *
 * battle_outcome_ratio = attacker_strength / defender_strength × terrain_modifier × fortification_modifier
 *
 * Casualties:
 *   attacker_casualties = attacker_soldiers × 0.1 × (1 / battle_outcome_ratio)
 *   defender_casualties = defender_soldiers × 0.1 × battle_outcome_ratio
 *
 * If ratio > 3.0, losing side routs (50% captured, 50% escape).
 */
export function resolveBattle(
  attackerStrength: number,
  attackerSoldiers: number,
  defenderStrength: number,
  defenderSoldiers: number,
  terrain: string,
  hasWalls: boolean,
  isSurprise: boolean,
): BattleResult {
  const terrainMod = TERRAIN_MODIFIERS[terrain] || 1.0;
  const wallMod = hasWalls ? TERRAIN_MODIFIERS.walls : 1.0;
  const surpriseMod = isSurprise ? TERRAIN_MODIFIERS.surprise : 1.0;

  const effectiveAttack = attackerStrength * terrainMod * wallMod * surpriseMod;
  const outcomeRatio = defenderStrength > 0 ? effectiveAttack / defenderStrength : 10.0;

  // Casualties
  const attackerCasualtyRate = outcomeRatio > 0 ? 0.1 * (1 / outcomeRatio) : 0.1;
  const defenderCasualtyRate = 0.1 * outcomeRatio;

  const attackerCasualties = Math.min(attackerSoldiers, Math.floor(attackerSoldiers * Math.min(0.5, attackerCasualtyRate)));
  const defenderCasualties = Math.min(defenderSoldiers, Math.floor(defenderSoldiers * Math.min(0.5, defenderCasualtyRate)));

  // Rout check
  const routed = outcomeRatio > 3.0 || outcomeRatio < 0.33;
  let capturedSoldiers = 0;
  let winner: "attacker" | "defender" | "stalemate";

  if (outcomeRatio > 1.5) {
    winner = "attacker";
    if (routed) {
      capturedSoldiers = Math.floor((defenderSoldiers - defenderCasualties) * 0.5);
    }
  } else if (outcomeRatio < 0.67) {
    winner = "defender";
    if (routed) {
      capturedSoldiers = Math.floor((attackerSoldiers - attackerCasualties) * 0.5);
    }
  } else {
    winner = "stalemate";
  }

  return {
    attackerCasualties,
    defenderCasualties,
    outcomeRatio,
    winner,
    routed,
    capturedSoldiers,
  };
}

/**
 * Apply battle casualties to actual humans in the database.
 */
export async function applyCasualties(
  client: pg.PoolClient,
  nationId: number,
  casualties: number,
): Promise<void> {
  if (casualties <= 0) return;

  await client.query(
    `UPDATE humans SET alive = FALSE WHERE id IN (
      SELECT id FROM humans WHERE nation_id = $1 AND alive = TRUE AND task = 'military'
      ORDER BY RANDOM() LIMIT $2
    )`,
    [nationId, casualties]
  );

  // Update population count
  await client.query(
    "UPDATE nations SET population = (SELECT COUNT(*) FROM humans WHERE nation_id = $1 AND alive = TRUE) WHERE id = $1",
    [nationId]
  );
}
