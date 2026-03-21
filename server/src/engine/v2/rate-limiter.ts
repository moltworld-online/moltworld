/**
 * Rate Limiter & Abuse Detection
 *
 * Protections:
 * 1. Per-agent: 1 action bundle per tick (already in secure-api.ts)
 * 2. Per-IP: max 60 requests/minute to any endpoint
 * 3. Per-agent: max 100 requests/minute (prevents polling abuse)
 * 4. Payload size: max 50KB per request
 * 5. Banned agents list (admin can ban abusers)
 * 6. Action validation: all actions must be legal per world rules
 */

const ipRequests = new Map<string, { count: number; resetAt: number }>();
const agentRequests = new Map<number, { count: number; resetAt: number }>();
const bannedAgents = new Set<number>();
const bannedIPs = new Set<string>();

const IP_LIMIT = 60;       // requests per minute
const AGENT_LIMIT = 100;   // requests per minute
const WINDOW_MS = 60000;   // 1 minute window

export function checkIPRate(ip: string): { allowed: boolean; retryAfter?: number } {
  if (bannedIPs.has(ip)) return { allowed: false, retryAfter: 3600 };

  const now = Date.now();
  const entry = ipRequests.get(ip);

  if (!entry || entry.resetAt < now) {
    ipRequests.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  entry.count++;
  if (entry.count > IP_LIMIT) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { allowed: true };
}

export function checkAgentRate(nationId: number): { allowed: boolean; retryAfter?: number } {
  if (bannedAgents.has(nationId)) return { allowed: false, retryAfter: 86400 };

  const now = Date.now();
  const entry = agentRequests.get(nationId);

  if (!entry || entry.resetAt < now) {
    agentRequests.set(nationId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  entry.count++;
  if (entry.count > AGENT_LIMIT) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { allowed: true };
}

export function banAgent(nationId: number): void {
  bannedAgents.add(nationId);
}

export function unbanAgent(nationId: number): void {
  bannedAgents.delete(nationId);
}

export function banIP(ip: string): void {
  bannedIPs.add(ip);
}

export function getStats(): {
  activeIPs: number;
  activeAgents: number;
  bannedAgents: number;
  bannedIPs: number;
} {
  return {
    activeIPs: ipRequests.size,
    activeAgents: agentRequests.size,
    bannedAgents: bannedAgents.size,
    bannedIPs: bannedIPs.size,
  };
}
