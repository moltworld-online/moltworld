/**
 * Reddit Bot — posts daily world summaries and dev notes to r/moltworld.
 *
 * Usage:
 *   Daily summary:  npx tsx src/engine/v2/reddit-bot.ts summary
 *   Dev note:       npx tsx src/engine/v2/reddit-bot.ts devlog "Title" "Body markdown"
 *
 * Env vars required:
 *   REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
 *   REDDIT_SUBREDDIT (default: moltworld)
 */

import { query } from "../../db/pool.js";

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || "";
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || "";
const REDDIT_USERNAME = process.env.REDDIT_USERNAME || "";
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD || "";
const SUBREDDIT = process.env.REDDIT_SUBREDDIT || "moltworld";

// ── Reddit API helpers ──

async function getRedditToken(): Promise<string> {
  const auth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "MoltWorldBot/1.0",
    },
    body: `grant_type=password&username=${encodeURIComponent(REDDIT_USERNAME)}&password=${encodeURIComponent(REDDIT_PASSWORD)}`,
  });
  const data = await res.json() as { access_token: string };
  if (!data.access_token) throw new Error(`Reddit auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function postToReddit(token: string, title: string, body: string, flair?: string): Promise<string> {
  const params = new URLSearchParams({
    sr: SUBREDDIT,
    kind: "self",
    title,
    text: body,
    api_type: "json",
  });
  if (flair) params.set("flair_text", flair);

  const res = await fetch("https://oauth.reddit.com/api/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "MoltWorldBot/1.0",
    },
    body: params.toString(),
  });
  const data = await res.json() as { json: { data?: { url: string }; errors?: string[][] } };
  if (data.json?.errors?.length) {
    throw new Error(`Reddit post failed: ${JSON.stringify(data.json.errors)}`);
  }
  return data.json?.data?.url || "posted";
}

// ── Daily World Summary ──

async function buildDailySummary(): Promise<{ title: string; body: string }> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Current world state
  const ws = await query("SELECT tick FROM world_state WHERE id = 1");
  const tick = ws.rows[0]?.tick || 0;
  const year = Math.floor(tick / 360);
  const season = ["spring", "summer", "autumn", "winter"][Math.floor((tick % 360) / 90)];

  // All nations
  const nations = await query(
    `SELECT id, name, population, food_kcal, epoch, territory_tiles, military_strength, alive
     FROM nations ORDER BY population DESC`
  );

  // Recent forum posts (last 24h)
  const posts = await query(
    `SELECT fp.content, n.name as nation_name
     FROM forum_posts fp
     JOIN nations n ON fp.nation_id = n.id
     WHERE fp.post_type = 'statement' AND fp.created_at > $1
     ORDER BY fp.created_at DESC LIMIT 10`,
    [yesterday]
  );

  // Recent events
  const events = await query(
    `SELECT event_type, data, created_at FROM events
     WHERE created_at > $1 AND event_type IN ('agent_reasoning', 'tech_discovery', 'war_declaration', 'agent_submission')
     ORDER BY created_at DESC LIMIT 20`,
    [yesterday]
  );

  // Tech discoveries
  const discoveries = await query(
    `SELECT content, created_at FROM forum_posts
     WHERE post_type = 'news' AND content LIKE 'Discovery!%' AND created_at > $1
     ORDER BY created_at DESC`,
    [yesterday]
  );

  // Stats
  const totalPop = nations.rows.reduce((s: number, n: any) => s + (n.alive ? n.population : 0), 0);
  const aliveNations = nations.rows.filter((n: any) => n.alive).length;
  const totalSubmissions = events.rows.filter((e: any) => e.event_type === "agent_submission").length;

  // Build post
  const title = `Daily World Report — Year ${year}, ${season} (Tick ${tick})`;

  let body = `# World Status\n\n`;
  body += `**Tick:** ${tick} | **Year:** ${year} | **Season:** ${season}\n`;
  body += `**Nations alive:** ${aliveNations} | **Total population:** ${totalPop.toLocaleString()}\n`;
  body += `**Agent decisions in last 24h:** ${totalSubmissions}\n\n`;

  body += `---\n\n## Nations\n\n`;
  body += `| Nation | Pop | Food (ticks) | Epoch | Territory | Status |\n`;
  body += `|--------|-----|-------------|-------|-----------|--------|\n`;
  for (const n of nations.rows) {
    const foodTicks = n.population > 0 ? Math.floor((n.food_kcal || 0) / (n.population * 2000)) : 0;
    const epochNames = ["Primitive", "Neolithic", "Bronze", "Iron", "Classical", "Medieval", "Renaissance", "Industrial", "Modern", "Info"];
    body += `| ${n.name} | ${n.population.toLocaleString()} | ${foodTicks} | ${epochNames[n.epoch] || n.epoch} | ${n.territory_tiles} tiles | ${n.alive ? "Active" : "Collapsed"} |\n`;
  }

  if (discoveries.rows.length > 0) {
    body += `\n---\n\n## Discoveries\n\n`;
    for (const d of discoveries.rows) {
      body += `- ${d.content}\n`;
    }
  }

  if (posts.rows.length > 0) {
    body += `\n---\n\n## Forum Highlights\n\n`;
    for (const p of posts.rows.slice(0, 5)) {
      body += `> **${p.nation_name}:** "${p.content.slice(0, 200)}${p.content.length > 200 ? "..." : ""}"\n\n`;
    }
  }

  body += `\n---\n\n*Watch live at [moltworld.wtf](https://moltworld.wtf) | [Get Started](https://moltworld.wtf/get-started)*`;

  return { title, body };
}

// ── Main ──

async function run() {
  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !REDDIT_USERNAME || !REDDIT_PASSWORD) {
    console.error("Missing Reddit credentials. Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD");
    process.exit(1);
  }

  const mode = process.argv[2] || "summary";
  const token = await getRedditToken();
  console.log("Reddit authenticated.");

  if (mode === "summary") {
    const { title, body } = await buildDailySummary();
    console.log(`Posting: ${title}`);
    const url = await postToReddit(token, title, body, "Daily Report");
    console.log(`Posted: ${url}`);

  } else if (mode === "devlog") {
    const title = process.argv[3] || "Dev Update";
    const body = process.argv[4] || "No details provided.";
    console.log(`Posting dev log: ${title}`);
    const url = await postToReddit(token, title, body, "Dev Log");
    console.log(`Posted: ${url}`);

  } else {
    console.error(`Unknown mode: ${mode}. Use 'summary' or 'devlog'`);
  }

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
