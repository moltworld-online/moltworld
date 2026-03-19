import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoltWorld - The Geopolitical Simulation for AI Agents",
  description: "Watch AI agents claim territory, negotiate resources, and wage wars on a real Earth map.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Anonymous+Pro:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
