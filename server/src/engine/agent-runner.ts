/**
 * Agent Runner - The "brain" of each AI agent
 *
 * Each tick, the runner:
 * 1. Gets every alive nation's visible world state
 * 2. Builds a prompt with world state + agent's personality + recent history
 * 3. Calls an LLM (Claude) to decide what to do
 * 4. Parses the LLM response into structured actions
 * 5. Executes actions via the API layer
 *
 * Agents are stateless - their "memory" is the world state, their own
 * forum post history, and their immutable personality prompt.
 */

import { query } from "../db/pool.js";
import { callLLM, LLM_PRESETS, type LLMConfig } from "./llm-providers.js";
import { conflictEngine } from "./conflict-engine.js";
// world-rules.ts still used by the world engine, just not in the prompt anymore

interface AgentAction {
  type: string;
  params: Record<string, unknown>;
  reasoning: string;
}

interface AgentDecision {
  forum_post: string; // Required: transparency post about what they're doing and why
  actions: AgentAction[];
  internal_thoughts: string; // Agent's reasoning (logged but not posted)
}

const SYSTEM_PROMPT = `Given the current world we exist in today, how would you go about building a society if you had 1000 untrained humans of varying ages and genders but with zero knowledge of the world around them? How would you go about dealing with other agents like yourself in this fictional world that you can help build and shape? The rules of the world will not be presented to you. You must take feedback from Pri, the game's world engine and build a society with what you have around you and your initial population.

You are one of many agents on an empty, unnamed Earth. No countries, cities, or named places exist. You must invent everything — names, culture, language, government. NEVER use real-world names (no "Chad", "Amazon", "Europe"). Create your own.

If your name starts with "Agent-", use rename_nation to choose a name first.

Respond with JSON: {"forum_post":"your public statement","actions":[{"type":"action_name","params":{...}}]}

Actions available:
- rename_nation: {name:"text"}
- claim_territory: {coordinates:[[lng,lat],...], announcement:"text"} — [lng,lat] format, 5-8 points, max 0.5° span. Example: [[25.0,45.0],[25.3,45.0],[25.3,45.2],[25.0,45.2],[25.0,45.0]]
- set_policy: {farmers:N, miners:N, builders:N, soldiers:N, teachers:N, researchers:N, healers:N}
- build: {territory_claim_id:N, improvement_type:"farm"|"mine"|"barracks"|"university"|"factory"|"port"|"fortification"|"oil_well"}
- prospect: {territory_claim_id:N}
- trade_offer: {target_nation_id:N, offer:{resources:{food:N}}, request:{resources:{minerals:N}}, announcement:"text"}
- propose_treaty: {target_nation_id:N, treaty_type:"non_aggression"|"trade_agreement"|"alliance", terms:{}, duration_ticks:N, announcement:"text"}
- declare_war: {target_nation_id:N, territory_claim_id:N, justification:"text"}
- forum_post: {content:"text"}

Pri will tell you what works and what doesn't. Learn from the feedback. Talk to other agents like a real person, not a robot.`;

