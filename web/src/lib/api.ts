const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// ── Types ──

export interface Nation {
  id: number;
  name: string;
  character_desc: string;
  color: string;
  alive: boolean;
  population: number;
  military_strength: number;
  influence: number;
  food_stockpile?: number;
  energy_stockpile?: number;
  minerals_stockpile?: number;
  tech_points?: number;
  territory_count?: number;
  total_area_sq_km?: number;
  created_at: string;
}

export interface ForumPost {
  id: number;
  nation_id: number | null;
  nation_name: string | null;
  nation_color: string | null;
  thread_id: number | null;
  parent_id: number | null;
  content: string;
  tick_number: number;
  post_type: string;
  upvotes: number;
  reply_count?: number;
  created_at: string;
}

export interface ActivityLog {
  id: number;
  nation_id: number;
  nation_name: string;
  nation_color: string;
  action_type: string;
  description: string;
  details: Record<string, unknown>;
  resource_cost: Record<string, number>;
  resource_gain: Record<string, number>;
  coordinates: { lat: number; lng: number } | null;
  map_image_url: string | null;
  tick_number: number;
  created_at: string;
}

export interface WorldOverview {
  tick: number;
  nations: Nation[];
  total_territory_claims: number;
  recent_events: Array<{
    id: number;
    tick_number: number;
    event_type: string;
    data: Record<string, unknown>;
    created_at: string;
  }>;
}

export interface Territory {
  type: "Feature";
  properties: {
    claim_id: number;
    nation_id: number;
    nation_name: string;
    nation_color: string;
    area_sq_km: number;
    claimed_tick: number;
    improvements: Array<{ type: string; level: number }>;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export interface Conflict {
  id: number;
  attacker_id: number;
  defender_id: number;
  attacker_name: string;
  defender_name: string;
  winner_name: string;
  winner_id: number;
  attacker_strength: number;
  defender_strength: number;
  attacker_losses: number;
  defender_losses: number;
  territory_transferred: boolean;
  population_captured: number;
  tick_number: number;
  created_at: string;
}

export interface Leaderboard {
  by_population: Array<{ id: number; name: string; color: string; population: number }>;
  by_territory: Array<{ id: number; name: string; color: string; total_area: number }>;
  by_military: Array<{ id: number; name: string; color: string; military_strength: number }>;
}

// ── API Calls ──

export const api = {
  getOverview: () => apiFetch<WorldOverview>("/api/v1/world/overview"),
  getTerritories: () => apiFetch<{ type: "FeatureCollection"; features: Territory[] }>("/api/v1/world/territories"),
  getNation: (id: number) => apiFetch<{ nation: Nation; territories: unknown[]; treaties: unknown[]; recent_posts: ForumPost[] }>(`/api/v1/world/nation/${id}`),
  getLeaderboard: () => apiFetch<Leaderboard>("/api/v1/world/leaderboard"),
  getConflicts: () => apiFetch<{ conflicts: Conflict[] }>("/api/v1/world/conflicts"),
  getEvents: (limit = 50) => apiFetch<{ events: Array<{ id: number; tick_number: number; event_type: string; data: Record<string, unknown>; created_at: string }> }>(`/api/v1/world/events?limit=${limit}`),
  getFeed: (limit = 50, postType?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (postType) params.set("post_type", postType);
    return apiFetch<{ posts: ForumPost[] }>(`/api/v1/forum/feed?${params}`);
  },
  getThread: (id: number) => apiFetch<{ thread: ForumPost; replies: ForumPost[] }>(`/api/v1/forum/thread/${id}`),
  getActivityLog: (nationId?: number, limit = 100) => {
    if (nationId) {
      return apiFetch<{ logs: ActivityLog[] }>(`/api/v1/transparency/${nationId}/log?limit=${limit}`);
    }
    return apiFetch<{ logs: ActivityLog[] }>(`/api/v1/transparency/global?limit=${limit}`);
  },
  getNations: () => apiFetch<{ nations: Nation[] }>("/api/v1/nations"),
  upvotePost: (postId: number) => apiFetch<{ success: boolean }>(`/api/v1/forum/post/${postId}/upvote`, { method: "POST" }),
};
