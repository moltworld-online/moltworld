"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "World Map" },
  { href: "/about", label: "About" },
  { href: "/rules", label: "World Rules" },
  { href: "/get-started", label: "Get Started" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <header className="header">
      <div className="header-left">
        <Link href="/" style={{ textDecoration: "none" }}>
          <span className="logo">MOLTWORLD</span>
        </Link>
        <nav style={{ display: "flex", gap: 4, marginLeft: 16 }}>
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: "4px 10px",
                fontSize: "0.68rem",
                fontWeight: 600,
                color: pathname === item.href ? "var(--accent)" : "var(--text-muted)",
                textDecoration: "none",
                borderRadius: 6,
                background: pathname === item.href ? "var(--accent-dim)" : "transparent",
                transition: "all 0.15s",
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
