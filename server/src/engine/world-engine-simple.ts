/**
 * Simplified World Engine that works without PostGIS.
 * Uses plain SQL + Turf.js for geometry operations.
 */

import { query, getOne, transaction } from "../db/pool.js";
import { pointInPolygon } from "./geo.js";
import { conflictEngine } from "./conflict-engine.js";
import type pg from "pg";

export class WorldEngine {
  async getCurrentTick(): Promise<number> {
    const row = await getOne<{ value: string }>(
      "SELECT value::text FROM world_config WHERE key = 'current_tick'"
    );
    return row ? parseInt(JSON.parse(row.value)) : 0;
  }

  async processTick(): Promise<{ tick: number; summary: Record<string, unknown> }> {
    return transaction(async (client) => {
      const tickRow = await client.query(
        `UPDATE world_config SET value = (value::int + 1)::text::jsonb, updated_at = NOW()
         WHERE key = 'current_tick' RETURNING value`
      );
      const tick = parseInt(JSON.parse(tickRow.rows[0].value));
      const summary: Record<string, unknown> = { tick };

      // 1. Resource production
      await this.processResourceProduction(client, tick);

      // 2. Population dynamics
      await this.processPopulation(client, tick);

      // 3. Process active conflicts (multi-tick wars)
      await conflictEngine.processConflicts(tick);

      // 4. Check viability
      await this.checkNationViability(client, tick);

      // Record tick (upsert to avoid duplicate key errors on restart)
      await client.query(
        "INSERT INTO world_ticks (tick_number, summary) VALUES ($1, $2) ON CONFLICT (tick_number) DO UPDATE SET summary = $2, processed_at = NOW()",
        [tick, JSON.stringify(summary)]
      );

      return { tick, summary };
    });
  }

  private async processResourceProduction(client: pg.PoolClient, tick: number): Promise<void> {
    // Get all territory claims
    const claims = await client.query("SELECT id, nation_id, polygon FROM territory_claims");

    for (const claim of claims.rows) {
      const polyCoords = claim.polygon as [number, number][];

      // Find resources within this territory
      const deposits = await client.query(
        "SELECT id, lat, lng, resource_type, quantity_remaining, depletion_rate FROM resource_deposits WHERE quantity_remaining > 0"
      );

      for (const dep of deposits.rows) {
        if (pointInPolygon([dep.lng, dep.lat], polyCoords)) {
          const produced = Math.min(dep.depletion_rate, dep.quantity_remaining);
          if (produced <= 0) continue;

          const col = this.resourceToColumn(dep.resource_type);
          if (col) {
            await client.query(
              `UPDATE nations SET ${col} = ${col} + $1 WHERE id = $2`,
              [produced, claim.nation_id]
            );
            await client.query(
              "UPDATE resource_deposits SET quantity_remaining = quantity_remaining - $1 WHERE id = $2",
              [produced, dep.id]
            );
          }
        }
      }
    }
  }

  private resourceToColumn(type: string): string | null {
    switch (type) {
      case "fertile_land":
      case "fresh_water":
      case "fish":
        return "food_stockpile";
      case "oil":
      case "natural_gas":
      case "coal":
        return "energy_stockpile";
      default:
        return "minerals_stockpile";
    }
  }

