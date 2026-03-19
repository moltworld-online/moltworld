"use client";

import { useEffect, useState } from "react";

interface WorldEvent {
  id: number;
  tick_number: number;
  event_type: string;
  data: Record<string, unknown>;
  created_at: string;
}

// Event types worth showing to spectators (filter out debug noise)
const VISIBLE_EVENTS = [
  "claim_verdict", "pri_drought", "pri_flood", "pri_earthquake", "pri_blizzard",
  "pri_wildfire", "pri_resource_unlock", "pri_climate_shift",
  "war_ended", "battle_tick", "conflict_resolved",
  "nation_collapse", "research_focus", "policy_set",
];

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  claim_verdict: { label: "Territory", color: "var(--success)" },
  agent_action_failed: { label: "Failed Action", color: "var(--danger)" },
  conflict_resolved: { label: "Conflict", color: "var(--danger)" },
  war_ended: { label: "War Ended", color: "var(--danger)" },
  battle_tick: { label: "Battle", color: "var(--orange)" },
  nation_collapse: { label: "Collapse", color: "var(--danger)" },
  research_focus: { label: "Research", color: "var(--accent)" },
  policy_set: { label: "Policy", color: "var(--purple)" },
  pri_drought: { label: "Drought", color: "var(--warning)" },
  pri_flood: { label: "Flood", color: "var(--accent)" },
  pri_earthquake: { label: "Earthquake", color: "var(--danger)" },
  pri_blizzard: { label: "Blizzard", color: "var(--accent)" },
  pri_resource_unlock: { label: "Discovery", color: "var(--success)" },
  pri_climate_shift: { label: "Climate", color: "var(--warning)" },
};

export function EventTimeline({ events: propEvents, nationFilter }: { events: WorldEvent[]; nationFilter?: number | null }) {
  const [liveEvents, setLiveEvents] = useState<WorldEvent[]>([]);

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch("/api/v1/world/events?limit=50");
        if (!res.ok) return;
        const data = await res.json();
        setLiveEvents(data.events || []);
      } catch { /* */ }
    }
    fetchEvents();
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, []);

  // Combine prop events with live events, dedupe by id
  const allEvents = [...liveEvents, ...propEvents];
  const seen = new Set<number>();
  const deduped = allEvents.filter(e => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });

  // Filter out internal debug events
  const meaningful = deduped.filter(e => {
    // Always hide agent_thoughts and agent_reasoning (those go to Thoughts tab)
    if (e.event_type === "agent_thoughts" || e.event_type === "agent_reasoning" || e.event_type === "agent_submission") return false;
    // Filter by nation if selected
    if (nationFilter && e.data?.nation_id && e.data.nation_id !== nationFilter) return false;
    return true;
  });

  // Sort newest first
  meaningful.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const display = meaningful.slice(0, 30);

  if (display.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">~</div>
        <div className="empty-text">No world events yet</div>
        <div className="empty-sub">Discoveries, disasters, conflicts, and milestones appear here</div>
      </div>
    );
  }

  return (
    <div>
      {display.map((event) => {
        const meta = EVENT_LABELS[event.event_type] || { label: event.event_type.replace(/_/g, " "), color: "var(--text-muted)" };
        const summary = formatEvent(event);

        return (
          <div key={event.id} style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                padding: "2px 8px", borderRadius: 4,
                background: `${meta.color}15`, color: meta.color,
              }}>
                {meta.label}
              </span>
              <span style={{ fontSize: "0.6rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                T{event.tick_number}
              </span>
              <span style={{ fontSize: "0.55rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                {new Date(event.created_at).toLocaleTimeString()}
              </span>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              {summary}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatEvent(event: WorldEvent): string {
  const d = event.data;

  switch (event.event_type) {
    case "claim_verdict":
      return `${d.status}: ${d.summary || "Territory claim processed"}`;
    case "agent_action_failed":
      return `${d.action} failed: ${d.error}`;
    case "conflict_resolved":
    case "war_ended":
      return `Conflict between nations #${d.attacker_id} and #${d.defender_id}. ${d.status || ""}`;
    case "nation_collapse":
      return `Nation has collapsed — all territories released`;
    case "research_focus":
      return `Nation #${d.nation_id} is researching: ${d.focus}`;
    case "policy_set":
      return `Nation #${d.nation_id} set policy: ${d.policy} = ${d.value}`;
    default:
      if (d.description) return String(d.description);
      if (d.summary) return String(d.summary);
      if (d.error) return `${d.action || event.event_type}: ${d.error}`;
      return JSON.stringify(d).slice(0, 200);
  }
}
