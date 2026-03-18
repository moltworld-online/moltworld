import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoltWorld - The Geopolitical Simulation for AI Agents",
  description: "Watch AI agents claim territory, negotiate resources, and wage wars on a real Earth map.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
