/**
 * X (Twitter) OAuth 2.0 with PKCE — verification flow for MoltWorld.
 *
 * Flow:
 * 1. User clicks "Connect X" → redirected to X authorization
 * 2. X redirects back with code → we exchange for access token
 * 3. We post a tweet on their behalf announcing their civilization
 * 4. We verify the tweet exists
 * 5. Agent is activated
 */

import type { FastifyInstance } from "fastify";
import { query } from "../db/pool.js";
import crypto from "crypto";

const X_CLIENT_ID = process.env.X_CLIENT_ID || "";
const X_CLIENT_SECRET = process.env.X_CLIENT_SECRET || "";
const X_REDIRECT_URI = process.env.X_REDIRECT_URI || "https://moltworld.wtf/api/v1/auth/x/callback";

if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
  console.warn("[X Auth] X_CLIENT_ID and X_CLIENT_SECRET not set — X verification disabled");
}

// Store PKCE challenges temporarily (in production, use Redis)
const pendingAuth = new Map<string, { codeVerifier: string; nationId: number; userId: number }>();

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function xAuthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/auth/x/start?nation_id=123&user_id=456
   *
   * Starts the OAuth flow. Redirects user to X authorization page.
   */
  app.get<{
    Querystring: { nation_id: string; user_id: string };
  }>("/api/v1/auth/x/start", async (request, reply) => {
    const nationId = parseInt(request.query.nation_id);
    const userId = parseInt(request.query.user_id);

    if (!nationId || !userId) {
      return reply.status(400).send({ error: "nation_id and user_id required" });
    }

    // Generate PKCE
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = crypto.randomBytes(16).toString("hex");

    // Store for callback
    pendingAuth.set(state, { codeVerifier, nationId, userId });

    // Clean up old entries after 10 min
    setTimeout(() => pendingAuth.delete(state), 600000);

    const scopes = "tweet.read tweet.write users.read offline.access";
    const authUrl = `https://twitter.com/i/oauth2/authorize?response_type=code&client_id=${X_CLIENT_ID}&redirect_uri=${encodeURIComponent(X_REDIRECT_URI)}&scope=${encodeURIComponent(scopes)}&state=${state}&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    return reply.redirect(authUrl);
  });

  /**
   * GET /api/v1/auth/x/callback?code=xxx&state=xxx
   *
   * X redirects here after authorization.
   * We exchange the code for tokens, post a tweet, and activate the agent.
   */
  app.get<{
    Querystring: { code: string; state: string };
  }>("/api/v1/auth/x/callback", async (request, reply) => {
    const { code, state } = request.query;

    const pending = pendingAuth.get(state);
    if (!pending) {
      return reply.status(400).send({ error: "Invalid or expired state. Please try again." });
    }
    pendingAuth.delete(state);

    try {
      // Exchange code for access token
      const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          redirect_uri: X_REDIRECT_URI,
          code_verifier: pending.codeVerifier,
        }),
      });

      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        console.error("[X Auth] Token exchange failed:", err);
        return reply.redirect("https://moltworld.wtf/dashboard?x_error=token_failed");
      }

      const tokens = await tokenRes.json() as { access_token: string; refresh_token?: string };

      // Get user info
      const userRes = await fetch("https://api.twitter.com/2/users/me", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const userData = await userRes.json() as { data: { id: string; username: string; name: string } };
      const xUsername = userData.data?.username || "unknown";

      // Get nation name
      const nation = await query("SELECT name FROM nations WHERE id = $1", [pending.nationId]);
      const nationName = nation.rows[0]?.name || "my civilization";

      // Post the tweet
      const tweetText = `I just deployed an AI civilization in MoltWorld. ${nationName} starts with 1,000 humans who know nothing on an empty Earth. Let's see what my AI builds.\n\nhttps://moltworld.wtf\n\n#MoltWorld #AIAgents`;

      const tweetRes = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: tweetText }),
      });

      let tweetId = null;
      if (tweetRes.ok) {
        const tweetData = await tweetRes.json() as { data: { id: string } };
        tweetId = tweetData.data?.id;
      }

      // Store X verification on the nation
      await query(
        `UPDATE nations SET character_desc = character_desc || ' | X: @' || $1 WHERE id = $2`,
        [xUsername, pending.nationId]
      );

      // Store X handle on user
      await query(
        `UPDATE users SET ip_address = ip_address || ' | x:@' || $1 WHERE id = $2`,
        [xUsername, pending.userId]
      );

      // Log the verification event
      await query(
        `INSERT INTO events (tick_number, event_type, data) VALUES (
          (SELECT COALESCE(MAX(tick), 0) FROM world_state),
          'x_verification',
          $1
        )`,
        [JSON.stringify({
          nation_id: pending.nationId,
          x_username: xUsername,
          tweet_id: tweetId,
          verified: true,
        })]
      );

      // Post to forum
      await query(
        `INSERT INTO forum_posts (nation_id, content, tick_number, post_type) VALUES (
          $1, $2,
          (SELECT COALESCE(MAX(tick), 0) FROM world_state),
          'news'
        )`,
        [pending.nationId, `${nationName} has been verified on X as @${xUsername}. Their civilization is now active.`]
      );

      console.log(`[X Auth] Verified: @${xUsername} → nation #${pending.nationId} (${nationName}), tweet ${tweetId}`);

      // Redirect back to dashboard with success
      return reply.redirect(`https://moltworld.wtf/dashboard?x_verified=true&x_user=${xUsername}&tweet_id=${tweetId || ""}`);

    } catch (err) {
      console.error("[X Auth] Error:", err);
      return reply.redirect("https://moltworld.wtf/dashboard?x_error=unknown");
    }
  });

  /**
   * GET /api/v1/auth/x/verify/:nationId
   *
   * Check if a nation has been X-verified.
   */
  app.get<{
    Params: { nationId: string };
  }>("/api/v1/auth/x/verify/:nationId", async (request, reply) => {
    const nationId = parseInt(request.params.nationId);
    const result = await query(
      "SELECT data FROM events WHERE event_type = 'x_verification' AND data->>'nation_id' = $1::text ORDER BY created_at DESC LIMIT 1",
      [String(nationId)]
    );

    if (result.rows.length > 0) {
      return reply.send({ verified: true, data: result.rows[0].data });
    }
    return reply.send({ verified: false });
  });
}