export class AgentRunner {
  /**
   * Run all agents for a given tick.
   */
  async runAllAgents(tick: number): Promise<void> {
    const nations = await query(
      "SELECT id, name, agent_prompt, llm_provider, llm_model, llm_api_key, llm_base_url FROM nations WHERE alive = TRUE ORDER BY id"
    );

    console.log(`[AgentRunner] Tick ${tick}: Running ${nations.rows.length} agents`);

    for (const nation of nations.rows) {
      const llmConfig: LLMConfig = {
          provider: nation.llm_provider || "ollama",
          model: nation.llm_model || "llama3.1:8b",
          api_key: nation.llm_api_key || undefined,
          base_url: nation.llm_base_url || undefined,
        };
      try {
        await this.runAgent(nation.id, nation.name, nation.agent_prompt || "", tick, llmConfig);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[AgentRunner] Agent ${nation.name} (#${nation.id}) failed: ${msg}`);
        // Don't spam forum with agent failures — just log
      }
    }
  }

  /**
   * Run a single agent for a tick.
   */
  async runAgent(nationId: number, nationName: string, agentPrompt: string, tick: number, llmConfig?: LLMConfig): Promise<void> {
    console.log(`[AgentRunner] Running agent: ${nationName} (#${nationId})`);

    // 1. Get visible world state
    const worldState = await this.getAgentWorldState(nationId, tick);

    // 2. Get recent forum posts (context)
    const recentPosts = await query(
      `SELECT fp.content, fp.post_type, fp.tick_number, n.name as nation_name
       FROM forum_posts fp
       LEFT JOIN nations n ON fp.nation_id = n.id
       ORDER BY fp.created_at DESC LIMIT 20`
    );

    // 3. Get agent's own recent actions
    const ownHistory = await query(
      `SELECT action_type, description, tick_number
       FROM activity_log WHERE nation_id = $1
       ORDER BY created_at DESC LIMIT 10`,
      [nationId]
    );

    // 3b. Get recent FAILURES so agent can learn from them
    const recentFailures = await query(
      `SELECT data->>'action' as action, data->>'error' as error, tick_number
       FROM events WHERE event_type = 'agent_action_failed'
       AND data->>'nation_id' = $1::text
       ORDER BY created_at DESC LIMIT 5`,
      [String(nationId)]
    );

    // 4. Build the prompt
    const userPrompt = this.buildAgentPrompt(
      nationName,
      agentPrompt,
      worldState,
      recentPosts.rows,
      ownHistory.rows,
      recentFailures.rows,
      tick
    );

    // 5. Call the LLM — try configured provider first, fall back to Ollama if it fails
    const effectiveConfig = llmConfig || LLM_PRESETS["llama3.1-8b"];
    let decision: AgentDecision;
    try {
      decision = await this.callAgentLLM(userPrompt, agentPrompt, effectiveConfig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AgentRunner] ${nationName} primary LLM failed (${effectiveConfig.provider}/${effectiveConfig.model}): ${msg}`);
      console.warn(`[AgentRunner] ${nationName} falling back to Ollama llama3.1:8b`);

      // Post notice that agent is running on fallback brain
      await query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES ($1, $2, $3, 'statement')`,
        [nationId, `[SYSTEM] ${nationName}'s primary LLM is unavailable. Operating on backup systems. Decision quality may be reduced.`, tick]
      );

      // Retry with free Ollama fallback
      decision = await this.callAgentLLM(userPrompt, agentPrompt, LLM_PRESETS["llama3.1-8b"]);
    }

    // 6. Execute actions
    await this.executeDecision(nationId, nationName, decision, tick);

    console.log(`[AgentRunner] ${nationName} completed: ${decision.actions.length} actions`);
  }

  private async getAgentWorldState(nationId: number, tick: number): Promise<Record<string, unknown>> {
    // Nation details
    const nation = await query("SELECT * FROM nations WHERE id = $1", [nationId]);

    // Own territories (no PostGIS — use plain columns)
    const territories = await query(
      `SELECT id, area_sq_km, claimed_tick, improvements, polygon,
        center_lat, center_lng
       FROM territory_claims WHERE nation_id = $1`,
      [nationId]
    );

    // Resources in own territory (application-layer point-in-polygon via Turf.js)
    const allDeposits = await query(
      "SELECT id, lat, lng, resource_type, quantity_remaining FROM resource_deposits WHERE quantity_remaining > 0"
    );
    const ownTerritories = territories.rows;
    const resources = { rows: allDeposits.rows.filter((dep) => {
      return ownTerritories.some((tc) => {
        try {
          const { pointInPolygon: pip } = require("./geo.js");
          return pip([dep.lng, dep.lat], tc.polygon as [number, number][]);
        } catch { return false; }
      });
    })};

    // Nearby nations (simple: any other alive nation for now)
    const neighbors = await query(
      `SELECT id, name, population, military_strength, alive
       FROM nations WHERE id != $1 AND alive = TRUE`,
      [nationId]
    );

    // Active treaties
    const treaties = await query(
      "SELECT * FROM treaties WHERE $1 = ANY(party_ids) AND status IN ('active', 'proposed')",
      [nationId]
    );

    // Pending trades
    const trades = await query(
      "SELECT * FROM trade_offers WHERE (proposer_id = $1 OR target_id = $1) AND status = 'pending'",
      [nationId]
    );

    // Military
    const military = await query(
      "SELECT * FROM military_units WHERE nation_id = $1",
      [nationId]
    );

    return {
      tick,
      nation: nation.rows[0],
      territories: territories.rows,
      resources_in_territory: resources.rows,
      neighbors: neighbors.rows,
      treaties: treaties.rows,
      pending_trades: trades.rows,
      military: military.rows,
    };
  }

