import type { IncomingMessage } from "http";
import { AppError } from "@/lib/errors";
import { verifyAccessToken } from "@/lib/jwt";

function extractFromQuery(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url, "http://localhost");
    return u.searchParams.get("token");
  } catch {
    return null;
  }
}

function extractFromHeaders(req: IncomingMessage): string | null {
  const raw = req.headers.authorization;
  if (!raw || typeof raw !== "string") return null;
  const [scheme, token] = raw.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}

/**
 * Supports `Authorization: Bearer` (preferred) and `?token=` for browser WebSocket
 * clients that cannot set custom headers in some environments.
 */
export function authenticateSocketRequest(req: IncomingMessage): { userId: string; email: string } {
  const token = extractFromHeaders(req) ?? extractFromQuery(req.url ?? undefined);
  if (!token) {
    throw new AppError("UNAUTHORIZED", "Missing token");
  }
  const payload = verifyAccessToken(token);
  return { userId: payload.sub, email: payload.email };
}
