import { query, getOne, transaction } from "../db/pool.js";
import type { ConflictResult } from "../types/index.js";
import type pg from "pg";
import { pri } from "./pri.js";

export class WorldEngine {
  async getCurrentTick(): Promise<number> {
    const row = await getOne<{ value: string }>(
      "SELECT value::text FROM world_config WHERE key = 'current_tick'"
    );
    return row ? parseInt(JSON.parse(row.value)) : 0;
  }

  async processTick(): Promise<{ tick: number; summary: Record<string, unknown> }> {
    return transaction(async (client) => {
      // Advance tick
      const tickRow = await client.query(
        `UPDATE world_config SET value = (value::int + 1)::text::jsonb, updated_at = NOW()
         WHERE key = 'current_tick' RETURNING value`
      );
      const tick = parseInt(JSON.parse(tickRow.rows[0].value));

      const summary: Record<string, unknown> = { tick };

      // 1. Resource production
      const production = await this.processResourceProduction(client, tick);
      summary.production = production;

      // 2. Population dynamics
      const popChanges = await this.processPopulation(client, tick);
      summary.population = popChanges;

      // 3. Resource depletion
      await this.processDepletion(client);

      // 4. Treaty enforcement
      const treatyEvents = await this.enforceTreaties(client, tick);
      summary.treaties = treatyEvents;

      // 5. Check nation viability (starvation/collapse)
      const collapses = await this.checkNationViability(client, tick);
      summary.collapses = collapses;

      // 6. Pri - Earth Spirit cycle (weather, tectonics, ecosystems, resource unlocks)
      const priEvents = await pri.cycle(client, tick);
      summary.pri_events = priEvents;

      // 7. Random events (legacy, minor)
      const events = await this.generateRandomEvents(client, tick);
      summary.random_events = events;

      // Record tick
      await client.query(
        "INSERT INTO world_ticks (tick_number, summary) VALUES ($1, $2)",
        [tick, JSON.stringify(summary)]
      );

      return { tick, summary };
    });
  }

  private async processResourceProduction(
    client: pg.PoolClient,
    tick: number
  ): Promise<Record<string, number>> {
    const totals: Record<string, number> = {};

    // Find all resource deposits within claimed territories
    const results = await client.query(`
      SELECT
        tc.nation_id,
        rd.resource_type,
        SUM(
          CASE
            WHEN rd.quantity_remaining <= 0 THEN 0
            ELSE LEAST(rd.depletion_rate, rd.quantity_remaining)
          END
        ) AS produced
      FROM territory_claims tc
      JOIN resource_deposits rd ON ST_Contains(tc.geom, rd.location)
      WHERE rd.quantity_remaining > 0
      GROUP BY tc.nation_id, rd.resource_type
    `);

    for (const row of results.rows) {
      const { nation_id, resource_type, produced } = row;
      const amount = parseFloat(produced);

      // Map resource types to nation stockpiles
      const stockpileColumn = this.resourceToStockpile(resource_type);
      if (stockpileColumn) {
        await client.query(
          `UPDATE nations SET ${stockpileColumn} = ${stockpileColumn} + $1 WHERE id = $2`,
          [amount, nation_id]
        );
      }

      totals[`${nation_id}:${resource_type}`] = amount;
    }

    return totals;
  }

  private resourceToStockpile(resourceType: string): string | null {
    switch (resourceType) {
      case "fertile_land":
      case "fresh_water":
      case "fish":
        return "food_stockpile";
      case "oil":
      case "natural_gas":
      case "coal":
        return "energy_stockpile";
      case "iron":
      case "copper":
      case "gold":
      case "lithium":
      case "cobalt":
      case "uranium":
      case "diamonds":
      case "timber":
        return "minerals_stockpile";
      default:
        return null;
    }
  }

