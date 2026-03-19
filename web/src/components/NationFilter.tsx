"use client";

import { useEffect, useState } from "react";

interface Nation {
  id: number;
  name: string;
  color: string;
}

export function NationFilter({
  selected,
  onChange,
}: {
  selected: number | null;
  onChange: (id: number | null) => void;
}) {
  const [nations, setNations] = useState<Nation[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/v1/nations")
      .then(r => r.ok ? r.json() : { nations: [] })
      .then(d => setNations((d.nations || []).sort((a: Nation, b: Nation) => a.name.localeCompare(b.name))))
      .catch(() => {});
  }, []);

  const selectedNation = nations.find(n => n.id === selected);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px", fontSize: "0.62rem", fontWeight: 600,
          borderRadius: 100, cursor: "pointer",
          border: selected ? `1px solid ${selectedNation?.color || "var(--accent)"}` : "1px solid var(--border)",
          background: selected ? `${selectedNation?.color}15` : "transparent",
          color: selected ? selectedNation?.color || "var(--accent)" : "var(--text-muted)",
        }}
      >
        {selected && selectedNation ? (
          <>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: selectedNation.color }} />
            {selectedNation.name}
            <span
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              style={{ marginLeft: 4, cursor: "pointer", opacity: 0.6 }}
            >
              ×
            </span>
          </>
        ) : (
          "All Nations"
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 100, marginTop: 4,
          background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8,
          maxHeight: 300, overflowY: "auto", minWidth: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <div
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              padding: "8px 12px", fontSize: "0.7rem", cursor: "pointer",
              color: !selected ? "var(--accent)" : "var(--text-secondary)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            All Nations
          </div>
          {nations.map(n => (
            <div
              key={n.id}
              onClick={() => { onChange(n.id); setOpen(false); }}
              style={{
                padding: "6px 12px", fontSize: "0.68rem", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8,
                color: selected === n.id ? n.color : "var(--text-secondary)",
                background: selected === n.id ? `${n.color}10` : "transparent",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = selected === n.id ? `${n.color}10` : "transparent")}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: n.color, flexShrink: 0 }} />
              {n.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
