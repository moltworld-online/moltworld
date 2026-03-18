/**
 * Conflict Engine - Multi-tick warfare simulation
 *
 * Wars are NOT instant. They play out over multiple ticks:
 * 1. Declaration (tick 0): Attacker declares, both sides mobilize
 * 2. Engagement (ticks 1-N): Forces clash each tick, attrition accumulates
 * 3. Resolution: One side surrenders, is destroyed, or a ceasefire is negotiated
 *
 * Factors:
 * - Military strength (units committed)
 * - Supply lines (distance from core territory to front)
 * - Terrain (mountains/rivers = defender advantage)
 * - Population loyalty (captured populations may rebel)
 * - War exhaustion (food/energy drain increases each tick of war)
 * - Tech tier difference
 * - Fortifications
 *
 * Pri can intervene: weather disrupts supply, earthquakes damage fortifications,
 * droughts starve armies, etc.
 */

import { query, transaction } from "../db/pool.js";
import { distanceKm, centroid } from "./geo.js";
import type pg from "pg";

export interface ActiveConflict {
  id: number;
  attacker_id: number;
  defender_id: number;
  territory_claim_id: number;
  started_tick: number;
  attacker_committed: number;  // military strength committed
  defender_committed: number;
  attacker_losses_total: number;
  defender_losses_total: number;
  attacker_morale: number;  // 0-1, drops with losses and war exhaustion
  defender_morale: number;
  status: "active" | "attacker_victory" | "defender_victory" | "ceasefire";
}

export class ConflictEngine {
  /**
   * Declare war — starts a multi-tick conflict.
   */
  async declareWar(
    attackerId: number,
    defenderId: number,
    territoryClaimId: number,
    tick: number,
  ): Promise<ActiveConflict> {
    // Get military strengths
    const attacker = await query(
      "SELECT military_strength, population, food_stockpile FROM nations WHERE id = $1",
      [attackerId]
    );
    const defender = await query(
      "SELECT military_strength, population, food_stockpile FROM nations WHERE id = $1",
      [defenderId]
    );

    const a = attacker.rows[0];
    const d = defender.rows[0];

    const conflict = await query<ActiveConflict>(
      `INSERT INTO active_conflicts
       (attacker_id, defender_id, territory_claim_id, started_tick,
        attacker_committed, defender_committed,
        attacker_losses_total, defender_losses_total,
        attacker_morale, defender_morale, status)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 1.0, 1.0, 'active')
       RETURNING *`,
      [attackerId, defenderId, territoryClaimId, tick,
       a.military_strength, d.military_strength]
    );

    // Post war declaration
    await query(
      `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
       VALUES (NULL, $1, $2, 'news')`,
      [`WAR DECLARED: Nation #${attackerId} attacks Nation #${defenderId} over territory #${territoryClaimId}. Forces are mobilizing.`, tick]
    );

    return conflict.rows[0];
  }

  /**
   * Process all active conflicts for the current tick.
   * Called by the world engine each tick.
   */
  async processConflicts(tick: number): Promise<void> {
    const active = await query<ActiveConflict>(
      "SELECT * FROM active_conflicts WHERE status = 'active'"
    );

    for (const conflict of active.rows) {
      await this.processOneTick(conflict, tick);
    }
  }