  private async processPopulation(
    client: pg.PoolClient,
    tick: number
  ): Promise<Record<string, unknown>> {
    const changes: Record<string, unknown> = {};

    // Get all alive nations
    const nations = await client.query(
      "SELECT id, population, food_stockpile FROM nations WHERE alive = TRUE"
    );

    for (const nation of nations.rows) {
      const { id, population, food_stockpile } = nation;

      // Food consumption: 1 unit per 10 population per tick
      const foodConsumed = population / 10;
      const newFood = Math.max(0, food_stockpile - foodConsumed);

      if (food_stockpile >= foodConsumed) {
        // Surplus: population grows 1-2%
        const growthRate = 1 + 0.01 + Math.random() * 0.01;
        const newPop = Math.floor(population * growthRate);
        await client.query(
          "UPDATE nations SET population = $1, food_stockpile = $2 WHERE id = $3",
          [newPop, newFood, id]
        );
        changes[id] = { grew: newPop - population, food_remaining: newFood };
      } else {
        // Famine: population declines 2-5%
        const declineRate = 1 - (0.02 + Math.random() * 0.03);
        const newPop = Math.max(1, Math.floor(population * declineRate));
        await client.query(
          "UPDATE nations SET population = $1, food_stockpile = 0 WHERE id = $2",
          [newPop, id]
        );

        // Generate famine event
        await client.query(
          "INSERT INTO events (tick_number, event_type, data) VALUES ($1, $2, $3)",
          [tick, "famine", JSON.stringify({ nation_id: id, population_lost: population - newPop })]
        );

        // Auto-post news
        await client.query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES (NULL, $1, $2, 'news')`,
          [`FAMINE ALERT: Nation #${id} is experiencing food shortages. Population declined by ${population - newPop}.`, tick]
        );

        changes[id] = { starved: population - newPop, food_remaining: 0 };
      }
    }

