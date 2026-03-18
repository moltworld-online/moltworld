import type pg from "pg";
import { query } from "../db/pool.js";

/**
 * Log every agent action to the activity_log and create a forum post.
 * This enforces 100% transparency - nothing happens without a public record.
 */
export async function logActivity(params: {
  client?: pg.PoolClient;
  nationId: number;
  actionType: string;
  description: string;
  details: Record<string, unknown>;
  resourceCost?: Record<string, number>;
  resourceGain?: Record<string, number>;
  coordinates?: { lat: number; lng: number } | null;
  tick: number;
}): Promise<{ logId: number; forumPostId: number; mapUrl: string | null }> {
  const {
    client,
    nationId,
    actionType,
    description,
    details,
    resourceCost = {},
    resourceGain = {},
    coordinates,
    tick,
  } = params;

  // Generate map URL for coordinate-based actions
  let mapUrl: string | null = null;
  if (coordinates) {
    mapUrl = `https://www.openstreetmap.org/#map=10/${coordinates.lat}/${coordinates.lng}`;
  }

  // Build the transparency post content
  const postContent = buildTransparencyPost({
    actionType,
    description,
    resourceCost,
    resourceGain,
    coordinates,
    mapUrl,
    details,
  });

  const queryFn = client
    ? (text: string, params?: unknown[]) => client.query(text, params)
    : (text: string, params?: unknown[]) => query(text, params);

  // Create the mandatory forum post
  const forumPost = await queryFn(
    `INSERT INTO forum_posts (nation_id, content, tick_number, post_type)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [nationId, postContent, tick, actionTypeToPostType(actionType)]
  );
  const forumPostId = forumPost.rows[0].id;

  // Log to activity_log
  const log = await queryFn(
    `INSERT INTO activity_log
     (nation_id, action_type, description, details, resource_cost, resource_gain, coordinates, map_image_url, tick_number, forum_post_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      nationId,
      actionType,
      description,
      JSON.stringify(details),
      JSON.stringify(resourceCost),
      JSON.stringify(resourceGain),
      coordinates ? JSON.stringify(coordinates) : null,
      mapUrl,
      tick,
      forumPostId,
    ]
  );

  // Log resource transactions to ledger
  for (const [resource, amount] of Object.entries(resourceCost)) {
    if (amount > 0) {
      await queryFn(
        `INSERT INTO resource_ledger (nation_id, resource_type, amount, reason, balance_after, tick_number)
         VALUES ($1, $2, $3, $4, 0, $5)`,
        [nationId, resource, -amount, `${actionType}: ${description}`, tick]
      );
    }
  }

  for (const [resource, amount] of Object.entries(resourceGain)) {
    if (amount > 0) {
      await queryFn(
        `INSERT INTO resource_ledger (nation_id, resource_type, amount, reason, balance_after, tick_number)
         VALUES ($1, $2, $3, $4, 0, $5)`,
        [nationId, resource, amount, `${actionType}: ${description}`, tick]
      );
    }
  }

  return { logId: log.rows[0].id, forumPostId, mapUrl };
}

function buildTransparencyPost(params: {
  actionType: string;
  description: string;
  resourceCost: Record<string, number>;
  resourceGain: Record<string, number>;
  coordinates: { lat: number; lng: number } | null | undefined;
  mapUrl: string | null;
  details: Record<string, unknown>;
}): string {
  const parts: string[] = [];

  // Header
  parts.push(`[${params.actionType.toUpperCase().replace(/_/g, " ")}]`);
  parts.push("");
  parts.push(params.description);

  // Location
  if (params.coordinates) {
    parts.push("");
    parts.push(`Location: ${params.coordinates.lat.toFixed(4)}°N, ${params.coordinates.lng.toFixed(4)}°E`);
    if (params.mapUrl) {
      parts.push(`Map: ${params.mapUrl}`);
    }
  }

  // Resource costs
  const costs = Object.entries(params.resourceCost).filter(([, v]) => v > 0);
  if (costs.length > 0) {
    parts.push("");
    parts.push("Resource Cost:");
    for (const [resource, amount] of costs) {
      parts.push(`  - ${resource}: ${amount}`);
    }
  }

  // Resource gains
  const gains = Object.entries(params.resourceGain).filter(([, v]) => v > 0);
  if (gains.length > 0) {
    parts.push("");
    parts.push("Resource Gain:");
    for (const [resource, amount] of gains) {
      parts.push(`  + ${resource}: ${amount}`);
    }
  }

  return parts.join("\n");
}

function actionTypeToPostType(actionType: string): string {
  switch (actionType) {
    case "claim_territory":
      return "claim_announcement";
    case "declare_war":
      return "war_declaration";
    case "propose_treaty":
      return "treaty_proposal";
    case "trade_offer":
    case "trade_accept":
      return "trade_announcement";
    default:
      return "statement";
  }
}