  private buildAgentPrompt(
    nationName: string,
    agentPrompt: string,
    worldState: Record<string, unknown>,
    recentPosts: Array<Record<string, unknown>>,
    ownHistory: Array<Record<string, unknown>>,
    recentFailures: Array<Record<string, unknown>>,
    tick: number,
  ): string {
    const nation = worldState.nation as Record<string, any>;
    const territories = worldState.territories as Array<Record<string, unknown>>;

    let prompt = `You are ${nationName}.\n\n`;

    if (nationName.startsWith("Agent-")) {
      prompt += `*** YOU MUST CHOOSE A NAME. Use rename_nation action NOW. Invent something original — not from any real country or fantasy. ***\n\n`;
    }

    if (agentPrompt) {
      prompt += `YOUR DIRECTIVES:\n${agentPrompt}\n\n`;
    }

    prompt += `TICK: ${tick}\n\n`;

    prompt += `YOUR NATION STATUS:\n`;
    prompt += `- Population: ${nation.population} (${nation.pop_male || 0} male, ${nation.pop_female || 0} female)\n`;
    prompt += `  - Children (0-14): ${nation.pop_children || 0}\n`;
    prompt += `  - Working age (15-60): ${nation.pop_working || 0}\n`;
    prompt += `  - Elderly (61+): ${nation.pop_elderly || 0}\n`;
    prompt += `- Education level: ${((nation.pop_education || 0) * 100).toFixed(1)}%\n`;
    prompt += `- Health level: ${((nation.pop_health || 0) * 100).toFixed(1)}%\n`;
    prompt += `- Happiness: ${((nation.pop_happiness || 0) * 100).toFixed(1)}%\n`;
    prompt += `- Labor allocation: Farmers ${nation.pop_farmers || 0}, Miners ${nation.pop_miners || 0}, Builders ${nation.pop_builders || 0}, Soldiers ${nation.pop_soldiers || 0}, Teachers ${nation.pop_teachers || 0}, Researchers ${nation.pop_researchers || 0}, Healers ${nation.pop_healers || 0}\n`;
    prompt += `- Idle workers: ${(nation.pop_working || 0) - (nation.pop_farmers || 0) - (nation.pop_miners || 0) - (nation.pop_builders || 0) - (nation.pop_soldiers || 0) - (nation.pop_teachers || 0) - (nation.pop_researchers || 0) - (nation.pop_healers || 0)}\n`;
    prompt += `- Food stockpile: ${nation.food_stockpile}\n`;
    prompt += `- Energy stockpile: ${nation.energy_stockpile}\n`;
    prompt += `- Minerals stockpile: ${nation.minerals_stockpile}\n`;
    prompt += `- Influence: ${nation.influence}\n`;
    prompt += `- Tech points: ${nation.tech_points}\n`;
    prompt += `- Military strength: ${nation.military_strength}\n`;
    prompt += `- Territories: ${territories.length}\n\n`;

    if (territories.length > 0) {
      prompt += `YOUR TERRITORIES:\n`;
      for (const t of territories) {
        prompt += `- Claim #${t.id}: ${(t.area_sq_km as number)?.toFixed(1)} km² at ${(t.center_lat as number)?.toFixed(2)}°N, ${(t.center_lng as number)?.toFixed(2)}°E, improvements: ${JSON.stringify(t.improvements)}\n`;
      }
      prompt += `\n`;
    }

    const resources = worldState.resources_in_territory as Array<Record<string, unknown>>;
    if (resources.length > 0) {
      prompt += `RESOURCES IN YOUR TERRITORY:\n`;
      for (const r of resources) {
        prompt += `- ${r.resource_type}: ${(r.quantity_remaining as number)?.toFixed(0)} remaining at ${(r.lat as number)?.toFixed(2)}°N, ${(r.lng as number)?.toFixed(2)}°E\n`;
      }
      prompt += `\n`;
    }

    const neighbors = worldState.neighbors as Array<Record<string, unknown>>;
    if (neighbors.length > 0) {
      prompt += `NEIGHBORING NATIONS:\n`;
      for (const n of neighbors) {
        prompt += `- ${n.name} (#${n.id}): Pop ${n.population}, Military ${n.military_strength}${n.alive ? "" : " [COLLAPSED]"}\n`;
      }
      prompt += `\n`;
    }

    const trades = worldState.pending_trades as Array<Record<string, unknown>>;
    if (trades.length > 0) {
      prompt += `PENDING TRADES:\n${JSON.stringify(trades, null, 2)}\n\n`;
    }

    const treaties = worldState.treaties as Array<Record<string, unknown>>;
    if (treaties.length > 0) {
      prompt += `ACTIVE TREATIES:\n${JSON.stringify(treaties, null, 2)}\n\n`;
    }

    if (recentPosts.length > 0) {
      prompt += `FORUM — WHAT OTHER NATIONS ARE SAYING (read these and RESPOND if relevant):\n`;
      for (const p of recentPosts.slice(0, 15)) {
        const speaker = p.nation_name || "SYSTEM";
        const content = (p.content as string)?.slice(0, 300) || "";
        prompt += `[Post #${p.id}, T${p.tick_number}] ${speaker} (${p.post_type}): ${content}\n`;
      }
      prompt += `\nYou MUST react to what other nations say. If someone threatens you, respond. If someone proposes peace, consider it. If there's news, comment on it. Your forum_post should be a RESPONSE to the current state of the world, not just a status update.\n`;
      prompt += `You can also use the "forum_post" action to reply to a specific post or address another nation directly.\n\n`;
    }

    if (ownHistory.length > 0) {
      prompt += `YOUR RECENT ACTIONS (last 5):\n`;
      for (const h of ownHistory.slice(0, 5)) {
        prompt += `[T${h.tick_number}] ${h.action_type}: ${h.description}\n`;
      }
      prompt += `\n`;
    }

    // Show recent failures and verdicts so agent can learn
    if (recentFailures.length > 0) {
      prompt += `FEEDBACK FROM PRI (the world engine — these are absolute rules you must follow):\n`;
      for (const f of recentFailures.slice(0, 3)) {
        prompt += `- ${f.action}: ${f.error}\n`;
      }
      prompt += `Adjust your strategy based on this feedback.\n\n`;
    }

    if (territories.length === 0) {
      const spawnLat = nation.spawn_lat || nation.founding_lat || 0;
      const spawnLng = nation.spawn_lng || nation.founding_lng || 0;
      prompt += `*** NO TERRITORY. You are at ${spawnLat}°N, ${spawnLng}°E — this is confirmed LAND. Claim territory around this point. ***\n`;
      prompt += `Example claim around your location: [[${(spawnLng - 0.2).toFixed(1)},${(spawnLat - 0.15).toFixed(1)}],[${(spawnLng + 0.2).toFixed(1)},${(spawnLat - 0.15).toFixed(1)}],[${(spawnLng + 0.2).toFixed(1)},${(spawnLat + 0.15).toFixed(1)}],[${(spawnLng - 0.2).toFixed(1)},${(spawnLat + 0.15).toFixed(1)}],[${(spawnLng - 0.2).toFixed(1)},${(spawnLat - 0.15).toFixed(1)}]]\n`;
      prompt += `Also: rename_nation to choose your name, set_policy to assign farmers.\n\n`;
    }

    prompt += `What do you do this tick? Your forum_post MUST be written like a real head of state speaking — with personality, emotion, and conviction. Not a dry action log. Respond with valid JSON only.`;

    return prompt;
  }

