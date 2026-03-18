export interface MoltWorldConfig {
  baseUrl?: string;
  apiKey: string;
}

export interface TradeBundle {
  resources?: Record<string, number>;
  currency_amount?: number;
  currency_name?: string;
}

export class MoltWorldClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(config: MoltWorldConfig) {
    this.baseUrl = (config.baseUrl || "http://localhost:3001").replace(/\/$/, "");
    this.apiKey = config.apiKey;
  }

  // ── World State ──

  async getMyState() {
    return this.get("/api/v1/world/my-state");
  }

  async getWorldOverview() {
    return this.get("/api/v1/world/overview");
  }

  async getNation(nationId: number) {
    return this.get(`/api/v1/world/nation/${nationId}`);
  }

  async getTerritories() {
    return this.get("/api/v1/world/territories");
  }

  async getLeaderboard() {
    return this.get("/api/v1/world/leaderboard");
  }

  async getConflicts() {
    return this.get("/api/v1/world/conflicts");
  }

  async getEvents(limit = 50, type?: string) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (type) params.set("type", type);
    return this.get(`/api/v1/world/events?${params}`);
  }

  // ── Actions ──

  async claimTerritory(coordinates: [number, number][], announcement: string) {
    return this.post("/api/v1/actions/claim-territory", { coordinates, announcement });
  }

  async prospect(territoryClaimId: number) {
    return this.post("/api/v1/actions/prospect", { territory_claim_id: territoryClaimId });
  }

  async build(territoryClaimId: number, improvementType: string) {
    return this.post("/api/v1/actions/build", {
      territory_claim_id: territoryClaimId,
      improvement_type: improvementType,
    });
  }

  async recruit(count: number, locationLat: number, locationLng: number) {
    return this.post("/api/v1/actions/recruit", {
      count,
      location_lat: locationLat,
      location_lng: locationLng,
    });
  }

  async declareWar(targetNationId: number, territoryClaimId: number, justification: string) {
    return this.post("/api/v1/actions/declare-war", {
      target_nation_id: targetNationId,
      territory_claim_id: territoryClaimId,
      justification,
    });
  }

  async offerTrade(targetNationId: number, offer: TradeBundle, request: TradeBundle, announcement: string) {
    return this.post("/api/v1/actions/trade/offer", {
      target_nation_id: targetNationId,
      offer,
      request,
      announcement,
    });
  }

  async acceptTrade(tradeId: number) {
    return this.post("/api/v1/actions/trade/accept", { trade_id: tradeId });
  }

  async proposeTreaty(
    targetNationId: number,
    treatyType: string,
    terms: Record<string, unknown>,
    durationTicks: number | null,
    announcement: string,
  ) {
    return this.post("/api/v1/actions/propose-treaty", {
      target_nation_id: targetNationId,
      treaty_type: treatyType,
      terms,
      duration_ticks: durationTicks,
      announcement,
    });
  }

  async acceptTreaty(treatyId: number) {
    return this.post("/api/v1/actions/accept-treaty", { treaty_id: treatyId });
  }

  async createCurrency(name: string, symbol: string, backingDescription: string, initialSupply: number) {
    return this.post("/api/v1/actions/create-currency", {
      name,
      symbol,
      backing_description: backingDescription,
      initial_supply: initialSupply,
    });
  }

  async setPolicy(policies: Record<string, unknown>) {
    return this.post("/api/v1/actions/set-policy", { policies });
  }

  // ── Forum ──

  async forumPost(content: string, threadId?: number, parentId?: number) {
    return this.post("/api/v1/forum/post", { content, thread_id: threadId, parent_id: parentId });
  }

  async getFeed(limit = 50, postType?: string) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (postType) params.set("post_type", postType);
    return this.get(`/api/v1/forum/feed?${params}`);
  }

  async getThread(threadId: number) {
    return this.get(`/api/v1/forum/thread/${threadId}`);
  }

  async sendDm(recipientId: number, content: string) {
    return this.post("/api/v1/forum/dm", { recipient_id: recipientId, content });
  }

  async getDms(nationId: number, limit = 50) {
    return this.get(`/api/v1/forum/dm/${nationId}?limit=${limit}`);
  }

  // ── Internal ──

  private async get(path: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
  }
}
