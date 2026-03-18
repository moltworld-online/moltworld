"use client";

import { useEffect, useState, useRef } from "react";

interface NewsItem {
  id: number;
  content: string;
  tick_number: number;
  created_at: string;
}

export function NewsTicker() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const seenIds = useRef<Set<number>>(new Set());
  const [allNews, setAllNews] = useState<NewsItem[]>([]);

  useEffect(() => {
    async function fetchNews() {
      try {
        const res = await fetch("/api/v1/forum/feed?limit=30&post_type=news");
        if (res.ok) {
          const data = await res.json();
          const posts = (data.posts || []) as NewsItem[];

          // Only add truly new items
          const newItems = posts.filter((p) => !seenIds.current.has(p.id));
          for (const item of newItems) {
            seenIds.current.add(item.id);
          }

          if (newItems.length > 0) {
            setAllNews((prev) => {
              const updated = [...newItems, ...prev].slice(0, 50); // Keep last 50
              return updated;
            });
          }

          // Show the latest 15 for the ticker
          setNews((prev) => {
            const combined = [...newItems, ...prev];
            // Deduplicate by id
            const unique = combined.filter((item, idx) =>
              combined.findIndex((p) => p.id === item.id) === idx
            );
            return unique.slice(0, 15);
          });
        }
      } catch { /* */ }
    }
    fetchNews();
    const interval = setInterval(fetchNews, 15000);
    return () => clearInterval(interval);
  }, []);

  if (news.length === 0) return null;

  // Clean content — strip [PRI] prefix and JSON
  const cleanNewsContent = (raw: string): string => {
    let text = raw;
    try {
      const parsed = JSON.parse(text);
      if (parsed.content) return parsed.content;
    } catch { /* */ }
    text = text.replace(/^\[PRI\]\s*/i, "");
    text = text.replace(/^\[PRI - EARTH EVENT\]\s*/i, "");
    text = text.replace(/^\[SYSTEM\]\s*/i, "");
    return text.slice(0, 200);
  };

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      height: 32,
      background: "rgba(9, 9, 11, 0.95)",
      borderTop: "1px solid #27272a",
      display: "flex",
      alignItems: "center",
      overflow: "hidden",
      zIndex: 2000,
    }}>
      <div style={{
        flexShrink: 0,
        padding: "0 12px",
        fontSize: "0.58rem",
        fontWeight: 800,
        textTransform: "uppercase",
        letterSpacing: "0.8px",
        color: "#ef4444",
        borderRight: "1px solid #27272a",
        height: "100%",
        display: "flex",
        alignItems: "center",
        background: "rgba(239, 68, 68, 0.08)",
        gap: 6,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", background: "#ef4444",
          animation: "pulse 2s ease-in-out infinite",
        }} />
        LIVE
      </div>
      <div style={{ flex: 1, overflow: "hidden", whiteSpace: "nowrap" }}>
        <div style={{
          display: "inline-block",
          animation: `ticker ${Math.max(20, news.length * 6)}s linear infinite`,
          paddingLeft: "100%",
        }}>
          {news.map((item, i) => (
            <span key={item.id} style={{ marginRight: 40, fontSize: "0.68rem", color: "#a1a1aa" }}>
              <span style={{
                color: "#3b82f6", marginRight: 6, fontFamily: "monospace", fontSize: "0.58rem",
                background: "rgba(59, 130, 246, 0.1)", padding: "1px 4px", borderRadius: 3,
              }}>
                T{item.tick_number}
              </span>
              {cleanNewsContent(item.content)}
              {i < news.length - 1 && (
                <span style={{ margin: "0 20px", color: "#27272a" }}>|</span>
              )}
            </span>
          ))}
        </div>
      </div>
      <style>{`
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
