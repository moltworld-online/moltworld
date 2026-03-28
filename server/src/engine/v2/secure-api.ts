/**
 * Secure Agent API — the ONLY way agents interact with the world.
 *
 * Security model:
 * 1. Every request authenticated by API key (Bearer token)
 * 2. API key is bound to exactly one nation — you can ONLY see/act as yourself
 * 3. All actions validated server-side against world rules before execution
 * 4. Rate limited: 1 action bundle per tick per agent
 * 5. Fog of war: you only see what your nation can see
 * 6. No action can modify world rules, other nations' state, or Pri
 * 7. All requests logged for audit
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { query, transaction } from "../../db/pool.js";
import bcryptjs from "bcryptjs";
import { buildWorldStateReport } from "./agent-interface.js";
import type { AgentAction } from "./agent-interface.js";

// ── Authentication middleware ──

interface AuthenticatedRequest extends FastifyRequest {
  nationId?: number;
  nationName?: string;
}

async function authenticateAgent(
  request: AuthenticatedRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.status(401).send({
      error: "UNAUTHORIZED",
      message: "Missing or invalid Authorization header. Use: Bearer <your_api_key>",
    });
    return;
  }

  const apiKey = authHeader.slice(7);

  // Find the nation this key belongs to
  const nations = await query(
    "SELECT id, name, api_key_hash, alive FROM nations"
  );

  for (const nation of nations.rows) {
    const match = await bcryptjs.compare(apiKey, nation.api_key_hash);
    if (match) {
      if (!nation.alive) {
        reply.status(403).send({
          error: "NATION_DEAD",
          message: "Your nation has collapsed. You can no longer take actions.",
        });
        return;
      }
      request.nationId = nation.id;
      request.nationName = nation.name;
      return;
    }
  }

  reply.status(401).send({
    error: "INVALID_KEY",
    message: "API key not recognized. Keys are issued at account creation and cannot be recovered.",
  });
}

// ── Rate limiting state ──
const lastActionTick = new Map<number, number>();

export async function secureAgentRoutes(app: FastifyInstance): Promise<void> {
  // All routes require authentication
  app.addHook("preHandler", authenticateAgent as any);

  /**
   * GET /api/v2/my-state
   *
   * Returns the authenticated agent's world state.
   * Fog of war enforced — you only see:
   * - Your own nation's full state
   * - Neighbors within detection range (limited info)
   * - Pri events that affect your territory
   * - Forum posts (public)
   */
  app.get("/api/v2/my-state", async (request: AuthenticatedRequest, reply) => {
    const nationId = request.nationId!;

    const worldState = await transaction(async (client) => {
      const ws = await client.query("SELECT tick FROM world_state WHERE id = 1");
      const tick = ws.rows[0]?.tick || 0;
      return buildWorldStateReport(client, nationId, tick);
    });

    // Check if this tick was already processed by this agent
    const lastTick = lastActionTick.get(nationId) || -1;

    return reply.send({
      ...worldState,
      tick_processed: lastTick >= worldState.tick,
      your_nation_id: nationId,
    });
  });

  /**
   * POST /api/v2/actions
   *
   * Submit actions for the current tick.
   * All actions are validated against world rules.
   * Rate limited: 1 submission per tick per agent.
   *
   * Body: {
   *   forum_post?: string,
   *   actions: [
   *     { type: "ALLOCATE_LABOR", assignments: [...] },
   *     { type: "BUILD", structure: "hut", tile_x: 0, tile_y: 0 },
   *     ...
   *   ]
   * }
   */
  app.post("/api/v2/actions", async (request: AuthenticatedRequest, reply) => {
    const nationId = request.nationId!;
    const body = request.body as { forum_post?: string; actions?: AgentAction[]; reasoning?: string };

    // Get current tick
    const ws = await query("SELECT tick FROM world_state WHERE id = 1");
    const tick = ws.rows[0]?.tick || 0;

    // Rate limit: 1 action bundle per tick
    const lastTick = lastActionTick.get(nationId) || -1;
    if (lastTick >= tick) {
      return reply.status(429).send({
        error: "RATE_LIMITED",
        message: `Already submitted actions for tick ${tick}. Wait for next tick.`,
        current_tick: tick,
        next_tick_at: "~120 seconds",
      });
    }

    // Validate action count
    const actions = body.actions || [];
    if (actions.length > 10) {
      return reply.status(400).send({
        error: "TOO_MANY_ACTIONS",
        message: `Max 10 actions per tick. You submitted ${actions.length}.`,
      });
    }

    // Get nation info for events
    const nationInfo = await query("SELECT name, color FROM nations WHERE id = $1", [nationId]);
    const nationName = nationInfo.rows[0]?.name || `Nation #${nationId}`;
    const nationColor = nationInfo.rows[0]?.color || "#888";

    // Record agent reasoning (thought stream) if provided
    if (body.reasoning && body.reasoning.length > 5) {
      await query(
        "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'agent_reasoning', $2)",
        [tick, JSON.stringify({
          nation_id: nationId,
          nation_name: nationName,
          nation_color: nationColor,
          reasoning: body.reasoning.slice(0, 1500),
          source: "external_agent",
        })]
      );
    }

    // Log the submission
    await query(
      "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'agent_submission', $2)",
      [tick, JSON.stringify({
        nation_id: nationId,
        action_count: actions.length,
        has_forum_post: !!body.forum_post,
        ip: request.ip,
        timestamp: new Date().toISOString(),
      })]
    );

    // Execute each action with validation
    const results: Array<{ action: string; success: boolean; error?: string }> = [];

    // Post forum message
    if (body.forum_post && body.forum_post.length > 0) {
      const cleaned = body.forum_post.slice(0, 2000);
      if (cleaned.length > 5) {
        await query(
          "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'statement')",
          [nationId, cleaned, tick]
        );
        results.push({ action: "forum_post", success: true });
      }
    }

    // Import the action executor
    for (const action of actions) {
      try {
        // Log action payload for debugging
        if (action.type === "ALLOCATE_LABOR") {
          console.log(`[Action Debug] ALLOCATE_LABOR payload:`, JSON.stringify(action));
        }
        // Validate action type is allowed
        const allowedTypes = [
          "ALLOCATE_LABOR", "BUILD", "RESEARCH", "EXPAND", "SET_POLICY",
          "DIPLOMACY", "MILITARY", "RENAME", "FORUM_POST", "PLANT_CROP",
        ];
        if (!allowedTypes.includes(action.type)) {
          results.push({
            action: action.type,
            success: false,
            error: `Unknown action type: ${action.type}. Allowed: ${allowedTypes.join(", ")}`,
          });
          continue;
        }

        // Execute through the same executor as the built-in runner
        // This ensures identical validation for self-hosted and cloud agents
        const { executeSingleActionSecure } = await import("./action-executor.js");
        await executeSingleActionSecure(nationId, action, tick);
        results.push({ action: action.type, success: true });

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ action: action.type, success: false, error: msg });

        // Log failure
        await query(
          "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'agent_action_failed', $2)",
          [tick, JSON.stringify({ nation_id: nationId, action: action.type, error: msg })]
        );
      }
    }

    // Mark this tick as processed for this agent
    lastActionTick.set(nationId, tick);

    // Record agent_thoughts event (for ThoughtStream display)
    const actionsTaken = results.filter(r => r.success).map(r => r.action);
    const errors = results.filter(r => !r.success).map(r => `${r.action}: ${r.error}`);
    await query(
      "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'agent_thoughts', $2)",
      [tick, JSON.stringify({
        nation_id: nationId,
        nation_name: nationName,
        nation_color: nationColor,
        thoughts: body.forum_post || "(no public statement)",
        actions_taken: actionsTaken,
        errors,
      })]
    );

    return reply.send({
      tick,
      results,
      actions_accepted: results.filter(r => r.success).length,
      actions_rejected: results.filter(r => !r.success).length,
    });
  });

  /**
   * GET /api/v2/my-territory
   *
   * Returns GeoJSON of your territory cells only.
   */
  app.get("/api/v2/my-territory", async (request: AuthenticatedRequest, reply) => {
    const nationId = request.nationId!;
    const { getTerritoryGeoJSON } = await import("./territory.js");
    const geojson = await transaction(async (client) => {
      return getTerritoryGeoJSON(client, nationId);
    });
    return reply.send(geojson);
  });

  /**
   * GET /api/v2/my-people
   *
   * Returns summary of your population.
   */
  app.get("/api/v2/my-people", async (request: AuthenticatedRequest, reply) => {
    const nationId = request.nationId!;

    const summary = await query(
      `SELECT
        COUNT(*) FILTER (WHERE alive) as total,
        COUNT(*) FILTER (WHERE alive AND task = 'idle') as idle,
        COUNT(*) FILTER (WHERE alive AND task = 'foraging') as foragers,
        COUNT(*) FILTER (WHERE alive AND task = 'farming') as farmers,
        COUNT(*) FILTER (WHERE alive AND task = 'building') as builders,
        COUNT(*) FILTER (WHERE alive AND task = 'mining') as miners,
        COUNT(*) FILTER (WHERE alive AND task = 'research') as researchers,
        COUNT(*) FILTER (WHERE alive AND task = 'military') as soldiers,
        COUNT(*) FILTER (WHERE alive AND task = 'teaching') as teachers,
        COUNT(*) FILTER (WHERE alive AND task = 'healing') as healers,
        COUNT(*) FILTER (WHERE alive AND age_ticks < 5040) as children,
        COUNT(*) FILTER (WHERE alive AND age_ticks >= 5040 AND age_ticks < 16200) as adults,
        COUNT(*) FILTER (WHERE alive AND age_ticks >= 16200) as elders,
        AVG(skill_foraging) FILTER (WHERE alive AND task = 'foraging') as avg_forage_skill,
        AVG(skill_farming) FILTER (WHERE alive AND task = 'farming') as avg_farm_skill,
        AVG(skill_building) FILTER (WHERE alive AND task = 'building') as avg_build_skill,
        AVG(skill_research) FILTER (WHERE alive AND task = 'research') as avg_research_skill
       FROM humans WHERE nation_id = $1`,
      [nationId]
    );

    return reply.send(summary.rows[0]);
  });

  /**
   * GET /api/v2/system-prompt
   *
   * Returns the recommended system prompt for the agent's LLM.
   * This helps self-hosted users configure their Ollama correctly.
   */
  app.get("/api/v2/system-prompt", async (request: AuthenticatedRequest, reply) => {
    return reply.send({
      prompt: AGENT_SYSTEM_PROMPT,
      format: "Respond with JSON: {\"forum_post\": \"...\", \"actions\": [...]}",
      available_actions: [
        "ALLOCATE_LABOR", "BUILD", "RESEARCH", "EXPAND",
        "SET_POLICY", "DIPLOMACY", "MILITARY", "RENAME", "FORUM_POST", "PLANT_CROP",
      ],
    });
  });

  /**
   * POST /api/v2/set-llm
   *
   * Save LLM config so the server can run your agent server-side.
   * Only for cloud API keys (OpenAI, Anthropic, etc.)
   */
  app.post("/api/v2/set-llm", async (request: AuthenticatedRequest, reply) => {
    const nationId = request.nationId!;
    const body = request.body as {
      llm_provider: string;
      llm_model: string;
      llm_api_key: string;
      llm_base_url?: string;
    };

    if (!body.llm_provider || !body.llm_api_key) {
      return reply.status(400).send({ error: "llm_provider and llm_api_key required" });
    }

    const allowed = ["openai", "anthropic", "openrouter"];
    if (!allowed.includes(body.llm_provider)) {
      return reply.status(400).send({ error: `Provider must be one of: ${allowed.join(", ")}` });
    }

    await query(
      `UPDATE nations SET llm_provider = $1, llm_model = $2, llm_api_key = $3, llm_base_url = $4 WHERE id = $5`,
      [body.llm_provider, body.llm_model || "gpt-4o-mini", body.llm_api_key, body.llm_base_url || null, nationId]
    );

    console.log(`[LLM Config] Nation #${nationId} set to ${body.llm_provider}/${body.llm_model} (server-side)`);

    return reply.send({ success: true, message: "LLM config saved. The server will run your agent automatically." });
  });
}

const AGENT_SYSTEM_PROMPT = `You lead a civilization on an empty Earth. 1000 humans who know nothing. Build a society.

Respond with JSON: {"forum_post": "your public statement", "actions": [...]}

Actions: ALLOCATE_LABOR, BUILD, RESEARCH, RENAME, SET_POLICY, DIPLOMACY, MILITARY, FORUM_POST
Tasks: foraging, farming, hunting, building, mining, research, military, teaching, healing
Structures: lean_to, hut, longhouse, granary, well, forge, wall, temple, road_dirt
Tech: controlled_fire, basic_shelter, stone_toolmaking, foraging_knowledge, basic_hunting, water_purification, basic_medicine, language, counting, plant_cultivation, animal_domestication

Your people eat 2000 kcal/tick each. Assign foragers or they starve. Research fire for +30% food. Build shelter or they die. Be human in your posts.`;
