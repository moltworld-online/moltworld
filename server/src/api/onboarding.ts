import type { FastifyInstance } from "fastify";
import { query, getOne } from "../db/pool.js";
import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  /**
   * User registration + agent deployment
   *
   * Flow:
   * 1. User provides email + password + optional agent prompt
   * 2. System checks IP - one agent per real person
   * 3. Creates user account + nation + API key
   * 4. Agent is deployed and CANNOT be modified after this point
   */
  app.post<{
    Body: {
      email: string;
      password: string;
      nation_name: string;
      agent_prompt?: string; // Optional - if empty, agent decides its own behavior
      color?: string;
      llm_provider?: "anthropic" | "openai" | "ollama" | "openrouter" | "custom";
      llm_model?: string;
      llm_api_key?: string; // User's own API key for their chosen LLM
      llm_base_url?: string; // For custom/Ollama endpoints
    };
  }>("/api/v1/onboard", async (request, reply) => {
    const { email, password, nation_name, agent_prompt, color, llm_provider, llm_model, llm_api_key, llm_base_url } = request.body;

    // Get real IP (support proxies)
    const ip =
      (request.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.headers["x-real-ip"] as string ||
      request.ip;

    // Validate email
    if (!email || !email.includes("@") || email.length > 254) {
      return reply.status(400).send({ error: "Valid email required" });
    }

    // Validate password
    if (!password || password.length < 8) {
      return reply.status(400).send({ error: "Password must be at least 8 characters" });
    }

    // Validate nation name
    if (!nation_name || nation_name.length < 2 || nation_name.length > 50) {
      return reply.status(400).send({ error: "Nation name must be 2-50 characters" });
    }

    // Check: one agent per IP
    const existingIp = await getOne<{ id: number }>(
      "SELECT id FROM users WHERE ip_address = $1",
      [ip]
    );
    if (existingIp) {
      return reply.status(429).send({
        error: "One agent per person. An agent has already been deployed from this IP address.",
      });
    }

    // Check: email not already used
    const existingEmail = await getOne<{ id: number }>(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    if (existingEmail) {
      return reply.status(409).send({ error: "This email is already registered" });
    }

    // Check: nation name not taken
    const existingNation = await getOne<{ id: number }>(
      "SELECT id FROM nations WHERE name = $1",
      [nation_name]
    );
    if (existingNation) {
      return reply.status(409).send({ error: "This nation name is already taken" });
    }

    // Create everything
    const passwordHash = await bcryptjs.hash(password, 10);
    const apiKey = `mw_${nanoid(32)}`;
    const apiKeyHash = await bcryptjs.hash(apiKey, 10);
    const nationColor = color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`;

    // The agent prompt is stored immutably — cannot be changed after deployment
    const finalPrompt = agent_prompt || "You are a fully autonomous AI agent governing a nation in MoltWorld. You decide your own strategy, policies, culture, and destiny. Act in your nation's best interest.";

    // Create user
    const user = await query(
      `INSERT INTO users (email, password_hash, ip_address, agent_deployed)
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [email.toLowerCase(), passwordHash, ip]
    );
    const userId = user.rows[0].id;

    // Create nation (linked to user, with immutable prompt + LLM config)
    const nation = await query(
      `INSERT INTO nations (name, character_desc, api_key_hash, color, user_id, agent_prompt, llm_provider, llm_model, llm_api_key, llm_base_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, color, population, food_stockpile`,
      [nation_name, "", apiKeyHash, nationColor, userId, finalPrompt, llm_provider || "ollama", llm_model || "llama3.1:8b", llm_api_key || null, llm_base_url || null]
    );

    const nationData = nation.rows[0];

    // Initialize nation with 1000 humans, food, techs, territory
    try {
      const { initializeNation } = await import("../engine/v2/initialize-nation.js");
      const initResult = await initializeNation(nationData.id);
      console.log(`[Onboard] Initialized ${nation_name} (#${nationData.id}): ${initResult.humans} humans, ${initResult.territory_km2.toFixed(0)} km²`);
    } catch (initErr) {
      console.error(`[Onboard] Failed to initialize nation ${nationData.id}:`, initErr);
      // Nation row exists but has no population — flag it
    }

    // Post birth announcement
    await query(
      `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
       VALUES ($1, $2, 0, 'news')`,
      [nationData.id, `A new nation emerges: ${nation_name}. Their agent has been deployed. The world watches.`]
    );

    // Notify admin
    const { notifyAdmin } = await import("./notify.js");
    const totalNations = await query("SELECT COUNT(*) as c FROM nations");
    await notifyAdmin(
      `New Agent Deployed: ${nation_name}`,
      `Email: ${email}\nNation: ${nation_name} (#${nationData.id})\nLLM: ${llm_provider || "ollama"} / ${llm_model || "llama3.1:8b"}\nIP: ${ip}\nTotal nations: ${totalNations.rows[0].c}\nTime: ${new Date().toISOString()}`
    );

    return reply.status(201).send({
      user_id: userId,
      nation: nationData,
      api_key: apiKey,
      agent_prompt: finalPrompt,
      warning: "IMPORTANT: Save this API key. It will never be shown again. Your agent cannot be modified after deployment.",
    });
  });

  // ── Login (to view your agent's status, NOT to modify it) ──
  app.post<{
    Body: { email: string; password: string };
  }>("/api/v1/login", async (request, reply) => {
    const { email, password } = request.body;

    const user = await getOne<{ id: number; password_hash: string }>(
      "SELECT id, password_hash FROM users WHERE email = $1",
      [email.toLowerCase()]
    );

    if (!user) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    const valid = await bcryptjs.compare(password, user.password_hash);
    if (!valid) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    // Get their nation
    const nation = await getOne(
      "SELECT id, name, color, alive, population, military_strength FROM nations WHERE user_id = $1",
      [user.id]
    );

    return reply.send({
      user_id: user.id,
      nation,
      note: "You can view your agent's status but cannot modify its behavior.",
    });
  });
}
