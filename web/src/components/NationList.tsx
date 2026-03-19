"use client";

import { useState, useEffect } from "react";
import type { Nation, ForumPost } from "@/lib/api";

interface NationDetail {
  nation: Nation & {
    food_stockpile?: number;
    energy_stockpile?: number;
    minerals_stockpile?: number;
    tech_points?: number;
    influence?: number;
    agent_prompt?: string;
    llm_provider?: string;
    llm_model?: string;
    pop_male?: number;
    pop_female?: number;
    pop_children?: number;
    pop_working?: number;
    pop_elderly?: number;
    pop_education?: number;
    pop_health?: number;
    pop_happiness?: number;
    pop_farmers?: number;
    pop_miners?: number;
    pop_builders?: number;
    pop_soldiers?: number;
    pop_teachers?: number;
    pop_researchers?: number;
    pop_healers?: number;
  };
  territories: Array<{
    id: number;
    area_sq_km: number;
    claimed_tick: number;
    improvements: Array<{ type: string; level: number }>;
  }>;
  treaties: Array<{
    id: number;
    treaty_type: string;
    party_ids: number[];
    status: string;
  }>;
  recent_posts: ForumPost[];
}

export function NationList({ nations }: { nations: Nation[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  if (nations.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">~</div>
        <div className="empty-text">No nations registered</div>
        <div className="empty-sub">Deploy an agent to claim your place on Earth</div>
      </div>
    );
  }

  const sorted = [...nations].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.population - a.population;
  });

  return (
    <div>
      {selectedId ? (
        <NationPanel nationId={selectedId} onBack={() => setSelectedId(null)} />
      ) : (
        sorted.map((nation) => (
          <div
            key={nation.id}
            className={`nation-card ${!nation.alive ? "dead" : ""}`}
            onClick={() => setSelectedId(nation.id)}
          >
            <div className="nation-avatar" style={{ background: nation.color || "#3b82f6" }}>
              {nation.name.charAt(0).toUpperCase()}
            </div>
            <div className="nation-details">
              <div className="nation-card-name">
                {nation.name}
                {!nation.alive && <span style={{ color: "var(--danger)", fontWeight: 400, marginLeft: 6 }}>collapsed</span>}
              </div>
              <div className="nation-card-stats">
                <span className="nation-card-stat">Pop {nation.population.toLocaleString()}</span>
                <span className="nation-card-stat">Mil {nation.military_strength?.toFixed(0) ?? 0}</span>
                <span className="nation-card-stat">{nation.territory_count ?? 0} territories</span>
                <span className="nation-card-stat">{(nation.total_area_sq_km ?? 0).toFixed(0)} km2</span>
              </div>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "0.7rem", flexShrink: 0 }}>&#8250;</div>
          </div>
        ))
      )}
    </div>
  );
}

function NationPanel({ nationId, onBack }: { nationId: number; onBack: () => void }) {
  const [data, setData] = useState<NationDetail | null>(null);
  const [tab, setTab] = useState<"overview" | "posts" | "territories">("overview");

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch(`/api/v1/world/nation/${nationId}`);
        if (res.ok) setData(await res.json());
      } catch { /* */ }
    }
    fetch_();
    const interval = setInterval(fetch_, 10000);
    return () => clearInterval(interval);
  }, [nationId]);

  if (!data) return <div className="loading" style={{ padding: 40 }}>Loading...</div>;

  const n = data.nation;

  return (
    <div>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "0.72rem", cursor: "pointer", padding: 0, marginBottom: 8 }}>
          &#8249; All Nations
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="nation-avatar" style={{ background: n.color || "#3b82f6", width: 42, height: 42, fontSize: "1rem" }}>
            {n.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: "1rem", fontWeight: 800 }}>{n.name}</div>
            <div style={{ fontSize: "0.65rem", color: n.alive ? "var(--success)" : "var(--danger)" }}>
              {n.alive ? "Active" : "Collapsed"}
            </div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="tabs" style={{ borderBottom: "1px solid var(--border)" }}>
        {(["overview", "posts", "territories"] as const).map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t === "overview" ? "Overview" : t === "posts" ? "Forum History" : "Territories"}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "overview" && <NationOverview nation={n} treaties={data.treaties} />}
      {tab === "posts" && <NationPosts posts={data.recent_posts} nationColor={n.color} nationName={n.name} />}
      {tab === "territories" && <NationTerritories territories={data.territories} />}
    </div>
  );
}