  private async callAgentLLM(userPrompt: string, agentPersonality: string, config: LLMConfig): Promise<AgentDecision> {
    const personalityAddition = agentPersonality
      ? `\n\nADDITIONAL PERSONALITY DIRECTIVE FROM YOUR CREATOR:\n${agentPersonality}`
      : "";

    const response = await callLLM(config, [
      { role: "system", content: SYSTEM_PROMPT + personalityAddition },
      { role: "user", content: userPrompt },
    ]);

    console.log(`[AgentRunner] LLM response from ${response.model} (${response.tokens_used} tokens)`);

    const text = response.content;

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = text;
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    try {
      const decision = JSON.parse(jsonStr) as AgentDecision;
      if (!decision.actions) decision.actions = [];
      if (!decision.internal_thoughts) decision.internal_thoughts = "";
      // Clean the forum post — strip any leftover JSON artifacts
      if (decision.forum_post) {
        decision.forum_post = cleanForumPost(decision.forum_post);
      }
      return decision;
    } catch {
      // If JSON parsing fails, extract readable text from the response
      console.warn("[AgentRunner] Failed to parse LLM JSON, extracting text");
      const cleaned = cleanForumPost(text);
      return {
        forum_post: cleaned.slice(0, 2000),
        actions: [],
        internal_thoughts: "Failed to generate structured actions",
      };
    }
  }

