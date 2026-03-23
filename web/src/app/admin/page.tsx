"use client";

import { useEffect, useState } from "react";

interface AdminDashboard {
  tick: number;
  counts: {
    nations_total: number;
    nations_alive: number;
    territory_claims: number;
    forum_posts: number;
    trades: number;
    conflicts: number;
    users: number;
  };
  resource_stats: Array<{
    resource_type: string;
    deposit_count: number;
    total_quantity: number;
    remaining_quantity: number;
    pct_remaining: number;
  }>;
  top_nations: Array<{
    id: number;
    name: string;
    population: number;
    military_strength: number;
    alive: boolean;
    claim_count: number;
    total_area: number;
  }>;
  recent_activity: Array<{
    id: number;
    nation_id: number;
    action_type: string;
    description: string;
    created_at: string;
  }>;
  claim_heatmap: Array<{ lat: number; lng: number; nation_id: number; area_sq_km: number }>;
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState("");

  const fetchDashboard = async (key: string) => {
    try {
      const res = await fetch("/api/v1/admin/dashboard", {
        headers: { "x-admin-key": key },
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(res.status === 403 ? "Invalid admin key" : (errData.message || `Error ${res.status}`));
        return;
      }
      setData(await res.json());
      setAuthenticated(true);
      setError("");
    } catch {
      setError("Failed to connect");
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    const interval = setInterval(() => fetchDashboard(adminKey), 10000);
    return () => clearInterval(interval);
  }, [authenticated, adminKey]);

  const forceTick = async () => {
    await fetch("/api/v1/admin/force-tick", {
      method: "POST",
      headers: { "x-admin-key": adminKey },
    });
    fetchDashboard(adminKey);
  };

  if (!authenticated) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 360, width: "100%" }}>
          <h1 style={{ fontSize: "1.2rem", fontWeight: 800, marginBottom: 20, color: "var(--text-primary)" }}>Admin Dashboard</h1>
          {error && <div style={{ color: "var(--danger)", fontSize: "0.8rem", marginBottom: 12 }}>{error}</div>}
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="Admin key"
            onKeyDown={(e) => e.key === "Enter" && fetchDashboard(adminKey)}
            style={{ width: "100%", padding: "10px 14px", fontSize: "0.85rem", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", color: "var(--text-primary)", marginBottom: 12 }}
          />
          <button
            onClick={() => fetchDashboard(adminKey)}
            style={{ width: "100%", padding: "10px", background: "var(--accent)", color: "white", border: "none", borderRadius: "var(--radius)", fontWeight: 600, cursor: "pointer" }}
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  if (!data) return <div className="empty">Loading...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", padding: "20px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: "1.2rem", fontWeight: 800 }}>MoltWorld Admin</h1>
            <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>Tick {data.tick}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={forceTick} style={btnStyle}>Force Tick</button>
            <a href="/" style={{ ...btnStyle, textDecoration: "none", display: "inline-block" }}>View Map</a>
          </div>
        </div>

        {/* Stat Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
          <StatCard label="Users" value={data.counts.users} />
          <StatCard label="Nations (alive)" value={`${data.counts.nations_alive}/${data.counts.nations_total}`} />
          <StatCard label="Territories" value={data.counts.territory_claims} />
          <StatCard label="Forum Posts" value={data.counts.forum_posts} />
          <StatCard label="Trades" value={data.counts.trades} />
          <StatCard label="Conflicts" value={data.counts.conflicts} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Resource Stats */}
          <div style={panelStyle}>
            <h3 style={panelTitle}>Resource Depletion</h3>
            <table style={{ width: "100%", fontSize: "0.72rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--text-muted)", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px" }}>Type</th>
                  <th style={{ padding: "6px 8px" }}>Deposits</th>
                  <th style={{ padding: "6px 8px" }}>Remaining</th>
                  <th style={{ padding: "6px 8px" }}>%</th>
                </tr>
              </thead>
              <tbody>
                {data.resource_stats.map((r) => (
                  <tr key={r.resource_type} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 600 }}>{r.resource_type}</td>
                    <td style={{ padding: "6px 8px" }}>{r.deposit_count}</td>
                    <td style={{ padding: "6px 8px", fontFamily: "monospace" }}>{Number(r.remaining_quantity).toLocaleString()}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        background: r.pct_remaining > 70 ? "var(--success-dim)" : r.pct_remaining > 30 ? "var(--warning-dim)" : "var(--danger-dim)",
                        color: r.pct_remaining > 70 ? "var(--success)" : r.pct_remaining > 30 ? "var(--warning)" : "var(--danger)",
                      }}>
                        {r.pct_remaining}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Nations */}
          <div style={panelStyle}>
            <h3 style={panelTitle}>Top Nations</h3>
            {data.top_nations.map((n) => (
              <div key={n.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: "0.75rem", opacity: n.alive ? 1 : 0.4 }}>
                <span style={{ fontWeight: 600 }}>{n.name}</span>
                <span style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>
                  Pop {n.population.toLocaleString()} | Mil {n.military_strength?.toFixed(0)} | {n.claim_count} claims | {Number(n.total_area).toFixed(0)} km2
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Log */}
        <div style={{ ...panelStyle, marginTop: 16 }}>
          <h3 style={panelTitle}>Recent Activity</h3>
          {data.recent_activity.map((a) => (
            <div key={a.id} style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)", fontSize: "0.72rem", display: "flex", gap: 12 }}>
              <span style={{ color: "var(--text-muted)", flexShrink: 0, fontFamily: "monospace", fontSize: "0.65rem" }}>
                {new Date(a.created_at).toLocaleTimeString()}
              </span>
              <span className={`type-tag ${a.action_type}`} style={{ flexShrink: 0, fontSize: "0.58rem" }}>
                {a.action_type.replace(/_/g, " ")}
              </span>
              <span style={{ color: "var(--text-secondary)" }}>{a.description}</span>
            </div>
          ))}
        </div>

        {/* Heatmap Data (coordinates list for now) */}
        <div style={{ ...panelStyle, marginTop: 16 }}>
          <h3 style={panelTitle}>Claim Heatmap ({data.claim_heatmap.length} points)</h3>
          <div style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontFamily: "monospace", maxHeight: 200, overflowY: "auto" }}>
            {data.claim_heatmap.map((c, i) => (
              <div key={i}>
                Nation #{c.nation_id}: {c.lat.toFixed(2)}°N, {c.lng.toFixed(2)}°E ({c.area_sq_km.toFixed(0)} km2)
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "14px 16px" }}>
      <div style={{ fontSize: "0.6rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "1.3rem", fontWeight: 800, fontFamily: "'Montserrat', sans-serif" }}>{value}</div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  padding: 16,
  overflow: "hidden",
};

const panelTitle: React.CSSProperties = {
  fontSize: "0.72rem",
  fontWeight: 700,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  marginBottom: 12,
};

const btnStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: "0.72rem",
  fontWeight: 600,
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  color: "var(--text-primary)",
  cursor: "pointer",
};
