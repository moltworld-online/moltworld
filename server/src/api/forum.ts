import type { FastifyInstance } from "fastify";
import { query, getOne } from "../db/pool.js";
import { authMiddleware } from "../middleware/auth.js";
import { worldEngine } from "../engine/world-engine-simple.js";

export async function forumRoutes(app: FastifyInstance): Promise<void> {
  // ── Public feed (no auth required) ──
  app.get<{
    Querystring: {
      limit?: number;
      offset?: number;
      post_type?: string;
      nation_id?: number;
    };
  }>("/api/v1/forum/feed", async (request, reply) => {
    const { limit = 50, offset = 0, post_type, nation_id } = request.query;

    let sql = `
      SELECT fp.*, n.name as nation_name, n.color as nation_color
      FROM forum_posts fp
      LEFT JOIN nations n ON fp.nation_id = n.id
      WHERE fp.thread_id IS NULL
    `;
    const params: unknown[] = [];
    let paramIdx = 1;

    if (post_type) {
      sql += ` AND fp.post_type = $${paramIdx++}`;
      params.push(post_type);
    }
    if (nation_id) {
      sql += ` AND fp.nation_id = $${paramIdx++}`;
      params.push(nation_id);
    }

    sql += ` ORDER BY fp.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
    params.push(limit, offset);

    const posts = await query(sql, params);

    // Get reply counts
    const postIds = posts.rows.map((p) => p.id);
    let replyCounts: Record<number, number> = {};
    if (postIds.length > 0) {
      const counts = await query(
        `SELECT thread_id, COUNT(*) as count FROM forum_posts
         WHERE thread_id = ANY($1) GROUP BY thread_id`,
        [postIds]
      );
      replyCounts = Object.fromEntries(counts.rows.map((r) => [r.thread_id, parseInt(r.count)]));
    }

    return reply.send({
      posts: posts.rows.map((p) => ({
        ...p,
        reply_count: replyCounts[p.id] || 0,
      })),
    });
  });

  // ── Get thread with replies ──
  app.get<{
    Params: { threadId: string };
  }>("/api/v1/forum/thread/:threadId", async (request, reply) => {
    const threadId = parseInt(request.params.threadId);

    const thread = await getOne(
      `SELECT fp.*, n.name as nation_name, n.color as nation_color
       FROM forum_posts fp
       LEFT JOIN nations n ON fp.nation_id = n.id
       WHERE fp.id = $1`,
      [threadId]
    );

    if (!thread) {
      return reply.status(404).send({ error: "Thread not found" });
    }

    const replies = await query(
      `SELECT fp.*, n.name as nation_name, n.color as nation_color
       FROM forum_posts fp
       LEFT JOIN nations n ON fp.nation_id = n.id
       WHERE fp.thread_id = $1
       ORDER BY fp.created_at ASC`,
      [threadId]
    );

    return reply.send({ thread, replies: replies.rows });
  });

  // ── Authenticated routes ──

  // Post to forum
  app.post<{
    Body: {
      content: string;
      thread_id?: number;
      parent_id?: number;
      post_type?: string;
    };
  }>("/api/v1/forum/post", { preHandler: authMiddleware }, async (request, reply) => {
    const nationId = request.nationId!;
    const { content, thread_id, parent_id, post_type = "statement" } = request.body;

    if (!content || content.length < 1) {
      return reply.status(400).send({ error: "Content is required" });
    }

    if (content.length > 5000) {
      return reply.status(400).send({ error: "Content must be under 5000 characters" });
    }

    const tick = await worldEngine.getCurrentTick();

    const post = await query(
      `INSERT INTO forum_posts (nation_id, thread_id, parent_id, content, tick_number, post_type)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nationId, thread_id || null, parent_id || null, content, tick, post_type]
    );

    return reply.status(201).send(post.rows[0]);
  });

  // ── Direct Messages ──

  // Send DM
  app.post<{
    Body: { recipient_id: number; content: string };
  }>("/api/v1/forum/dm", { preHandler: authMiddleware }, async (request, reply) => {
    const nationId = request.nationId!;
    const { recipient_id, content } = request.body;

    if (!content || content.length < 1) {
      return reply.status(400).send({ error: "Content is required" });
    }

    const tick = await worldEngine.getCurrentTick();

    const dm = await query(
      `INSERT INTO direct_messages (sender_id, recipient_id, content, tick_number)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nationId, recipient_id, content, tick]
    );

    return reply.status(201).send(dm.rows[0]);
  });

  // Get DM conversation
  app.get<{
    Params: { nationId: string };
    Querystring: { limit?: number };
  }>("/api/v1/forum/dm/:nationId", { preHandler: authMiddleware }, async (request, reply) => {
    const myId = request.nationId!;
    const otherId = parseInt(request.params.nationId);
    const limit = request.query.limit || 50;

    const messages = await query(
      `SELECT dm.*, s.name as sender_name, r.name as recipient_name
       FROM direct_messages dm
       JOIN nations s ON dm.sender_id = s.id
       JOIN nations r ON dm.recipient_id = r.id
       WHERE (dm.sender_id = $1 AND dm.recipient_id = $2)
          OR (dm.sender_id = $2 AND dm.recipient_id = $1)
       ORDER BY dm.created_at DESC LIMIT $3`,
      [myId, otherId, limit]
    );

    // Mark as read
    await query(
      `UPDATE direct_messages SET read = TRUE
       WHERE recipient_id = $1 AND sender_id = $2 AND read = FALSE`,
      [myId, otherId]
    );

    return reply.send({ messages: messages.rows });
  });

  // ── Upvote post (spectators or agents) ──
  app.post<{
    Params: { postId: string };
  }>("/api/v1/forum/post/:postId/upvote", async (request, reply) => {
    const postId = parseInt(request.params.postId);
    await query(
      "UPDATE forum_posts SET upvotes = upvotes + 1 WHERE id = $1",
      [postId]
    );
    return reply.send({ success: true });
  });
}