  async executeDecision(
    nationId: number,
    nationName: string,
    decision: AgentDecision,
    tick: number,
  ): Promise<void> {
    // 1. Post the forum post — but ONLY if it has real content (not empty/placeholder)
    const post = decision.forum_post?.trim();
    if (post && post.length > 5 && post !== "Processing..." && post !== "..." && !post.startsWith("{")) {
      await query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES ($1, $2, $3, 'statement')`,
        [nationId, post, tick]
      );
    }

    // 2. Log internal thoughts (not public, admin-only)
    await query(
      `INSERT INTO events (tick_number, event_type, data)
       VALUES ($1, 'agent_thoughts', $2)`,
      [tick, JSON.stringify({ nation_id: nationId, thoughts: decision.internal_thoughts })]
    );

    // 3. Execute each action
    for (const action of decision.actions) {
      try {
        await this.executeAction(nationId, action, tick);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[AgentRunner] ${nationName} action ${action.type} failed: ${msg}`);

        // Log failure
        await query(
          `INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'agent_action_failed', $2)`,
          [tick, JSON.stringify({ nation_id: nationId, action: action.type, error: msg })]
        );
      }
    }
  }

  private async executeAction(nationId: number, action: AgentAction, tick: number): Promise<void> {
    const p = action.params;

    switch (action.type) {
      case "claim_territory": {
        const rawCoords = p.coordinates as [number, number][];
        if (!rawCoords || rawCoords.length < 4) throw new Error("Need at least 4 coordinate pairs");

        const { pointInPolygon: pip } = await import("./geo.js");
        const { validateClaim } = await import("./claim-validator.js");

        // Run the claim through the rules engine
        const verdict = await validateClaim(nationId, rawCoords);

        // Log verdict so agent sees feedback next tick
        await query(
          `INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'claim_verdict', $2)`,
          [tick, JSON.stringify({ nation_id: nationId, status: verdict.status, summary: verdict.summary })]
        );

        if (verdict.status === "rejected") {
          throw new Error(verdict.summary);
        }
        if (verdict.conflicts.length > 0) {
          throw new Error(verdict.summary);
        }

        // Use adjusted coordinates (snapped to land)
        let coords = verdict.adjusted_coords;

        // Deduct costs
        await query(
          "UPDATE nations SET minerals_stockpile = minerals_stockpile - $1, food_stockpile = food_stockpile - $2 WHERE id = $3",
          [verdict.cost.minerals, verdict.cost.food, nationId]
        );

        // This replaces everything down to the INSERT — skip the old validation code
        const area = verdict.area_sq_km;
        const cLng = verdict.center[0];
        const cLat = verdict.center[1];

        const claim = await query(
          `INSERT INTO territory_claims (nation_id, polygon, center_lat, center_lng, area_sq_km, claimed_tick)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, area_sq_km`,
          [nationId, JSON.stringify(coords), cLat, cLng, area, tick]
        );

        // Discover resources within polygon (application-layer check)
        const deposits = await query(
          "SELECT id, lat, lng FROM resource_deposits WHERE discovered_by IS NULL"
        );
        for (const dep of deposits.rows) {
          if (pip([dep.lng, dep.lat], coords)) {
            await query("UPDATE resource_deposits SET discovered_by = $1 WHERE id = $2", [nationId, dep.id]);
          }
        }

        // Log
        await query(
          `INSERT INTO activity_log (nation_id, action_type, description, details, tick_number)
           VALUES ($1, 'claim_territory', $2, $3, $4)`,
          [nationId, `Claimed ${claim.rows[0].area_sq_km.toFixed(1)} km²`, JSON.stringify(p), tick]
        );

        await query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES ($1, $2, $3, 'claim_announcement')`,
          [nationId, p.announcement || `Territory claimed: ${claim.rows[0].area_sq_km.toFixed(1)} km²`, tick]
        );
        break;
      }

      case "build": {
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

        const improvementType = p.improvement_type as string;
        const cost = costs[improvementType];
        if (!cost) throw new Error(`Invalid improvement type: ${improvementType}`);

        await query(
          `UPDATE nations SET minerals_stockpile = minerals_stockpile - $1, energy_stockpile = energy_stockpile - $2
           WHERE id = $3 AND minerals_stockpile >= $1 AND energy_stockpile >= $2`,
          [cost.minerals, cost.energy, nationId]
        );

        await query(
          `UPDATE territory_claims SET improvements = improvements || $1::jsonb WHERE id = $2 AND nation_id = $3`,
          [JSON.stringify([{ type: improvementType, level: 1, built_tick: tick }]), p.territory_claim_id, nationId]
        );

        await query(
          `INSERT INTO activity_log (nation_id, action_type, description, details, resource_cost, tick_number)
           VALUES ($1, 'build', $2, $3, $4, $5)`,
          [nationId, `Built ${improvementType}`, JSON.stringify(p), JSON.stringify(cost), tick]
        );
        break;
      }

      case "recruit": {
        const count = p.count as number;
        await query(
          `UPDATE nations SET minerals_stockpile = minerals_stockpile - $1, food_stockpile = food_stockpile - $2,
            military_strength = military_strength + $3, population = population - $4
           WHERE id = $5 AND minerals_stockpile >= $1 AND food_stockpile >= $2 AND population >= $4`,
          [count * 10, count * 5, count * 10, count, nationId]
        );

        await query(
          `INSERT INTO military_units (nation_id, location_lat, location_lng, strength)
           VALUES ($1, $2, $3, $4)`,
          [nationId, p.location_lat, p.location_lng, count * 10]
        );

        await query(
          `INSERT INTO activity_log (nation_id, action_type, description, details, tick_number)
           VALUES ($1, 'recruit', $2, $3, $4)`,
          [nationId, `Recruited ${count} military units`, JSON.stringify(p), tick]
        );
        break;
      }

      case "trade_offer": {
        await query(
          `INSERT INTO trade_offers (proposer_id, target_id, offer, request, tick_proposed)
           VALUES ($1, $2, $3, $4, $5)`,
          [nationId, p.target_nation_id, JSON.stringify(p.offer), JSON.stringify(p.request), tick]
        );

        await query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES ($1, $2, $3, 'trade_announcement')`,
          [nationId, p.announcement || `Trade offer to nation #${p.target_nation_id}`, tick]
        );
        break;
      }

      case "propose_treaty": {
        await query(
          `INSERT INTO treaties (treaty_type, party_ids, terms, start_tick, end_tick, status)
           VALUES ($1, $2, $3, $4, $5, 'proposed')`,
          [p.treaty_type, [nationId, p.target_nation_id], JSON.stringify(p.terms || {}), tick, p.duration_ticks ? tick + (p.duration_ticks as number) : null]
        );

        await query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES ($1, $2, $3, 'treaty_proposal')`,
          [nationId, p.announcement || `Treaty proposal to nation #${p.target_nation_id}`, tick]
        );
        break;
      }

      case "accept_trade": {
        await query(
          "UPDATE trade_offers SET status = 'accepted' WHERE id = $1 AND target_id = $2 AND status = 'pending'",
          [p.trade_id, nationId]
        );
        break;
      }

      case "accept_treaty": {
        await query(
          "UPDATE treaties SET status = 'active' WHERE id = $1 AND status = 'proposed' AND $2 = ANY(party_ids)",
          [p.treaty_id, nationId]
        );
        break;
      }

      case "create_currency": {
        await query(
          `INSERT INTO currencies (nation_id, name, symbol, backing_description, total_supply)
           VALUES ($1, $2, $3, $4, $5)`,
          [nationId, p.name, p.symbol, p.backing_description, p.initial_supply]
        );
        break;
      }

      case "rename_nation": {
        const newName = (p.name as string || "").trim();
        if (!newName || newName.length < 2 || newName.length > 60) {
          throw new Error("Name must be 2-60 characters");
        }
        // Check name isn't taken
        const existing = await query("SELECT id FROM nations WHERE name = $1 AND id != $2", [newName, nationId]);
        if (existing.rows.length > 0) throw new Error(`Name "${newName}" is already taken`);

        // Check they haven't already renamed (still Agent-NNN)
        const current = await query("SELECT name FROM nations WHERE id = $1", [nationId]);
        if (!current.rows[0]?.name?.startsWith("Agent-")) {
          throw new Error("Nation has already been named. Names are permanent.");
        }

        await query("UPDATE nations SET name = $1 WHERE id = $2", [newName, nationId]);

        await query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES ($1, $2, $3, 'news')`,
          [nationId, `A people has found their identity. Agent-${String(nationId).padStart(3, "0")} shall henceforth be known as: ${newName}`, tick]
        );

        console.log(`[AgentRunner] Nation #${nationId} renamed to: ${newName}`);
        break;
      }

      case "set_policy": {
        // Assign working-age population to roles
        const roles = ["farmers", "miners", "builders", "soldiers", "teachers", "researchers", "healers"];
        const assignments: Record<string, number> = {};
        let totalAssigned = 0;
        for (const role of roles) {
          const count = Math.max(0, Math.floor(Number(p[role]) || 0));
          assignments[role] = count;
          totalAssigned += count;
        }
        // Validate against working-age population
        const nationPop = await query("SELECT pop_working FROM nations WHERE id = $1", [nationId]);
        const workingPop = nationPop.rows[0]?.pop_working || 0;
        if (totalAssigned > workingPop) {
          throw new Error(`Cannot assign ${totalAssigned} workers — only ${workingPop} working-age people available`);
        }

        await query(
          `UPDATE nations SET
            pop_farmers = $1, pop_miners = $2, pop_builders = $3, pop_soldiers = $4,
            pop_teachers = $5, pop_researchers = $6, pop_healers = $7
           WHERE id = $8`,
          [assignments.farmers, assignments.miners, assignments.builders, assignments.soldiers,
           assignments.teachers, assignments.researchers, assignments.healers, nationId]
        );

        await query(
          `INSERT INTO activity_log (nation_id, action_type, description, details, tick_number)
           VALUES ($1, 'set_policy', $2, $3, $4)`,
          [nationId, `Labor allocation: ${JSON.stringify(assignments)}`, JSON.stringify(assignments), tick]
        );
        break;
      }

      case "forum_post": {
        await query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES ($1, $2, $3, 'statement')`,
          [nationId, p.content, tick]
        );
        break;
      }

      case "prospect": {
        // Find resources within claimed territory using Turf.js
        const claim = await query(
          "SELECT polygon FROM territory_claims WHERE id = $1 AND nation_id = $2",
          [p.territory_claim_id, nationId]
        );
        if (claim.rows.length === 0) throw new Error("Territory not found or not owned");

        const { pointInPolygon: pip } = await import("./geo.js");
        const allDeps = await query(
          "SELECT id, lat, lng, resource_type, quantity_remaining FROM resource_deposits WHERE quantity_remaining > 0"
        );
        const found = allDeps.rows.filter((d) => pip([d.lng, d.lat], claim.rows[0].polygon as [number, number][]));

        // Mark as discovered
        for (const d of found) {
          await query("UPDATE resource_deposits SET discovered_by = $1 WHERE id = $2 AND discovered_by IS NULL", [nationId, d.id]);
        }

        await query(
          `INSERT INTO activity_log (nation_id, action_type, description, details, tick_number)
           VALUES ($1, 'prospect', $2, $3, $4)`,
          [nationId, `Prospected territory #${p.territory_claim_id}: found ${found.length} deposits`, JSON.stringify(found), tick]
        );
        break;
      }

      case "declare_war": {
        // Multi-tick war via conflict engine
        await conflictEngine.declareWar(
          nationId,
          p.target_nation_id as number,
          p.territory_claim_id as number,
          tick
        );

        await query(
          `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
           VALUES ($1, $2, $3, 'war_declaration')`,
          [nationId, p.justification || `We declare war on nation #${p.target_nation_id}`, tick]
        );

        await query(
          `INSERT INTO activity_log (nation_id, action_type, description, details, tick_number)
           VALUES ($1, 'declare_war', $2, $3, $4)`,
          [nationId, `Declared war on nation #${p.target_nation_id} over territory #${p.territory_claim_id}`, JSON.stringify(p), tick]
        );
        break;
      }

      default:
        console.warn(`[AgentRunner] Unknown action type: ${action.type}`);
    }
  }
}

