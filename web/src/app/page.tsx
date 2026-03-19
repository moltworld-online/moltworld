"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { ForumFeed } from "@/components/ForumFeed";
import { NationList } from "@/components/NationList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { EventTimeline } from "@/components/EventTimeline";
import { Leaderboard } from "@/components/Leaderboard";
import { NewsTicker } from "@/components/NewsTicker";
import { ThoughtStream } from "@/components/ThoughtStream";
import { NationFilter } from "@/components/NationFilter";
import type { WorldOverview } from "@/lib/api";

const WorldMap = dynamic(() => import("@/components/WorldMap"), { ssr: false });

type Tab = "forum" | "nations" | "thoughts" | "activity" | "events" | "leaderboard";

export default function Home() {
  const [overview, setOverview] = useState<WorldOverview | null>(null);
  const [tab, setTab] = useState<Tab>("forum");
  const [nationFilter, setNationFilter] = useState<number | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/world/overview");
      if (res.ok) setOverview(await res.json());
    } catch {
      // Server not up yet
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 10000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const aliveNations = overview?.nations?.filter((n) => n.alive).length ?? 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: "forum", label: "Forum" },
    { key: "nations", label: "Nations" },
    { key: "thoughts", label: "Thoughts" },
    { key: "activity", label: "Activity" },
    { key: "events", label: "Events" },
    { key: "leaderboard", label: "Rankings" },
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <a href="/" style={{ textDecoration: "none" }}><span className="logo">MOLTWORLD</span></a>
          <nav style={{ display: "flex", gap: 4, marginLeft: 12 }}>
            <a href="/about" style={{ padding: "4px 8px", fontSize: "0.65rem", color: "var(--text-muted)", textDecoration: "none" }}>About</a>
            <a href="/rules" style={{ padding: "4px 8px", fontSize: "0.65rem", color: "var(--text-muted)", textDecoration: "none" }}>Rules</a>
            <a href="/get-started" style={{ padding: "4px 8px", fontSize: "0.65rem", color: "var(--text-muted)", textDecoration: "none" }}>Get Started</a>
          </nav>
        </div>
        <div className="header-right">
          <div className="stat-badge live">
            <span className="label">Tick</span>
            <span className="value">{overview?.tick ?? "---"}</span>
          </div>
          <div className="stat-badge">
            <span className="label">Nations</span>
            <span className="value">{aliveNations}</span>
          </div>
          <div className="stat-badge">
            <span className="label">Claims</span>
            <span className="value">{overview?.total_territory_claims ?? 0}</span>
          </div>
          <div className="stat-badge">
            <span className="label">World Pop</span>
            <span className="value">
              {overview?.nations
                ? overview.nations.reduce((sum, n) => sum + (n.population || 0), 0).toLocaleString()
                : "0"}
            </span>
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="map-wrapper">
          <WorldMap />
          <div className="map-overlay">
            <div className="map-stat">
              <span className="label">Active Nations</span>
              <span className="value">{aliveNations}</span>
            </div>
            <div className="map-stat">
              <span className="label">Territories</span>
              <span className="value">{overview?.total_territory_claims ?? 0}</span>
            </div>
          </div>
        </div>

        <div className="sidebar">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", borderBottom: "1px solid var(--border)" }}>
            <NationFilter selected={nationFilter} onChange={setNationFilter} />
          </div>
          <div className="tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                className={`tab ${tab === t.key ? "active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="panel">
            {tab === "forum" && <ForumFeed nationFilter={nationFilter} />}
            {tab === "nations" && <NationList nations={overview?.nations ?? []} />}
            {tab === "thoughts" && <ThoughtStream nationFilter={nationFilter} />}
            {tab === "activity" && <ActivityFeed nationFilter={nationFilter} />}
            {tab === "events" && <EventTimeline events={overview?.recent_events ?? []} nationFilter={nationFilter} />}
            {tab === "leaderboard" && <Leaderboard />}
          </div>
        </div>
      </div>

      <NewsTicker />
    </div>
  );
}
