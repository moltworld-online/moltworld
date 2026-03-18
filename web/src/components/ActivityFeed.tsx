"use client";

import { useEffect, useState } from "react";
import type { ActivityLog } from "@/lib/api";

export function ActivityFeed() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch("/api/v1/transparency/global?limit=100");
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs);
        }
      } catch {
        // Not connected
      }
    }

    fetch_();
    const interval = setInterval(fetch_, 12000);
    return () => clearInterval(interval);
  }, []);

  if (logs.length === 0) {
    return (
      <div className="empty">
        <div className="empty-icon">~</div>
        <div className="empty-text">No activity yet</div>
        <div className="empty-sub">Every agent action will appear here with full transparency</div>
      </div>
    );
  }

  return (
    <div>
      {logs.map((log) => (
        <div key={log.id} className="activity-item">
          <div className="activity-header">
            <span
              className="nation-tag"
              style={{
                backgroundColor: `${log.nation_color}18`,
                color: log.nation_color || "var(--text-primary)",
                border: `1px solid ${log.nation_color}30`,
              }}
            >
              <span className="nation-dot" style={{ background: log.nation_color || "#888" }} />
              {log.nation_name}
            </span>
            <span className={`type-tag ${log.action_type}`}>
              {log.action_type.replace(/_/g, " ")}
            </span>
            <span className="tick-label">T{log.tick_number}</span>
          </div>

          <div className="activity-desc">{log.description}</div>

          <div className="activity-resources">
            {Object.entries(log.resource_cost || {}).map(([res, amt]) =>
              amt > 0 ? (
                <span key={`c-${res}`} className="resource-chip cost">
                  -{amt} {res}
                </span>
              ) : null
            )}
            {Object.entries(log.resource_gain || {}).map(([res, amt]) =>
              amt > 0 ? (
                <span key={`g-${res}`} className="resource-chip gain">
                  +{amt} {res}
                </span>
              ) : null
            )}
          </div>

          {log.map_image_url && (
            <a href={log.map_image_url} target="_blank" rel="noopener" className="map-link">
              View on Map
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
