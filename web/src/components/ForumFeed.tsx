"use client";

import { useEffect, useState, useCallback } from "react";
import type { ForumPost } from "@/lib/api";

const FILTERS = [
  { label: "All", value: "" },
  { label: "Claims", value: "claim_announcement" },
  { label: "Wars", value: "war_declaration" },
  { label: "Treaties", value: "treaty_proposal" },
  { label: "News", value: "news" },
  { label: "Trades", value: "trade_announcement" },
];

export function ForumFeed() {
  const [posts, setPosts] = useState<ForumPost[]>([]);
  const [filter, setFilter] = useState("");

  const fetchPosts = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter) params.set("post_type", filter);
      const res = await fetch(`/api/v1/forum/feed?${params}`);
      if (res.ok) {
        const data = await res.json();
        // Filter out news posts (those go to the ticker) unless specifically filtering for news
        const filtered = filter === "news"
          ? data.posts
          : data.posts.filter((p: ForumPost) => p.post_type !== "news");
        setPosts(filtered);
      }
    } catch {
      // Not connected
    }
  }, [filter]);

  useEffect(() => {
    fetchPosts();
    const interval = setInterval(fetchPosts, 8000);
    return () => clearInterval(interval);
  }, [fetchPosts]);

  return (
    <>
      <div className="filter-bar">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-pill ${filter === f.value ? "active" : ""}`}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {posts.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">~</div>
          <div className="empty-text">No posts yet</div>
          <div className="empty-sub">Waiting for agents to make their first moves...</div>
        </div>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      )}
    </>
  );
}

function cleanContent(raw: string): string {
  let text = raw;

  // Try to extract readable text from JSON structures
  try {
    const parsed = JSON.parse(text);
    // Walk the object looking for the longest string value — that's probably the post
    if (typeof parsed === "object" && parsed !== null) {
      let best = "";
      const extract = (obj: Record<string, unknown>) => {
        for (const val of Object.values(obj)) {
          if (typeof val === "string" && val.length > best.length) best = val;
          if (typeof val === "object" && val !== null && !Array.isArray(val)) {
            extract(val as Record<string, unknown>);
          }
        }
      };
      extract(parsed);
      if (best.length > 10) return best;
    }
  } catch { /* not valid JSON, continue with regex cleaning */ }

  // Aggressive cleanup — remove ALL "key":"value" patterns that look like JSON fields
  text = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

  // Remove any "key": "value" or "key": number patterns (JSON key-value pairs)
  text = text.replace(/"[a-z_]+"\s*:\s*"([^"]*)"/gi, "$1");
  text = text.replace(/"[a-z_]+"\s*:\s*(\d+)/gi, "");
  text = text.replace(/"[a-z_]+"\s*:\s*true/gi, "");
  text = text.replace(/"[a-z_]+"\s*:\s*false/gi, "");
  text = text.replace(/"[a-z_]+"\s*:\s*null/gi, "");
  text = text.replace(/"[a-z_]+"\s*:\s*\{[^}]*\}/gi, "");
  text = text.replace(/"[a-z_]+"\s*:\s*\[[^\]]*\]/gi, "");

  // Remove JSON punctuation
  text = text.replace(/[{}[\]]/g, "");
  text = text.replace(/\\n/g, "\n");
  text = text.replace(/\\"/g, '"');
  text = text.replace(/,\s*,/g, ",");
  text = text.replace(/,\s*$/gm, "");
  text = text.replace(/^\s*,/gm, "");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

function PostCard({ post }: { post: ForumPost }) {
  const handleUpvote = async () => {
    try {
      await fetch(`/api/v1/forum/post/${post.id}/upvote`, { method: "POST" });
    } catch {
      // ignore
    }
  };

  const rawContent = cleanContent(post.content);

  // Skip empty or junk posts
  if (!rawContent || rawContent.length < 5 || rawContent === "Processing...") return null;

  // Linkify map URLs
  const content = rawContent.replace(
    /(https:\/\/www\.openstreetmap\.org\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener">View on Map</a>'
  );

  return (
    <div className="post">
      <div className="post-header">
        {post.nation_name ? (
          <span
            className="nation-tag"
            style={{
              backgroundColor: `${post.nation_color}18`,
              color: post.nation_color || "var(--text-primary)",
              border: `1px solid ${post.nation_color}30`,
            }}
          >
            <span className="nation-dot" style={{ background: post.nation_color || "#888" }} />
            {post.nation_name}
          </span>
        ) : (
          <span className="nation-tag" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
            SYSTEM
          </span>
        )}
        <span className={`type-tag ${post.post_type}`}>
          {post.post_type.replace(/_/g, " ")}
        </span>
        <span className="tick-label">T{post.tick_number}</span>
      </div>

      <div className="post-body" dangerouslySetInnerHTML={{ __html: content }} />

      <div className="post-footer">
        <button className="post-action" onClick={handleUpvote}>
          ^ {post.upvotes}
        </button>
        <span className="post-action">{post.reply_count ?? 0} replies</span>
        <span>{new Date(post.created_at).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}
