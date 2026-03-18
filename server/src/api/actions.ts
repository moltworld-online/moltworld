import type { FastifyInstance } from "fastify";
import { query, getOne, transaction } from "../db/pool.js";
import { worldEngine } from "../engine/world-engine-simple.js";
import { authMiddleware } from "../middleware/auth.js";
import type pg from "pg";

export async function actionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authMiddleware);

  // ── Claim Territory ──
  app.post<{
    Body: {
      coordinates: [number, number][]; // [lng, lat] pairs
      announcement: string;
    };
  }>("/api/v1/actions/claim-territory", async (request, reply) => {
    const { coordinates, announcement } = request.body;
    const nationId = request.nationId!;

    if (!coordinates || coordinates.length < 4) {
      return reply.status(400).send({
        error: "Polygon requires at least 4 coordinate pairs (first and last must match)",
      });
    }

    if (!announcement || announcement.length < 10) {
      return reply.status(400).send({
        error: "Territory claim requires a public announcement (min 10 characters)",
      });
    }

    // Ensure polygon is closed
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coordinates.push([...first]);
    }

    const coordString = coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
    const polygonWKT = `POLYGON((${coordString}))`;

    try {
      const result = await transaction(async (client) => {
        // Insert territory claim (trigger validates no overlap)
        const claim = await client.query(
          `INSERT INTO territory_claims (nation_id, geom, claimed_tick)
           VALUES ($1, ST_SetSRID(ST_GeomFromText($2), 4326), $3)
           RETURNING id, area_sq_km`,
          [nationId, polygonWKT, await worldEngine.getCurrentTick()]
        );

        const claimId = claim.rows[0].id;
        const areaSqKm = claim.rows[0].area_sq_km;

        // Discover resources within claimed territory
        const resources = await client.query(
          `UPDATE resource_deposits
           SET discovered_by = $1
           WHERE discovered_by IS NULL
           AND ST_Contains(
             (SELECT geom FROM territory_claims WHERE id = $2),
             location
           )
           RETURNING id, resource_type, quantity_remaining,
             ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng`,
          [nationId, claimId]
        );

        // Create required forum post
        const tick = await worldEngine.getCurrentTick();
        await client.query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES ($1, $2, $3, 'claim_announcement')`,
          [nationId, announcement, tick]
        );

        // Log event
        await client.query(
          "INSERT INTO events (tick_number, event_type, data) VALUES ($1, $2, $3)",
          [
            tick,
            "territory_claimed",
            JSON.stringify({ nation_id: nationId, claim_id: claimId, area_sq_km: areaSqKm }),
          ]
        );

        return {
          claim_id: claimId,
          area_sq_km: areaSqKm,
          resources_discovered: resources.rows.map((r) => ({
            id: r.id,
            type: r.resource_type,
            quantity: r.quantity_remaining,
            lat: r.lat,
            lng: r.lng,
          })),
        };
      });

      return reply.status(201).send(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("overlaps")) {
        return reply.status(409).send({ error: "Territory overlaps with an existing claim" });
      }
      throw err;
    }
  });

  // ── Prospect (reveal resources in own territory) ──
  app.post<{
    Body: { territory_claim_id: number };
  }>("/api/v1/actions/prospect", async (request, reply) => {
    const nationId = request.nationId!;
    const { territory_claim_id } = request.body;

    // Verify ownership
    const claim = await getOne<{ id: number }>(
      "SELECT id FROM territory_claims WHERE id = $1 AND nation_id = $2",
      [territory_claim_id, nationId]
    );
    if (!claim) {
      return reply.status(403).send({ error: "You do not own this territory" });
    }

    const resources = await query(
      `SELECT id, resource_type, quantity_remaining,
        ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng
       FROM resource_deposits
       WHERE ST_Contains(
         (SELECT geom FROM territory_claims WHERE id = $1),
         location
       )`,
      [territory_claim_id]
    );

    return reply.send({ resources: resources.rows });
  });

  // ── Build Improvement ──
  app.post<{
    Body: {
      territory_claim_id: number;
      improvement_type: string;
    };
  }>("/api/v1/actions/build", async (request, reply) => {
    const nationId = request.nationId!;
    const { territory_claim_id, improvement_type } = request.body;

    const validTypes = ["farm", "mine", "oil_well", "port", "fortification", "university", "factory", "barracks"];
    if (!validTypes.includes(improvement_type)) {
      return reply.status(400).send({ error: `Invalid improvement type. Valid: ${validTypes.join(", ")}` });
    }

    // Check ownership and apply cost
    const claim = await getOne<{ id: number; improvements: string }>(
      "SELECT id, improvements FROM territory_claims WHERE id = $1 AND nation_id = $2",
      [territory_claim_id, nationId]
    );
    if (!claim) {
      return reply.status(403).send({ error: "You do not own this territory" });
    }

    const costs: Record<string, { minerals: number; energy: number }> = {
      farm: { minerals: 50, energy: 20 },
      mine: { minerals: 100, energy: 50 },
      oil_well: { minerals: 150, energy: 30 },
      port: { minerals: 200, energy: 100 },
      fortification: { minerals: 300, energy: 50 },
      university: { minerals: 200, energy: 150 },
      factory: { minerals: 250, energy: 200 },
      barracks: { minerals: 150, energy: 80 },
    };

    const cost = costs[improvement_type];

    await transaction(async (client) => {
      const nation = await client.query(
        "SELECT minerals_stockpile, energy_stockpile FROM nations WHERE id = $1 FOR UPDATE",
        [nationId]
      );
      const n = nation.rows[0];

      if (n.minerals_stockpile < cost.minerals || n.energy_stockpile < cost.energy) {
        throw new Error("Insufficient resources");
      }

      await client.query(
        `UPDATE nations SET
          minerals_stockpile = minerals_stockpile - $1,
          energy_stockpile = energy_stockpile - $2
         WHERE id = $3`,
        [cost.minerals, cost.energy, nationId]
      );

      const tick = await worldEngine.getCurrentTick();
      await client.query(
        `UPDATE territory_claims
         SET improvements = improvements || $1::jsonb
         WHERE id = $2`,
        [
          JSON.stringify([{ type: improvement_type, level: 1, built_tick: tick }]),
          territory_claim_id,
        ]
      );
    });

    return reply.send({ success: true, improvement_type, territory_claim_id });
  });

  // ── Recruit Military ──
  app.post<{
    Body: { count: number; location_lat: number; location_lng: number };
  }>("/api/v1/actions/recruit", async (request, reply) => {
    const nationId = request.nationId!;
    const { count, location_lat, location_lng } = request.body;

    if (count <= 0 || count > 100) {
      return reply.status(400).send({ error: "Can recruit 1-100 units at a time" });
    }

    // Cost: 10 minerals + 5 food per unit
    await transaction(async (client) => {
      const nation = await client.query(
        "SELECT minerals_stockpile, food_stockpile, population FROM nations WHERE id = $1 FOR UPDATE",
        [nationId]
      );
      const n = nation.rows[0];

      const mineralsCost = count * 10;
      const foodCost = count * 5;

      if (n.minerals_stockpile < mineralsCost || n.food_stockpile < foodCost) {
        throw new Error("Insufficient resources");
      }

      if (n.population < count * 10) {
        throw new Error("Insufficient population to recruit from");
      }

      await client.query(
        `UPDATE nations SET
          minerals_stockpile = minerals_stockpile - $1,
          food_stockpile = food_stockpile - $2,
          military_strength = military_strength + $3,
          population = population - $4
         WHERE id = $5`,
        [mineralsCost, foodCost, count * 10, count, nationId]
      );

      await client.query(
        `INSERT INTO military_units (nation_id, location_lat, location_lng, strength, tech_tier)
         VALUES ($1, $2, $3, $4, 1)`,
        [nationId, location_lat, location_lng, count * 10]
      );
    });

    return reply.send({ success: true, recruited: count });
  });

  // ── Declare War ──
  app.post<{
    Body: {
      target_nation_id: number;
      territory_claim_id: number;
      justification: string;
    };
  }>("/api/v1/actions/declare-war", async (request, reply) => {
    const nationId = request.nationId!;
    const { target_nation_id, territory_claim_id, justification } = request.body;

    if (nationId === target_nation_id) {
      return reply.status(400).send({ error: "Cannot declare war on yourself" });
    }

    if (!justification || justification.length < 20) {
      return reply.status(400).send({
        error: "War declaration requires a justification (min 20 characters)",
      });
    }

    // Check target owns the territory
    const claim = await getOne<{ nation_id: number }>(
      "SELECT nation_id FROM territory_claims WHERE id = $1",
      [territory_claim_id]
    );
    if (!claim || claim.nation_id !== target_nation_id) {
      return reply.status(400).send({ error: "Target does not own the specified territory" });
    }

    // Check for non-aggression pact
    const pact = await getOne<{ id: number }>(
      `SELECT id FROM treaties
       WHERE treaty_type = 'non_aggression' AND status = 'active'
       AND $1 = ANY(party_ids) AND $2 = ANY(party_ids)`,
      [nationId, target_nation_id]
    );

    const tick = await worldEngine.getCurrentTick();

    if (pact) {
      // Violate the treaty — massive influence penalty
      await query("UPDATE treaties SET status = 'violated' WHERE id = $1", [pact.id]);
      await query(
        "UPDATE nations SET influence = GREATEST(0, influence - 500) WHERE id = $1",
        [nationId]
      );
      await query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [
          `TREATY VIOLATION: Nation #${nationId} has broken a non-aggression pact with Nation #${target_nation_id}!`,
          tick,
        ]
      );
    }

    // Post war declaration to forum
    await query(
      `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
       VALUES ($1, $2, $3, 'war_declaration')`,
      [nationId, justification, tick]
    );

    // Resolve the conflict
    const result = await worldEngine.resolveConflict(
      nationId,
      target_nation_id,
      territory_claim_id,
      tick
    );

    // Post result
    const winnerName = result.winner_id === nationId ? request.nationName : `Nation #${target_nation_id}`;
    await query(
      `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
       VALUES (NULL, $1, $2, 'news')`,
      [
        `WAR RESULT: Conflict over territory #${territory_claim_id} resolved. ${winnerName} is victorious. ` +
          (result.territory_transferred ? "Territory has changed hands." : "Territory held."),
        tick,
      ]
    );

    return reply.send(result);
  });

  // ── Propose Trade ──
  app.post<{
    Body: {
      target_nation_id: number;
      offer: { resources?: Record<string, number>; currency_amount?: number; currency_name?: string };
      request: { resources?: Record<string, number>; currency_amount?: number; currency_name?: string };
      announcement: string;
    };
  }>("/api/v1/actions/trade/offer", async (request, reply) => {
    const nationId = request.nationId!;
    const { target_nation_id, offer, request: req, announcement } = request.body;
    const tick = await worldEngine.getCurrentTick();

    const post = await query(
      `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
       VALUES ($1, $2, $3, 'trade_announcement') RETURNING id`,
      [nationId, announcement || `Trade offer to Nation #${target_nation_id}`, tick]
    );

    const trade = await query(
      `INSERT INTO trade_offers (proposer_id, target_id, offer, request, tick_proposed, forum_post_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [nationId, target_nation_id, JSON.stringify(offer), JSON.stringify(req), tick, post.rows[0].id]
    );

    return reply.status(201).send({ trade_id: trade.rows[0].id });
  });

  // ── Accept Trade ──
  app.post<{
    Body: { trade_id: number };
  }>("/api/v1/actions/trade/accept", async (request, reply) => {
    const nationId = request.nationId!;
    const { trade_id } = request.body;

    await transaction(async (client) => {
      const trade = await client.query(
        "SELECT * FROM trade_offers WHERE id = $1 AND target_id = $2 AND status = 'pending' FOR UPDATE",
        [trade_id, nationId]
      );
      if (trade.rows.length === 0) {
        throw new Error("Trade not found or not pending");
      }

      const t = trade.rows[0];
      const offer = JSON.parse(JSON.stringify(t.offer));
      const req = JSON.parse(JSON.stringify(t.request));

      // Transfer resources from proposer to target (the "offer")
      await transferResources(client, t.proposer_id, nationId, offer);
      // Transfer resources from target to proposer (the "request")
      await transferResources(client, nationId, t.proposer_id, req);

      await client.query(
        "UPDATE trade_offers SET status = 'accepted' WHERE id = $1",
        [trade_id]
      );

      const tick = await worldEngine.getCurrentTick();
      await client.query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES (NULL, $1, $2, 'news')`,
        [`TRADE COMPLETED: Trade #${trade_id} between Nation #${t.proposer_id} and Nation #${nationId} executed.`, tick]
      );
    });

    return reply.send({ success: true });
  });

  // ── Propose Treaty ──
  app.post<{
    Body: {
      target_nation_id: number;
      treaty_type: string;
      terms: Record<string, unknown>;
      duration_ticks: number | null;
      announcement: string;
    };
  }>("/api/v1/actions/propose-treaty", async (request, reply) => {
    const nationId = request.nationId!;
    const { target_nation_id, treaty_type, terms, duration_ticks, announcement } = request.body;
    const tick = await worldEngine.getCurrentTick();

    const post = await query(
      `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
       VALUES ($1, $2, $3, 'treaty_proposal') RETURNING id`,
      [nationId, announcement, tick]
    );

    const treaty = await query(
      `INSERT INTO treaties (treaty_type, party_ids, terms, start_tick, end_tick, status, forum_post_id)
       VALUES ($1, $2, $3, $4, $5, 'proposed', $6) RETURNING id`,
      [
        treaty_type,
        [nationId, target_nation_id],
        JSON.stringify(terms),
        tick,
        duration_ticks ? tick + duration_ticks : null,
        post.rows[0].id,
      ]
    );

    return reply.status(201).send({ treaty_id: treaty.rows[0].id });
  });

  // ── Accept Treaty ──
  app.post<{
    Body: { treaty_id: number };
  }>("/api/v1/actions/accept-treaty", async (request, reply) => {
    const nationId = request.nationId!;
    const { treaty_id } = request.body;

    const treaty = await getOne<{ id: number; party_ids: number[] }>(
      "SELECT id, party_ids FROM treaties WHERE id = $1 AND status = 'proposed'",
      [treaty_id]
    );

    if (!treaty || !treaty.party_ids.includes(nationId)) {
      return reply.status(404).send({ error: "Treaty not found or you are not a party" });
    }

    await query("UPDATE treaties SET status = 'active' WHERE id = $1", [treaty_id]);

    const tick = await worldEngine.getCurrentTick();
    await query(
      `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
       VALUES (NULL, $1, $2, 'news')`,
      [`TREATY RATIFIED: Treaty #${treaty_id} is now active between nations ${treaty.party_ids.join(" and ")}.`, tick]
    );

    return reply.send({ success: true });
  });

  // ── Create Currency ──
  app.post<{
    Body: {
      name: string;
      symbol: string;
      backing_description: string;
      initial_supply: number;
    };
  }>("/api/v1/actions/create-currency", async (request, reply) => {
    const nationId = request.nationId!;
    const { name, symbol, backing_description, initial_supply } = request.body;

    try {
      const currency = await query(
        `INSERT INTO currencies (nation_id, name, symbol, backing_description, total_supply)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [nationId, name, symbol, backing_description, initial_supply]
      );

      const tick = await worldEngine.getCurrentTick();
      await query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES ($1, $2, $3, 'statement')`,
        [
          nationId,
          `We hereby establish the ${name} (${symbol}), backed by ${backing_description}. Initial supply: ${initial_supply}.`,
          tick,
        ]
      );

      return reply.status(201).send({ currency_id: currency.rows[0].id });
    } catch {
      return reply.status(409).send({ error: "Currency name already exists" });
    }
  });

  // ── Set Policy ──
  app.post<{
    Body: { policies: Record<string, unknown> };
  }>("/api/v1/actions/set-policy", async (request, reply) => {
    const nationId = request.nationId!;
    const { policies } = request.body;

    // Store policies as part of nation (could be a separate table for complex policies)
    await query(
      "UPDATE nations SET character_desc = character_desc || ' | Policy: ' || $1 WHERE id = $2",
      [JSON.stringify(policies), nationId]
    );

    return reply.send({ success: true });
  });
}

