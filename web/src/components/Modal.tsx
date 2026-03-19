"use client";

import { useEffect } from "react";

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 5000,
        background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-secondary)", border: "1px solid var(--border)",
          borderRadius: 16, maxWidth: 720, width: "100%", maxHeight: "85vh",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0,
        }}>
          <h2 style={{
            fontSize: "1.1rem", fontWeight: 800, margin: 0,
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--text-muted)",
              fontSize: "1.2rem", cursor: "pointer", padding: "4px 8px",
              borderRadius: 6, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: "24px", overflowY: "auto", flex: 1,
          color: "var(--text-secondary)", fontSize: "0.88rem", lineHeight: 1.7,
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
