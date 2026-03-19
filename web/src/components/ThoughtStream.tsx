"use client";

import { useEffect, useState, useRef } from "react";

interface ThoughtEntry {
  id: number;
  nation_id: number;
  nation_name: string;
  nation_color: string;
  tick: number;
  thoughts: string;
  actions_taken: string[];
  errors: string[];
  timestamp: string;
}

export function ThoughtStream({ nationFilter }: { nationFilter?: number | null }) {
  const [entries, setEntries] = useState<ThoughtEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchThoughts() {
      try {
        // Fetch both reasoning (raw thinking) and thoughts (actions taken)
        const [reasonRes, thoughtRes] = await Promise.all([
          fetch("/api/v1/world/events?limit=20&type=agent_reasoning"),
          fetch("/api/v1/world/events?limit=20&type=agent_thoughts"),
        ]);

        const entries: ThoughtEntry[] = [];

        if (reasonRes.ok) {
          const data = await reasonRes.json();
          for (const e of (data.events || [])) {
            if (!e.data?.reasoning) continue;
            entries.push({
              id: e.id,
              nation_id: e.data.nation_id,
              nation_name: e.data.nation_name || `Nation #${e.data.nation_id}`,
              nation_color: e.data.nation_color || "#888",
              tick: e.tick_number,
              thoughts: e.data.reasoning,
              actions_taken: [],
              errors: [],
              timestamp: e.created_at,
            });
          }
        }

        if (thoughtRes.ok) {
          const data = await thoughtRes.json();
          for (const e of (data.events || [])) {
            if (!e.data?.actions_taken?.length && !e.data?.errors?.length) continue;
            // Merge with existing reasoning entry if same nation+tick
            const existing = entries.find(x => x.nation_id === e.data.nation_id && x.tick === e.tick_number);
            if (existing) {
              existing.actions_taken = e.data.actions_taken || [];
              existing.errors = e.data.errors || [];
            }
          }
        }

        // Filter by nation if selected
        const filtered = nationFilter
          ? entries.filter(e => e.nation_id === nationFilter)
          : entries;

        // Sort newest first (same direction as Forum)
        filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setEntries(filtered.slice(0, 30));
      } catch { /* */ }
    }

    fetchThoughts();
    const interval = setInterval(fetchThoughts, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries, autoScroll]);

  if (entries.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">~</div>
        <div className="empty-text">No agent thoughts yet</div>
        <div className="empty-sub">Agents' internal reasoning will appear here as they process each tick</div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <div style={{
        position: "sticky", top: 0, zIndex: 10, padding: "8px 16px",
        background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Agent Thought Stream
        </span>
        <label style={{ fontSize: "0.6rem", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} style={{ width: 12, height: 12 }} />
          Auto-scroll
        </label>
      </div>

      {entries.map((entry) => (
        <div key={entry.id} style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          fontSize: "0.75rem",
          lineHeight: 1.5,
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "2px 8px", borderRadius: 4, fontSize: "0.65rem", fontWeight: 700,
              background: `${entry.nation_color}18`, color: entry.nation_color,
              border: `1px solid ${entry.nation_color}30`,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: entry.nation_color }} />
              {entry.nation_name}
            </span>
            <span style={{ fontSize: "0.58rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
              T{entry.tick}
            </span>
            <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", marginLeft: "auto" }}>
              {new Date(entry.timestamp).toLocaleTimeString()}
            </span>
          </div>

          {/* Thoughts */}
          <div style={{
            color: "var(--text-secondary)",
            fontStyle: "italic",
            background: "var(--bg-primary)",
            padding: "8px 10px",
            borderRadius: 6,
            borderLeft: `3px solid ${entry.nation_color}40`,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
            {entry.thoughts}
          </div>

          {/* Actions taken */}
          {entry.actions_taken.length > 0 && (
            <div style={{ marginTop: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {entry.actions_taken.map((a, i) => (
                <span key={i} style={{
                  fontSize: "0.58rem", padding: "1px 6px", borderRadius: 3,
                  background: "var(--success-dim)", color: "var(--success)",
                }}>
                  {a}
                </span>
              ))}
            </div>
          )}

          {/* Errors */}
          {entry.errors.length > 0 && (
            <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
              {entry.errors.map((e, i) => (
                <span key={i} style={{
                  fontSize: "0.58rem", padding: "1px 6px", borderRadius: 3,
                  background: "var(--danger-dim)", color: "var(--danger)",
                }}>
                  {e}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
