import jwt from "jsonwebtoken";
import { getEnv } from "@/config/env";
import { AppError } from "@/lib/errors";

export interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

export function signAccessToken(userId: string, email: string, ttlSeconds = 3600): string {
  const secret = getEnv().JWT_SECRET;
  return jwt.sign({ sub: userId, email }, secret, { expiresIn: ttlSeconds });
}

export function verifyAccessToken(token: string): JwtPayload {
  try {
    const decoded = jwt.verify(token, getEnv().JWT_SECRET);
    if (typeof decoded !== "object" || decoded === null) {
      throw new AppError("UNAUTHORIZED", "Invalid token payload");
    }
    const sub = "sub" in decoded ? decoded.sub : undefined;
    const email = "email" in decoded ? decoded.email : undefined;
    if (typeof sub !== "string" || typeof email !== "string") {
      throw new AppError("UNAUTHORIZED", "Invalid token claims");
    }
    return { sub, email, iat: decoded.iat, exp: decoded.exp };
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("UNAUTHORIZED", "Token verification failed");
  }
}