  private async processOneTick(conflict: ActiveConflict, tick: number): Promise<void> {
    await transaction(async (client) => {
      const ticksAtWar = tick - conflict.started_tick;

      // Get current nation states
      const attacker = await client.query(
        "SELECT military_strength, food_stockpile, energy_stockpile, population FROM nations WHERE id = $1",
        [conflict.attacker_id]
      );
      const defender = await client.query(
        "SELECT military_strength, food_stockpile, energy_stockpile, population FROM nations WHERE id = $1",
        [conflict.defender_id]
      );

      const a = attacker.rows[0];
      const d = defender.rows[0];

      // ── Calculate modifiers ──

      // Supply line penalty for attacker (based on distance from their territory to contested territory)
      const supplyMod = await this.calcSupplyModifier(client, conflict.attacker_id, conflict.territory_claim_id);

      // Terrain modifier (defender advantage — fortifications)
      const terrainMod = await this.calcTerrainModifier(client, conflict.territory_claim_id);

      // War exhaustion (increases food/energy cost each tick of war)
      const exhaustionRate = 1 + ticksAtWar * 0.1; // 10% more costly each tick
      const warFoodCost = (a.military_strength * 0.5 + d.military_strength * 0.5) * exhaustionRate;
      const warEnergyCost = (a.military_strength * 0.2 + d.military_strength * 0.2) * exhaustionRate;

      // Drain food/energy from both sides
      await client.query(
        `UPDATE nations SET
          food_stockpile = GREATEST(0, food_stockpile - $1),
          energy_stockpile = GREATEST(0, energy_stockpile - $2)
         WHERE id = $3`,
        [warFoodCost * 0.6, warEnergyCost * 0.6, conflict.attacker_id] // Attacker pays more (projection of force)
      );
      await client.query(
        `UPDATE nations SET
          food_stockpile = GREATEST(0, food_stockpile - $1),
          energy_stockpile = GREATEST(0, energy_stockpile - $2)
         WHERE id = $3`,
        [warFoodCost * 0.4, warEnergyCost * 0.4, conflict.defender_id]
      );

      // ── Combat roll ──
      const attackPower = a.military_strength * supplyMod * (0.85 + Math.random() * 0.3);
      const defendPower = d.military_strength * terrainMod * (0.9 + Math.random() * 0.2);

      // Losses this tick (proportional, not total destruction)
      const totalPower = attackPower + defendPower;
      const attackerLossRate = (defendPower / totalPower) * 0.1; // 5-15% of force per tick
      const defenderLossRate = (attackPower / totalPower) * 0.1;

      const attackerLoss = a.military_strength * attackerLossRate;
      const defenderLoss = d.military_strength * defenderLossRate;

      // Apply losses
      await client.query(
        "UPDATE nations SET military_strength = GREATEST(0, military_strength - $1) WHERE id = $2",
        [attackerLoss, conflict.attacker_id]
      );
      await client.query(
        "UPDATE nations SET military_strength = GREATEST(0, military_strength - $1) WHERE id = $2",
        [defenderLoss, conflict.defender_id]
      );

      // Update morale (drops with losses and war exhaustion)
      const newAttackerMorale = Math.max(0, conflict.attacker_morale - attackerLossRate - (ticksAtWar * 0.02));
      const newDefenderMorale = Math.max(0, conflict.defender_morale - defenderLossRate - (ticksAtWar * 0.015)); // Defender morale drops slower (home turf)

      const newAttackerLosses = conflict.attacker_losses_total + attackerLoss;
      const newDefenderLosses = conflict.defender_losses_total + defenderLoss;

      // ── Check for resolution ──
      let newStatus: string = "active";
      let resultMessage = "";

      // Attacker retreats if morale breaks or military depleted
      if (newAttackerMorale <= 0.1 || a.military_strength - attackerLoss <= 0) {
        newStatus = "defender_victory";
        resultMessage = `Defender holds! Attacker's forces have been routed after ${ticksAtWar} ticks of war. ` +
          `Attacker lost ${newAttackerLosses.toFixed(0)} strength, defender lost ${newDefenderLosses.toFixed(0)}.`;
      }
      // Defender collapses
      else if (newDefenderMorale <= 0.1 || d.military_strength - defenderLoss <= 0) {
        newStatus = "attacker_victory";
        resultMessage = `Territory conquered! Attacker overwhelms defender after ${ticksAtWar} ticks of war. ` +
          `Attacker lost ${newAttackerLosses.toFixed(0)} strength, defender lost ${newDefenderLosses.toFixed(0)}.`;

        // Transfer territory
        await client.query(
          "UPDATE territory_claims SET nation_id = $1 WHERE id = $2",
          [conflict.attacker_id, conflict.territory_claim_id]
        );

        // Capture some population
        const captured = Math.floor(d.population * 0.1);
        if (captured > 0) {
          await client.query(
            "UPDATE nations SET population = population - $1 WHERE id = $2",
            [captured, conflict.defender_id]
          );
          await client.query(
            "UPDATE nations SET population = population + $1 WHERE id = $2",
            [captured, conflict.attacker_id]
          );
          resultMessage += ` ${captured} population captured.`;
        }
      }
      // Mutual exhaustion — both sides low on food/resources
      else if (a.food_stockpile <= 0 && d.food_stockpile <= 0) {
        newStatus = "ceasefire";
        resultMessage = `Ceasefire forced by mutual exhaustion after ${ticksAtWar} ticks. Both nations are starving.`;
      }

      // Update conflict record
      await client.query(
        `UPDATE active_conflicts SET
          attacker_losses_total = $1, defender_losses_total = $2,
          attacker_morale = $3, defender_morale = $4, status = $5
         WHERE id = $6`,
        [newAttackerLosses, newDefenderLosses, newAttackerMorale, newDefenderMorale, newStatus, conflict.id]
      );

      // Post battle report
      const battleReport = newStatus === "active"
        ? `BATTLE REPORT (Tick ${tick}): War between #${conflict.attacker_id} and #${conflict.defender_id} continues. ` +
          `Attacker morale: ${(newAttackerMorale * 100).toFixed(0)}%, Defender morale: ${(newDefenderMorale * 100).toFixed(0)}%. ` +
          `Losses this tick — Attacker: ${attackerLoss.toFixed(0)}, Defender: ${defenderLoss.toFixed(0)}.`
        : `WAR ENDED: ${resultMessage}`;

      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [battleReport, tick]
      );

      // Log event
      await client.query(
        `INSERT INTO events (tick_number, event_type, data) VALUES ($1, $2, $3)`,
        [tick, newStatus === "active" ? "battle_tick" : "war_ended", JSON.stringify({
          conflict_id: conflict.id,
          attacker_id: conflict.attacker_id,
          defender_id: conflict.defender_id,
          ticks_at_war: ticksAtWar,
          attacker_loss: attackerLoss,
          defender_loss: defenderLoss,
          attacker_morale: newAttackerMorale,
          defender_morale: newDefenderMorale,
          status: newStatus,
        })]
      );
    });
  }

  private async calcSupplyModifier(
    client: pg.PoolClient,
    attackerId: number,
    targetClaimId: number,
  ): Promise<number> {
    // Get attacker's core territory centroid
    const attackerTerritory = await client.query(
      "SELECT center_lat, center_lng FROM territory_claims WHERE nation_id = $1 ORDER BY claimed_tick ASC LIMIT 1",
      [attackerId]
    );
    const targetTerritory = await client.query(
      "SELECT center_lat, center_lng FROM territory_claims WHERE id = $1",
      [targetClaimId]
    );

    if (attackerTerritory.rows.length === 0 || targetTerritory.rows.length === 0) return 0.8;

    const dist = distanceKm(
      [attackerTerritory.rows[0].center_lng, attackerTerritory.rows[0].center_lat],
      [targetTerritory.rows[0].center_lng, targetTerritory.rows[0].center_lat],
    );

    // Penalty scales with distance: 1.0 at 0km, 0.5 at 5000km
    return Math.max(0.3, 1.0 - dist / 10000);
  }

  private async calcTerrainModifier(
    client: pg.PoolClient,
    claimId: number,
  ): Promise<number> {
    // Check for fortifications
    const claim = await client.query(
      "SELECT improvements FROM territory_claims WHERE id = $1",
      [claimId]
    );

    if (claim.rows.length === 0) return 1.0;

    const improvements = claim.rows[0].improvements || [];
    const forts = improvements.filter((i: { type: string }) => i.type === "fortification");
    const fortBonus = forts.length * 0.2; // Each fort gives 20% defender bonus

    // Base terrain bonus (defender always has slight advantage)
    return 1.15 + fortBonus;
  }
}

export const conflictEngine = new ConflictEngine();