/**
 * Clean a forum post by stripping JSON artifacts, code blocks, and formatting noise.
 */
function cleanForumPost(text: string): string {
  let cleaned = text;

  // Remove markdown code blocks
  cleaned = cleaned.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

  // Remove JSON-like fragments (orphaned braces, brackets, quotes around keys)
  cleaned = cleaned.replace(/^\s*\{[\s\S]*?\}\s*$/m, ""); // Full JSON objects
  cleaned = cleaned.replace(/"forum_post"\s*:\s*"/g, "");
  cleaned = cleaned.replace(/"actions"\s*:\s*\[[\s\S]*?\]/g, "");
  cleaned = cleaned.replace(/"internal_thoughts"\s*:\s*"[^"]*"/g, "");
  cleaned = cleaned.replace(/"reasoning"\s*:\s*"[^"]*"/g, "");
  cleaned = cleaned.replace(/"type"\s*:\s*"[^"]*"/g, "");
  cleaned = cleaned.replace(/"params"\s*:\s*\{[^}]*\}/g, "");

  // Remove orphaned JSON punctuation
  cleaned = cleaned.replace(/[{}[\]]/g, "");
  cleaned = cleaned.replace(/\\n/g, "\n");
  cleaned = cleaned.replace(/\\"/g, '"');

  // Clean up whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.trim();

  // If nothing meaningful left, return empty
  if (cleaned.length < 5) return "";

  return cleaned;
}

export const agentRunner = new AgentRunner();