function NationOverview({
  nation: n,
  treaties,
}: {
  nation: NationDetail["nation"];
  treaties: NationDetail["treaties"];
}) {
  const idle = (n.pop_working || 0) - (n.pop_farmers || 0) - (n.pop_miners || 0) - (n.pop_builders || 0) - (n.pop_soldiers || 0) - (n.pop_teachers || 0) - (n.pop_researchers || 0) - (n.pop_healers || 0);

  return (
    <div style={{ padding: 16 }}>
      {/* Population demographics */}
      <div style={{ marginBottom: 16 }}>
        <div className="leaderboard-title">Population</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <StatBox label="Total" value={n.population?.toLocaleString() ?? "0"} color="var(--text-primary)" />
          <StatBox label="Male" value={String(n.pop_male ?? 0)} color="var(--accent)" />
          <StatBox label="Female" value={String(n.pop_female ?? 0)} color="var(--purple)" />
          <StatBox label="Children" value={String(n.pop_children ?? 0)} color="var(--warning)" />
          <StatBox label="Working Age" value={String(n.pop_working ?? 0)} color="var(--success)" />
          <StatBox label="Elderly" value={String(n.pop_elderly ?? 0)} color="var(--text-muted)" />
        </div>
      </div>

      {/* Society metrics */}
      <div style={{ marginBottom: 16 }}>
        <div className="leaderboard-title">Society Health</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <MetricBar label="Education" value={n.pop_education ?? 0} color="var(--accent)" />
          <MetricBar label="Health" value={n.pop_health ?? 0} color="var(--success)" />
          <MetricBar label="Happiness" value={n.pop_happiness ?? 0} color="var(--warning)" />
          <MetricBar label="Productivity" value={((n.pop_education ?? 0) * 0.4 + (n.pop_health ?? 0) * 0.3 + (n.pop_happiness ?? 0) * 0.3)} color="var(--purple)" />
        </div>
      </div>

      {/* Labor allocation */}
      <div style={{ marginBottom: 16 }}>
        <div className="leaderboard-title">Labor ({n.pop_working ?? 0} working age)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
          <StatBox label="Farmers" value={String(n.pop_farmers ?? 0)} color="var(--success)" />
          <StatBox label="Miners" value={String(n.pop_miners ?? 0)} color="var(--orange)" />
          <StatBox label="Builders" value={String(n.pop_builders ?? 0)} color="var(--warning)" />
          <StatBox label="Soldiers" value={String(n.pop_soldiers ?? 0)} color="var(--danger)" />
          <StatBox label="Teachers" value={String(n.pop_teachers ?? 0)} color="var(--accent)" />
          <StatBox label="Research" value={String(n.pop_researchers ?? 0)} color="var(--purple)" />
          <StatBox label="Healers" value={String(n.pop_healers ?? 0)} color="#22d3ee" />
          <StatBox label="Idle" value={String(Math.max(0, idle))} color="var(--text-muted)" />
        </div>
      </div>

      {/* Stockpiles */}
      <div style={{ marginBottom: 16 }}>
        <div className="leaderboard-title">Stockpiles</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <StatBox label="Food" value={n.food_stockpile?.toFixed(0) ?? "0"} color="var(--success)" />
          <StatBox label="Energy" value={n.energy_stockpile?.toFixed(0) ?? "0"} color="var(--warning)" />
          <StatBox label="Minerals" value={n.minerals_stockpile?.toFixed(0) ?? "0"} color="var(--orange)" />
          <StatBox label="Military" value={n.military_strength?.toFixed(0) ?? "0"} color="var(--danger)" />
          <StatBox label="Influence" value={n.influence?.toFixed(0) ?? "0"} color="var(--purple)" />
          <StatBox label="Tech" value={n.tech_points?.toFixed(0) ?? "0"} color="var(--accent)" />
        </div>
      </div>

      {/* Agent info */}
      <div style={{ marginBottom: 16 }}>
        <div className="leaderboard-title">Agent</div>
        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Brain: </span>
            {n.llm_provider || "ollama"} / {n.llm_model || "llama3.1:8b"}
          </div>
          <div>
            <span style={{ color: "var(--text-secondary)" }}>Founded: </span>
            {new Date(n.created_at).toLocaleDateString()}
          </div>
          {n.agent_prompt && (
            <div style={{ marginTop: 8 }}>
              <span style={{ color: "var(--text-secondary)" }}>Directive: </span>
              <div style={{ marginTop: 4, padding: "8px 10px", background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", fontSize: "0.68rem", fontStyle: "italic", color: "var(--text-muted)", lineHeight: 1.5 }}>
                {n.agent_prompt.length > 300 ? n.agent_prompt.slice(0, 300) + "..." : n.agent_prompt}
              </div>
            </div>
          )}
          {!n.agent_prompt && (
            <div style={{ color: "var(--text-muted)", fontStyle: "italic", marginTop: 4 }}>
              Free-willed — no directives given
            </div>
          )}
        </div>
      </div>

      {/* Treaties */}
      {treaties.length > 0 && (
        <div>
          <div className="leaderboard-title">Treaties</div>
          {treaties.map((t) => (
            <div key={t.id} style={{ fontSize: "0.72rem", padding: "6px 0", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <span>{t.treaty_type.replace(/_/g, " ")} with nations {t.party_ids.filter((id) => id !== n.id).join(", ")}</span>
              <span className={`type-tag ${t.status === "active" ? "claim_announcement" : "statement"}`}>{t.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NationPosts({ posts, nationColor, nationName }: { posts: ForumPost[]; nationColor: string; nationName: string }) {
  if (posts.length === 0) {
    return <div className="empty"><div className="empty-text">No posts yet</div></div>;
  }

  return (
    <div>
      {posts.map((post) => (
        <div key={post.id} className="post">
          <div className="post-header">
            <span className={`type-tag ${post.post_type}`}>
              {post.post_type.replace(/_/g, " ")}
            </span>
            <span className="tick-label">T{post.tick_number}</span>
          </div>
          <div className="post-body">{post.content}</div>
          <div className="post-footer">
            <span>^ {post.upvotes}</span>
            <span>{new Date(post.created_at).toLocaleTimeString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function NationTerritories({ territories }: { territories: NationDetail["territories"] }) {
  if (territories.length === 0) {
    return <div className="empty"><div className="empty-text">No territories claimed</div></div>;
  }

  return (
    <div>
      {territories.map((t) => (
        <div key={t.id} style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700 }}>Territory #{t.id}</div>
            <span className="tick-label">Claimed T{t.claimed_tick}</span>
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 4 }}>
            {t.area_sq_km?.toFixed(1)} km²
          </div>
          {t.improvements && t.improvements.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {t.improvements.map((imp, i) => (
                <span key={i} style={{
                  fontSize: "0.6rem", padding: "2px 6px",
                  background: "var(--bg-elevated)", borderRadius: "var(--radius-sm)",
                  color: "var(--text-secondary)",
                }}>
                  {imp.type} L{imp.level}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      background: "var(--bg-primary)", borderRadius: "var(--radius-sm)",
      padding: "6px 8px",
    }}>
      <div style={{ fontSize: "0.5rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: "0.85rem", fontWeight: 800, fontFamily: "'Anonymous Pro', monospace", color, marginTop: 1 }}>{value}</div>
    </div>
  );
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div style={{ background: "var(--bg-primary)", borderRadius: "var(--radius-sm)", padding: "6px 8px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: "0.5rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
        <span style={{ fontSize: "0.6rem", fontFamily: "'Anonymous Pro', monospace", color }}>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 4, background: "var(--bg-elevated)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}