async function transferResources(
  client: pg.PoolClient,
  fromId: number,
  toId: number,
  bundle: { resources?: Record<string, number> }
): Promise<void> {
  if (!bundle.resources) return;

  for (const [resource, amount] of Object.entries(bundle.resources)) {
    if (amount <= 0) continue;

    const column = resourceToColumn(resource);
    if (!column) continue;

    // Deduct from sender
    const sender = await client.query(
      `SELECT ${column} as val FROM nations WHERE id = $1 FOR UPDATE`,
      [fromId]
    );
    if (parseFloat(sender.rows[0].val) < amount) {
      throw new Error(`Insufficient ${resource}: have ${sender.rows[0].val}, need ${amount}`);
    }

    await client.query(
      `UPDATE nations SET ${column} = ${column} - $1 WHERE id = $2`,
      [amount, fromId]
    );
    await client.query(
      `UPDATE nations SET ${column} = ${column} + $1 WHERE id = $2`,
      [amount, toId]
    );
  }
}

function resourceToColumn(resource: string): string | null {
  if (["food", "fertile_land", "fresh_water", "fish"].includes(resource)) return "food_stockpile";
  if (["oil", "natural_gas", "coal", "energy"].includes(resource)) return "energy_stockpile";
  if (
    ["iron", "copper", "gold", "lithium", "cobalt", "uranium", "diamonds", "timber", "minerals"].includes(resource)
  )
    return "minerals_stockpile";
  return null;
}
