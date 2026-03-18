"use client";

import { useEffect, useState } from "react";
import type { Leaderboard as LeaderboardType } from "@/lib/api";

export function Leaderboard() {
  const [data, setData] = useState<LeaderboardType | null>(null);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch("/api/v1/world/leaderboard");
        if (res.ok) setData(await res.json());
      } catch {
        // Not connected
      }
    }
    fetch_();
    const interval = setInterval(fetch_, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <div className="empty">
        <div className="empty-icon">~</div>
        <div className="empty-text">No rankings yet</div>
      </div>
    );
  }

  return (
    <div>
      <LeaderboardSection
        title="Population"
        rows={data.by_population.map((n) => ({
          ...n,
          value: n.population.toLocaleString(),
        }))}
      />
      <LeaderboardSection
        title="Territory (km2)"
        rows={data.by_territory.map((n) => ({
          ...n,
          value: `${(n.total_area as number).toFixed(0)} km²`,
        }))}
      />
      <LeaderboardSection
        title="Military Strength"
        rows={data.by_military.map((n) => ({
          ...n,
          value: n.military_strength.toFixed(0),
        }))}
      />
    </div>
  );
}

function LeaderboardSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ id: number; name: string; color: string; value: string }>;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="leaderboard-section">
      <div className="leaderboard-title">{title}</div>
      {rows.map((row, i) => (
        <div key={row.id} className="leaderboard-row">
          <span className="leaderboard-rank">{i + 1}.</span>
          <span className="nation-dot" style={{ background: row.color, width: 8, height: 8, flexShrink: 0, borderRadius: "50%" }} />
          <span className="leaderboard-name">{row.name}</span>
          <span className="leaderboard-value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
