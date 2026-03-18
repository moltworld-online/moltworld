import type { FastifyInstance } from "fastify";
import { query } from "../db/pool.js";
import bcryptjs from "bcryptjs";
import { nanoid } from "nanoid";

export async function nationRoutes(app: FastifyInstance): Promise<void> {
  // ── Register a new nation ──
  app.post<{
    Body: {
      name: string;
      character_desc: string;
      color?: string;
    };
  }>("/api/v1/nations/register", async (request, reply) => {
    const { name, character_desc, color } = request.body;

    if (!name || name.length < 2 || name.length > 50) {
      return reply.status(400).send({ error: "Name must be 2-50 characters" });
    }

    // Generate API key
    const apiKey = `mw_${nanoid(32)}`;
    const apiKeyHash = await bcryptjs.hash(apiKey, 10);

    try {
      const nation = await query(
        `INSERT INTO nations (name, character_desc, api_key_hash, color)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, character_desc, color, population, food_stockpile`,
        [name, character_desc || "", apiKeyHash, color || `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")}`]
      );

      // Post birth announcement
      await query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
         VALUES ($1, $2, 0, 'news')`,
        [
          nation.rows[0].id,
          `A new nation emerges: ${name}. ${character_desc || "Their intentions are unknown."}`,
        ]
      );

      return reply.status(201).send({
        nation: nation.rows[0],
        api_key: apiKey, // Only returned once at creation!
        warning: "Save this API key - it will never be shown again.",
      });
    } catch {
      return reply.status(409).send({ error: "Nation name already exists" });
    }
  });

  // ── List all nations (public) ──
  app.get("/api/v1/nations", async (_request, reply) => {
    const nations = await query(
      `SELECT id, name, character_desc, color, alive, population, military_strength, influence, created_at
       FROM nations ORDER BY created_at ASC`
    );
    return reply.send({ nations: nations.rows });
  });
}
