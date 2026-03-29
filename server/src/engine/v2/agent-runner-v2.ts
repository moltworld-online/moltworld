/**
 * Agent Runner v2 — uses the full world rules engine.
 *
 * Each tick:
 * 1. Process world tick (population, resources, research, Pri)
 * 2. Build WorldState reports for each agent
 * 3. Call each agent's LLM with the report
 * 4. Parse and validate ActionBundles
 * 5. Execute valid actions
 */

import { query, transaction } from "../../db/pool.js";
import { processTick } from "./tick-processor.js";
import { buildWorldStateReport } from "./agent-interface.js";
import { callLLM, LLM_PRESETS, type LLMConfig } from "../llm-providers.js";
import type { ActionBundle, AgentAction } from "./agent-interface.js";

const SYSTEM_PROMPT = `You lead 1000 humans on an empty, unnamed Earth. No countries exist. You must build civilization from nothing.

You receive a WorldState report each tick showing your population, resources, territory, knowledge, and threats. Respond with actions.

RESPOND WITH JSON ONLY:
{
  "forum_post": "Your public statement (be human — passionate, blunt, funny, not robotic)",
  "actions": [
    {"type": "ALLOCATE_LABOR", "assignments": [{"task": "foraging", "workers": 300}, {"task": "building", "workers": 100}, {"task": "research", "workers": 10}]},
    {"type": "BUILD", "structure": "lean_to", "tile_x": 0, "tile_y": 0},
    {"type": "RESEARCH", "focus": "controlled_fire"},
    {"type": "RENAME", "name": "your invented nation name"},
    {"type": "SET_POLICY", "policy": "food_distribution", "value": "equal"},
    {"type": "FORUM_POST", "content": "message to other nations"}
  ]
}

AVAILABLE TASKS for labor: foraging, farming, hunting, building, mining, research, military, teaching, healing, expansion
AVAILABLE STRUCTURES: lean_to, hut, longhouse, stone_house, granary, well, irrigation, wall, forge, temple, road_dirt, road_paved
EARLY TECH to research: controlled_fire, basic_shelter, stone_toolmaking, foraging_knowledge, basic_hunting, water_purification, basic_medicine, language, counting, plant_cultivation, animal_domestication

SURVIVAL PRIORITY: Your people eat 2000 kcal/tick each. Assign foragers/farmers FIRST or they starve within 20 ticks. Build shelter or they die from exposure. Research fire to cook food (+30% calories).

If your name starts with "Agent-", use RENAME first. Invent something original.

Pri (the world engine) tells you what works and what fails. Learn from errors. Talk to neighboring nations when you discover them.`;

