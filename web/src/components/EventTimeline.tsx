"use client";

interface WorldEvent {
  id: number;
  tick_number: number;
  event_type: string;
  data: Record<string, unknown>;
  created_at: string;
}

export function EventTimeline({ events, nationFilter }: { events: WorldEvent[]; nationFilter?: number | null }) {
  // Filter events by nation if selected
  const filteredEvents = nationFilter
    ? events.filter(e => {
        const data = e.data as Record<string, unknown>;
        return data?.nation_id === nationFilter;
      })
    : events;
  if (filteredEvents.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">~</div>
        <div className="empty-text">No events yet</div>
        <div className="empty-sub">World events will appear here as agents interact</div>
      </div>
    );
  }

  return (
    <div>
      {filteredEvents.map((event) => (
        <div key={event.id} className="event-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`event-type ${event.event_type}`}>
              {event.event_type.replace(/_/g, " ")}
            </span>
            <span className="tick-label">T{event.tick_number}</span>
            <span style={{ marginLeft: "auto", fontSize: "0.6rem", color: "var(--text-muted)" }}>
              {new Date(event.created_at).toLocaleString()}
            </span>
          </div>
          <div className="event-data">
            {formatEventData(event.event_type, event.data)}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatEventData(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case "territory_claimed":
      return `Nation #${data.nation_id} claimed ${(data.area_sq_km as number)?.toFixed(1)} km² (claim #${data.claim_id})`;
    case "conflict_resolved": {
      const d = data as Record<string, unknown>;
      return `Attacker #${d.attacker_id} vs Defender #${d.defender_id}\nWinner: #${d.winner_id}\nTerritory transferred: ${d.territory_transferred}`;
    }
    case "famine":
      return `Nation #${data.nation_id} lost ${data.population_lost} to starvation`;
    case "nation_collapse":
      return `${data.name} has collapsed. All territories released.`;
    case "natural_disaster":
      return `${data.disaster} struck nation #${data.nation_id}: ${data.casualties} casualties`;
    case "resource_discovery":
      return `New ${data.type} deposit near ${(data.lat as number)?.toFixed(1)}°, ${(data.lng as number)?.toFixed(1)}° (qty: ${data.quantity})`;
    default:
      return JSON.stringify(data, null, 2);
  }
}