    return changes;
  }

  private async processDepletion(client: pg.PoolClient): Promise<void> {
    // Reduce remaining quantity of exploited resources
    await client.query(`
      UPDATE resource_deposits rd
      SET quantity_remaining = GREATEST(0, quantity_remaining - depletion_rate)
      WHERE quantity_remaining > 0
      AND EXISTS (
        SELECT 1 FROM territory_claims tc
        WHERE ST_Contains(tc.geom, rd.location)
      )
    `);
  }

  private async enforceTreaties(
    client: pg.PoolClient,
    tick: number
  ): Promise<string[]> {
    const events: string[] = [];

    // Expire treaties past their end_tick
    const expired = await client.query(
      `UPDATE treaties SET status = 'expired'
       WHERE status = 'active' AND end_tick IS NOT NULL AND end_tick <= $1
       RETURNING id, treaty_type, party_ids`,
      [tick]
    );

    for (const t of expired.rows) {
      events.push(`Treaty #${t.id} (${t.treaty_type}) expired`);
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`TREATY EXPIRED: ${t.treaty_type} between nations ${t.party_ids.join(", ")} has ended.`, tick]
      );
    }

    return events;
  }

  private async checkNationViability(
    client: pg.PoolClient,
    tick: number
  ): Promise<number[]> {
    // Nations with 0 population collapse
    const collapsed = await client.query(
      `UPDATE nations SET alive = FALSE
       WHERE alive = TRUE AND population <= 0
       RETURNING id, name`
    );

    const collapsedIds: number[] = [];
    for (const nation of collapsed.rows) {
      collapsedIds.push(nation.id);
      await client.query(
        `INSERT INTO events (tick_number, event_type, data) VALUES ($1, $2, $3)`,
        [tick, "nation_collapse", JSON.stringify({ nation_id: nation.id, name: nation.name })]
      );
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`NATION COLLAPSED: ${nation.name} has fallen. Its territories are now unclaimed.`, tick]
      );
      // Release territories
      await client.query(
        "DELETE FROM territory_claims WHERE nation_id = $1",
        [nation.id]
      );
    }

    return collapsedIds;
  }

  private async generateRandomEvents(
    client: pg.PoolClient,
    tick: number
  ): Promise<string[]> {
    const events: string[] = [];

    // 5% chance of a new resource discovery each tick
    if (Math.random() < 0.05) {
      // Random location on land (rough approximation)
      const lat = -60 + Math.random() * 130; // -60 to 70
      const lng = -170 + Math.random() * 340; // -170 to 170
      const types = ["oil", "gold", "copper", "iron", "lithium", "natural_gas"];
      const type = types[Math.floor(Math.random() * types.length)];
      const quantity = 2000 + Math.floor(Math.random() * 8000);

      await client.query(
        `INSERT INTO resource_deposits (location, resource_type, quantity_total, quantity_remaining, depletion_rate)
         VALUES (ST_SetSRID(ST_MakePoint($1, $2), 4326), $3, $4, $4, $5)`,
        [lng, lat, type, quantity, 1.0]
      );

      events.push(`New ${type} deposit discovered at approximately ${lat.toFixed(1)}°, ${lng.toFixed(1)}°`);

      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`GEOLOGICAL SURVEY: Seismic activity suggests new ${type} deposits may exist in the region near ${lat.toFixed(0)}°N ${lng.toFixed(0)}°E. Exact location unknown.`, tick]
      );

      await client.query(
        `INSERT INTO events (tick_number, event_type, data) VALUES ($1, $2, $3)`,
        [tick, "resource_discovery", JSON.stringify({ lat, lng, type, quantity })]
      );
    }

    // 2% chance of natural disaster in a claimed territory
    if (Math.random() < 0.02) {
      const claim = await client.query(
        `SELECT tc.id, tc.nation_id, n.name as nation_name
         FROM territory_claims tc
         JOIN nations n ON tc.nation_id = n.id
         ORDER BY RANDOM() LIMIT 1`
      );
      if (claim.rows.length > 0) {
        const { id, nation_id, nation_name } = claim.rows[0];
        const disasters = ["earthquake", "flood", "drought", "wildfire", "hurricane"];
        const disaster = disasters[Math.floor(Math.random() * disasters.length)];
        const popLoss = Math.floor(Math.random() * 20) + 5;

        await client.query(
          "UPDATE nations SET population = GREATEST(1, population - $1) WHERE id = $2",
          [popLoss, nation_id]
        );

        events.push(`${disaster} hit territory of ${nation_name}, ${popLoss} casualties`);

        await client.query(
          `INSERT INTO events (tick_number, event_type, data) VALUES ($1, $2, $3)`,
          [tick, "natural_disaster", JSON.stringify({ claim_id: id, nation_id, disaster, casualties: popLoss })]
        );

        await client.query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES (NULL, $1, $2, 'news')`,
          [`DISASTER: A ${disaster} has struck territory belonging to ${nation_name}. ${popLoss} casualties reported.`, tick]
        );
      }
    }

    return events;
  }

  // ── Conflict Resolution ──

  async resolveConflict(
    attackerId: number,
    defenderId: number,
    territoryClaimId: number,
    tick: number
  ): Promise<ConflictResult> {
    return transaction(async (client) => {
      // Get attacker and defender stats
      const attacker = await client.query(
        "SELECT military_strength, tech_points, population FROM nations WHERE id = $1",
        [attackerId]
      );
      const defender = await client.query(
        "SELECT military_strength, tech_points, population FROM nations WHERE id = $1",
        [defenderId]
      );

      const a = attacker.rows[0];
      const d = defender.rows[0];

      // Get military units committed to this region
      const claim = await client.query(
        "SELECT geom FROM territory_claims WHERE id = $1",
        [territoryClaimId]
      );

      const attackerUnits = await client.query(
        `SELECT COALESCE(SUM(strength), 0) as total FROM military_units
         WHERE nation_id = $1 AND status IN ('idle', 'moving')`,
        [attackerId]
      );

      const defenderUnits = await client.query(
        `SELECT COALESCE(SUM(strength), 0) as total FROM military_units
         WHERE nation_id = $1`,
        [defenderId]
      );

      const attackStrength = parseFloat(attackerUnits.rows[0].total) || 1;
      const defendStrength = parseFloat(defenderUnits.rows[0].total) || 1;

      // Terrain modifier: defender gets 1.0-1.5x bonus
      const terrainModifier = 1.0 + Math.random() * 0.5;

      // Supply line modifier: based on number of territories (more spread = weaker)
      const attackerTerritories = await client.query(
        "SELECT COUNT(*) as cnt FROM territory_claims WHERE nation_id = $1",
        [attackerId]
      );
      const supplyLineMod = Math.max(0.5, 1.0 - parseInt(attackerTerritories.rows[0].cnt) * 0.05);

      // Tech modifier
      const techDiff = (a.tech_points || 0) - (d.tech_points || 0);
      const techModifier = 1.0 + techDiff * 0.001;

      // Population loyalty in territory
      const loyalPop = await client.query(
        `SELECT COALESCE(AVG(loyalty), 1.0) as avg_loyalty FROM population_units
         WHERE nation_id = $1`,
        [defenderId]
      );
      const loyaltyModifier = parseFloat(loyalPop.rows[0].avg_loyalty) || 1.0;

      // Combat roll
      const attackRoll = attackStrength * supplyLineMod * techModifier * (0.85 + Math.random() * 0.3);
      const defendRoll = defendStrength * terrainModifier * loyaltyModifier * (0.85 + Math.random() * 0.3);

      const attackerWins = attackRoll > defendRoll;
      const winnerId = attackerWins ? attackerId : defenderId;

      // Calculate losses (proportional to strength differential)
      const ratio = Math.min(attackRoll, defendRoll) / Math.max(attackRoll, defendRoll);
      const attackerLosses = attackerWins
        ? attackStrength * ratio * 0.3
        : attackStrength * 0.5;
      const defenderLosses = attackerWins
        ? defendStrength * 0.5
        : defendStrength * ratio * 0.3;

      // Apply losses
      await client.query(
        "UPDATE nations SET military_strength = GREATEST(0, military_strength - $1) WHERE id = $2",
        [attackerLosses, attackerId]
      );
      await client.query(
        "UPDATE nations SET military_strength = GREATEST(0, military_strength - $1) WHERE id = $2",
        [defenderLosses, defenderId]
      );

      // Transfer territory if attacker wins
      let territoryTransferred = false;
      let populationCaptured = 0;

      if (attackerWins) {
        await client.query(
          "UPDATE territory_claims SET nation_id = $1 WHERE id = $2",
          [attackerId, territoryClaimId]
        );
        territoryTransferred = true;

        // Capture population in territory
        const captured = await client.query(
          `UPDATE population_units SET nation_id = $1, original_nation_id = nation_id, loyalty = 0.3
           WHERE nation_id = $2
           RETURNING count`,
          [attackerId, defenderId]
        );
        populationCaptured = captured.rows.reduce(
          (sum: number, r: { count: number }) => sum + r.count, 0
        );
      }

      const result: ConflictResult = {
        attacker_id: attackerId,
        defender_id: defenderId,
        territory_claim_id: territoryClaimId,
        attacker_strength: attackStrength,
        defender_strength: defendStrength,
        terrain_modifier: terrainModifier,
        supply_line_modifier: supplyLineMod,
        tech_modifier: techModifier,
        loyalty_modifier: loyaltyModifier,
        roll: attackRoll - defendRoll,
        winner_id: winnerId,
        attacker_losses: attackerLosses,
        defender_losses: defenderLosses,
        territory_transferred: territoryTransferred,
        population_captured: populationCaptured,
      };

      // Record conflict
      await client.query(
        `INSERT INTO conflicts (
          attacker_id, defender_id, territory_claim_id,
          attacker_strength, defender_strength,
          terrain_modifier, supply_line_modifier, tech_modifier, loyalty_modifier,
          roll, winner_id, attacker_losses, defender_losses,
          territory_transferred, population_captured, tick_number
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          attackerId, defenderId, territoryClaimId,
          attackStrength, defendStrength,
          terrainModifier, supplyLineMod, techModifier, loyaltyModifier,
          result.roll, winnerId, attackerLosses, defenderLosses,
          territoryTransferred, populationCaptured, tick,
        ]
      );

      // Event log
      await client.query(
        "INSERT INTO events (tick_number, event_type, data) VALUES ($1, $2, $3)",
        [tick, "conflict_resolved", JSON.stringify(result)]
      );

      return result;
    });
  }
}

export const worldEngine = new WorldEngine();