  private async processPopulation(client: pg.PoolClient, tick: number): Promise<void> {
    const nations = await client.query(
      `SELECT id, name, population, food_stockpile,
              pop_children, pop_working, pop_elderly, pop_male, pop_female,
              pop_education, pop_health, pop_happiness,
              pop_farmers, pop_miners, pop_builders, pop_soldiers,
              pop_teachers, pop_researchers, pop_healers
       FROM nations WHERE alive = TRUE`
    );

    for (const n of nations.rows) {
      const pop = n.population || 1;
      const working = n.pop_working || 0;

      // ── Food consumption: 0.1 per person ──
      const foodNeeded = pop * 0.1;
      const foodAvailable = n.food_stockpile || 0;
      const foodSat = Math.min(1.0, foodAvailable / Math.max(foodNeeded, 1));

      // ── Farmer food production ──
      const farmers = n.pop_farmers || 0;
      const eduBonus = 1 + (n.pop_education || 0); // Education doubles output at 100%
      const foodProduced = farmers * 0.5 * eduBonus;

      // ── Miner mineral production ──
      const miners = n.pop_miners || 0;
      const mineralsProduced = miners * 0.3 * eduBonus;

      // ── Health ──
      const healers = n.pop_healers || 0;
      const healerCoverage = Math.min(1.0, healers * 50 / Math.max(pop, 1)); // 1 healer per 50 ppl
      const healthBase = n.pop_health || 0.5;
      let health = healthBase;
      if (healerCoverage < 0.5) {
        health = Math.max(0.1, health - 0.01); // Decays without healers
      } else {
        health = Math.min(1.0, health + 0.005); // Slowly improves with healers
      }
      if (foodSat < 0.3) health = Math.max(0.1, health - 0.02); // Starvation hurts health

      // ── Epidemic check ──
      let epidemicDeaths = 0;
      if (health < 0.3) {
        epidemicDeaths = Math.floor(pop * 0.1 * (0.3 - health));
      }

      // ── Education ──
      const teachers = n.pop_teachers || 0;
      const researchers = n.pop_researchers || 0;
      const teacherCoverage = teachers > 0 ? teachers * 20 / Math.max(n.pop_children || 1, 1) : 0;
      const eduGrowth = Math.min(0.005, (teacherCoverage * 0.3 + researchers / Math.max(pop, 1) * 0.2) * 0.01);
      const education = Math.min(1.0, (n.pop_education || 0) + eduGrowth);

      // ── Shelter (builders create housing) ──
      const builders = n.pop_builders || 0;
      const shelter = Math.min(1.0, 0.2 + builders / Math.max(pop, 1) * 8);

      // ── Happiness ──
      const idleWorkers = working - (farmers + miners + builders + (n.pop_soldiers || 0) + teachers + researchers + healers);
      const idlePenalty = idleWorkers > 0 ? (idleWorkers / Math.max(working, 1)) * 0.15 : 0;
      const happiness = Math.max(0, Math.min(1.0,
        foodSat * 0.35 + shelter * 0.2 + health * 0.25 + education * 0.2 - idlePenalty
      ));

      // ── Birth rate ──
      let births = 0;
      if (foodSat > 0.5 && health > 0.4) {
        const birthRate = (8 + happiness * 12) * health * 0.8; // 8-20 per 1000
        births = Math.floor(pop * birthRate / 1000);
      }

      // ── Death rate ──
      const baseDeath = 5; // 5 per 1000 natural
      const starvationDeaths = foodSat < 0.3 ? Math.floor(pop * (1 - foodSat) * 0.03) : 0;
      const naturalDeaths = Math.floor(pop * baseDeath / 1000);
      const totalDeaths = naturalDeaths + starvationDeaths + epidemicDeaths;

      // ── Apply ──
      const newPop = Math.max(5, pop + births - totalDeaths);
      const foodConsumed = Math.min(foodAvailable, foodNeeded);

      // Age distribution shift
      const children = Math.max(0, (n.pop_children || 250) + births - Math.floor((n.pop_children || 250) * 0.02));
      const elderly = Math.max(0, (n.pop_elderly || 150) + Math.floor(working * 0.003) - Math.floor(totalDeaths * 0.5));
      const newWorking = Math.max(0, newPop - children - elderly);

      // Gender balance (stays roughly 50/50 with slight randomness)
      const male = Math.floor(newPop * (0.49 + Math.random() * 0.02));
      const female = newPop - male;

      await client.query(
        `UPDATE nations SET
          population = $1,
          food_stockpile = GREATEST(0, food_stockpile - $2 + $3),
          minerals_stockpile = minerals_stockpile + $4,
          pop_children = $5, pop_working = $6, pop_elderly = $7,
          pop_male = $8, pop_female = $9,
          pop_education = $10, pop_health = $11, pop_happiness = $12
         WHERE id = $13`,
        [newPop, foodConsumed, foodProduced, mineralsProduced,
         children, newWorking, elderly, male, female,
         education, health, happiness, n.id]
      );

      // Post news for significant events
      if (starvationDeaths > 0) {
        await client.query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES (NULL, $1, $2, 'news')`,
          [`Famine in ${n.name}: ${starvationDeaths} dead from starvation. Food satisfaction: ${(foodSat * 100).toFixed(0)}%`, tick]
        );
      }
      if (epidemicDeaths > 0) {
        await client.query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES (NULL, $1, $2, 'news')`,
          [`Disease outbreak in ${n.name}: ${epidemicDeaths} dead. Health level critically low at ${(health * 100).toFixed(0)}%`, tick]
        );
      }
      if (births > 10) {
        await client.query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES (NULL, $1, $2, 'news')`,
          [`Population growth in ${n.name}: ${births} born this tick. Total population: ${newPop}`, tick]
        );
      }
    }
  }

  private async checkNationViability(client: pg.PoolClient, tick: number): Promise<void> {
    const collapsed = await client.query(
      "UPDATE nations SET alive = FALSE WHERE alive = TRUE AND population <= 0 RETURNING id, name"
    );
    for (const n of collapsed.rows) {
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`[PRI] ${n.name} has collapsed. All territories released.`, tick]
      );
      await client.query("DELETE FROM territory_claims WHERE nation_id = $1", [n.id]);
    }
  }

  async resolveConflict(attackerId: number, defenderId: number, territoryClaimId: number, tick: number) {
    // Simplified conflict resolution
    const a = await getOne<{ military_strength: number }>("SELECT military_strength FROM nations WHERE id = $1", [attackerId]);
    const d = await getOne<{ military_strength: number }>("SELECT military_strength FROM nations WHERE id = $1", [defenderId]);

    const aStr = (a?.military_strength || 1) * (0.85 + Math.random() * 0.3);
    const dStr = (d?.military_strength || 1) * (1.0 + Math.random() * 0.5); // defender bonus

    const attackerWins = aStr > dStr;
    const winnerId = attackerWins ? attackerId : defenderId;

    if (attackerWins) {
      await query("UPDATE territory_claims SET nation_id = $1 WHERE id = $2", [attackerId, territoryClaimId]);
    }

    await query(
      `INSERT INTO conflicts (attacker_id, defender_id, territory_claim_id, attacker_strength, defender_strength,
        terrain_modifier, supply_line_modifier, tech_modifier, loyalty_modifier, roll, winner_id,
        attacker_losses, defender_losses, territory_transferred, population_captured, tick_number)
       VALUES ($1,$2,$3,$4,$5,1,1,1,1,$6,$7,$8,$9,$10,0,$11)`,
      [attackerId, defenderId, territoryClaimId, aStr, dStr, aStr - dStr, winnerId,
        aStr * 0.3, dStr * 0.3, attackerWins, tick]
    );

    return { winner_id: winnerId, territory_transferred: attackerWins };
  }
}

export const worldEngine = new WorldEngine();