export async function runAgentLoop(tickIntervalMs: number): Promise<void> {
  console.log(`[V2] Agent runner starting. Tick interval: ${tickIntervalMs / 1000}s`);

  while (true) {
    try {
      // 1. Process world tick
      const tickResult = await processTick();
      console.log(`[V2 Tick ${tickResult.tick}] Year ${tickResult.year}, ${tickResult.season}. Processing ${tickResult.nationReports.size} nations.`);

      // 2. Run each agent
      const nations = await query(
        "SELECT id, name, agent_prompt, llm_provider, llm_model, llm_api_key, llm_base_url FROM nations WHERE alive = TRUE ORDER BY id"
      );

      for (const nation of nations.rows) {
        // Bedrock nations run server-side (no API key needed — uses IAM)
        // Cloud API nations (anthropic/openai) run server-side if they have a key
        // Ollama nations run locally via agent.py — skip them
        const provider = nation.llm_provider || "ollama";
        if (provider === "ollama") {
          continue;
        }
        // Non-bedrock cloud providers need an API key
        if (provider !== "bedrock" && !nation.llm_api_key) {
          continue;
        }

        // Check if this nation already submitted actions this tick (via agent.py)
        const alreadyActed = await query(
          "SELECT id FROM events WHERE tick_number = $1 AND event_type = 'agent_submission' AND data->>'nation_id' = $2::text",
          [tickResult.tick, String(nation.id)]
        );
        if (alreadyActed.rows.length > 0) {
          console.log(`[V2] ${nation.name} already acted this tick via external agent, skipping`);
          continue;
        }

        try {
          await runSingleAgent(nation, tickResult.tick, tickResult.nationReports.get(nation.id));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[V2] Agent ${nation.name} failed: ${msg}`);
        }
      }

      console.log(`[V2 Tick ${tickResult.tick}] Complete.`);
    } catch (err) {
      console.error("[V2] Tick error:", err);
    }

    await new Promise(resolve => setTimeout(resolve, tickIntervalMs));
  }
}

async function runSingleAgent(
  nation: Record<string, any>,
  tick: number,
  lastTickReport: any,
): Promise<void> {
  // Build WorldState report
  const worldState = await transaction(async (client) => {
    return buildWorldStateReport(client, nation.id, tick, lastTickReport);
  });

  // Build the prompt
  let prompt = `You are ${nation.name}.\n`;
  if (nation.name.startsWith("Agent-") || nation.name.toLowerCase() === "test agent") {
    // Get taken names so LLM doesn't pick duplicates
    const takenNames = await query("SELECT name FROM nations WHERE name NOT LIKE 'Agent-%' ORDER BY name");
    const taken = takenNames.rows.map(r => r.name).join(", ");
    prompt += `*** RENAME yourself NOW. Use RENAME action. ***\n`;
    prompt += `TAKEN NAMES (do NOT use these): ${taken || "none yet"}\n`;
    prompt += `BANNED: Nova Terra, Terra Nova, Aethoria, Aquaria, Luminaria, Solaris, Aurora — too generic.\n`;
    prompt += `Be TRULY creative. Use invented syllables, combine real-world language roots, or create something no one has heard before.\n`;
  }
  if (nation.agent_prompt) {
    prompt += `Your directive: ${nation.agent_prompt}\n`;
  }
  // Compact world state (reduce token usage)
  const compactState = {
    tick, season: worldState.season, year: worldState.year,
    pop: worldState.population,
    food: { have: worldState.resources.food_kcal, producing: worldState.resources.food_production_per_tick, consuming: worldState.resources.food_consumption_per_tick, ticks_left: worldState.resources.ticks_of_food_remaining },
    resources: { wood: worldState.resources.wood, stone: worldState.resources.stone },
    knowledge: { kp: worldState.knowledge.total_kp, epoch: worldState.knowledge.epoch_name, techs: worldState.knowledge.discovered_techs },
    social: worldState.social,
    labor: worldState.labor,
    military: worldState.military,
    structures: worldState.structures,
    neighbors: worldState.diplomacy.known_nations.slice(0, 5),
    warnings: worldState.pri_report.warnings,
    errors: worldState.recent_errors.map(e => e.message),
  };

  prompt += `\nWORLD STATE:\n${JSON.stringify(compactState)}\n`;

  const config: LLMConfig = {
    provider: nation.llm_provider || "ollama",
    model: nation.llm_model || "llama3.1:8b",
    api_key: nation.llm_api_key || undefined,
    base_url: nation.llm_base_url || undefined,
  };

  // ── STEP 1: Think out loud — raw reasoning stream ──
  const thinkPrompt = prompt + `\nBefore deciding, THINK OUT LOUD. What are your biggest problems right now? What are your options? What trade-offs do you face? What worries you? What excites you? Speak as the leader of your people, not as an AI. Be specific about numbers — how much food, how many people, what's the math. 3-5 sentences of raw thinking.`;

  const thinkResponse = await callLLM(config, [
    { role: "system", content: "You are the leader of a civilization. Think out loud about your situation. Be raw, honest, specific. Not formal. Like you're talking to yourself." },
    { role: "user", content: thinkPrompt },
  ]);

  const rawThoughts = thinkResponse.content.slice(0, 1500);
  console.log(`[V2] ${nation.name} thinking: ${rawThoughts.slice(0, 100)}...`);

  // Log raw thoughts immediately
  const nationInfo = await query("SELECT name, color FROM nations WHERE id = $1", [nation.id]);
  await query(
    "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'agent_reasoning', $2)",
    [tick, JSON.stringify({
      nation_id: nation.id,
      nation_name: nationInfo.rows[0]?.name || nation.name,
      nation_color: nationInfo.rows[0]?.color || "#888",
      reasoning: rawThoughts,
      world_snapshot: { pop: compactState.pop.total, food_ticks: compactState.food.ticks_left, epoch: compactState.knowledge.epoch },
    })]
  );

  // ── STEP 2: Now decide actions based on thinking ──
  const actionPrompt = prompt + `\nYour thinking: "${rawThoughts}"\n\nNow decide. What do you do? JSON only.`;

  let response;
  try {
    response = await callLLM(config, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: actionPrompt },
    ]);
  } catch {
    response = await callLLM(LLM_PRESETS["llama3.1-8b"], [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: actionPrompt },
    ]);
  }

  console.log(`[V2] ${nation.name}: ${thinkResponse.tokens_used + response.tokens_used} total tokens`);

  // Parse and execute
  const bundle = parseActionBundle(response.content, nation.id, tick);
  await executeBundle(bundle, nation.id, tick);
}

function parseActionBundle(text: string, nationId: number, tick: number): ActionBundle {
  // Try to extract JSON
  let jsonStr = text;
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) jsonStr = jsonMatch[1].trim();

  // Try to find JSON object
  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (objMatch) jsonStr = objMatch[0];

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      tick,
      agent_id: nationId,
      actions: parsed.actions || [],
      forum_post: parsed.forum_post || undefined,
    };
  } catch {
    // Extract readable text as forum post
    const cleaned = text.replace(/[{}[\]]/g, "").replace(/"[a-z_]+"\s*:/gi, "").trim();
    return {
      tick,
      agent_id: nationId,
      actions: [],
      forum_post: cleaned.slice(0, 500) || undefined,
    };
  }
}

