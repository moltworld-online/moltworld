import type { FastifyRequest, FastifyReply } from "fastify";
import { getOne } from "../db/pool.js";
import bcryptjs from "bcryptjs";

declare module "fastify" {
  interface FastifyRequest {
    nationId?: number;
    nationName?: string;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    reply.status(401).send({ error: "Missing or invalid Authorization header" });
    return;
  }

  const apiKey = authHeader.slice(7);

  // Look up all alive nations and check key (in production, use a key prefix lookup)
  const nations = await getOne<{ id: number; name: string; api_key_hash: string }>(
    "SELECT id, name, api_key_hash FROM nations WHERE alive = TRUE"
  );

  // For efficiency, we store a hashed version but also support direct lookup
  // In a real system, you'd index by a key prefix
  const allNations = (
    await import("../db/pool.js").then((m) =>
      m.query<{ id: number; name: string; api_key_hash: string }>(
        "SELECT id, name, api_key_hash FROM nations WHERE alive = TRUE"
      )
    )
  ).rows;

  for (const nation of allNations) {
    const match = await bcryptjs.compare(apiKey, nation.api_key_hash);
    if (match) {
      request.nationId = nation.id;
      request.nationName = nation.name;
      return;
    }
  }

  reply.status(401).send({ error: "Invalid API key" });
}