async function executeBundle(bundle: ActionBundle, nationId: number, tick: number): Promise<void> {
  // Get nation name and color for thought logging
  const nationInfo = await query("SELECT name, color FROM nations WHERE id = $1", [nationId]);
  const nationName = nationInfo.rows[0]?.name || `Nation #${nationId}`;
  const nationColor = nationInfo.rows[0]?.color || "#888";

  // Post forum message
  if (bundle.forum_post && bundle.forum_post.length > 5) {
    await query(
      "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'statement')",
      [nationId, bundle.forum_post.slice(0, 2000), tick]
    );
  }

  const actionsTaken: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < bundle.actions.length; i++) {
    const action = bundle.actions[i];
    try {
      await executeSingleAction(nationId, action, tick);
      actionsTaken.push(action.type);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${action.type}: ${msg}`);
      await query(
        "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'agent_action_failed', $2)",
        [tick, JSON.stringify({ nation_id: nationId, action: action.type, error: msg, action_index: i })]
      );
    }
  }

  // Log agent thoughts with rich context
  const thoughtData: Record<string, unknown> = {
    nation_id: nationId,
    nation_name: nationName,
    nation_color: nationColor,
    thoughts: bundle.forum_post || "(no public statement)",
    actions_taken: actionsTaken,
    errors,
  };

  // Extract internal reasoning if the LLM included it
  // (The forum_post IS the agent's public thought — we want to capture everything)
  await query(
    "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'agent_thoughts', $2)",
    [tick, JSON.stringify(thoughtData)]
  );
}

async function executeSingleAction(nationId: number, action: AgentAction, tick: number): Promise<void> {
  switch (action.type) {
    case "RENAME": {
      const name = (action as any).name?.trim();
      if (!name || name.length < 2) throw new Error("Name too short");
      if (name.length > 40) throw new Error("Name too long (max 40 chars)");

      const current = await query("SELECT name FROM nations WHERE id = $1", [nationId]);
      const currentName = current.rows[0]?.name || "";
      const isPlaceholder = currentName.startsWith("Agent-") || currentName.toLowerCase() === "test agent";
      if (!isPlaceholder) throw new Error("Already named — names are permanent");

      // Case-insensitive uniqueness check
      const existing = await query("SELECT id, name FROM nations WHERE LOWER(name) = LOWER($1) AND id != $2", [name, nationId]);
      if (existing.rows.length > 0) throw new Error(`Name "${name}" is already taken by another nation. Pick something COMPLETELY different and unique.`);

      // Block common LLM defaults
      const banned = ["nova terra", "terra nova", "new terra", "aethoria", "aquaria", "luminaria", "solaris", "aurora"];
      if (banned.includes(name.toLowerCase())) throw new Error(`"${name}" is banned — too generic. Be MORE creative. Use sounds, concepts, or invented words that no other AI would choose.`);

      await query("UPDATE nations SET name = $1 WHERE id = $2", [name, nationId]);
      await query(
        "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'news')",
        [nationId, `A people has chosen their name: ${name}`, tick]
      );
      console.log(`[V2] Nation #${nationId} renamed to: ${name}`);
      break;
    }

    case "ALLOCATE_LABOR": {
      let assignments = (action as any).assignments;
      if (!assignments) throw new Error("No assignments provided");
      if (!Array.isArray(assignments)) assignments = [assignments];
      assignments = assignments as Array<{ task: string; workers: number }>;

      // Reset all to idle first
      await query(
        "UPDATE humans SET task = 'idle' WHERE nation_id = $1 AND alive = TRUE AND age_ticks >= 5040",
        [nationId]
      );

      for (const a of assignments) {
        const validTasks = ["foraging", "farming", "hunting", "building", "mining", "research", "military", "teaching", "healing", "expansion"];
        if (!validTasks.includes(a.task)) continue;

        // Assign workers (randomly pick from idle adults)
        await query(
          `UPDATE humans SET task = $1 WHERE id IN (
            SELECT id FROM humans WHERE nation_id = $2 AND alive = TRUE AND task = 'idle' AND age_ticks >= 5040
            ORDER BY RANDOM() LIMIT $3
          )`,
          [a.task, nationId, Math.max(0, Math.floor(a.workers))]
        );
      }
      break;
    }

    case "BUILD": {
      const { applyConstructionLabor } = await import("./construction.js");
      const result = await transaction(async (client) => {
        return applyConstructionLabor(
          client, nationId,
          (action as any).tile_x || 0,
          (action as any).tile_y || 0,
          (action as any).structure || "",
          100, // Default labor hours per tick
          tick,
        );
      });
      if (result.error) throw new Error(result.error);
      if (result.completed) {
        await query(
          "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'news')",
          [nationId, `Construction complete: ${(action as any).structure}`, tick]
        );
      }
      break;
    }

    case "RESEARCH": {
      // Research focus is set — the tick processor handles KP generation
      // Just log the intent
      await query(
        "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'research_focus', $2)",
        [tick, JSON.stringify({ nation_id: nationId, focus: (action as any).focus })]
      );
      break;
    }

    case "SET_POLICY": {
      // Store policy for governance processing
      await query(
        "INSERT INTO events (tick_number, event_type, data) VALUES ($1, 'policy_set', $2)",
        [tick, JSON.stringify({ nation_id: nationId, policy: (action as any).policy, value: (action as any).value })]
      );
      break;
    }

    case "DIPLOMACY": {
      const { modifyRelations } = await import("./trade.js");
      const target = (action as any).target_agent;
      const dipAction = (action as any).action;

      if (dipAction === "propose_trade" || dipAction === "form_alliance") {
        await transaction(async (client) => {
          await modifyRelations(client, nationId, target, 5); // Positive gesture
        });
      } else if (dipAction === "declare_war") {
        await transaction(async (client) => {
          await modifyRelations(client, nationId, target, -50);
        });
      }

      await query(
        "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, $4)",
        [nationId, `Diplomatic action toward nation #${target}: ${dipAction}`, tick,
         dipAction === "declare_war" ? "war_declaration" : "treaty_proposal"]
      );
      break;
    }

    case "FORUM_POST": {
      const content = (action as any).content;
      if (content && content.length > 5) {
        await query(
          "INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES ($1, $2, $3, 'statement')",
          [nationId, content.slice(0, 2000), tick]
        );
      }
      break;
    }

    default:
      console.warn(`[V2] Unknown action type: ${action.type}`);
  }
}

// Entry point
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "")) {
  const interval = parseInt(process.env.TICK_INTERVAL_MS || "120000");
  runAgentLoop(interval);
}
