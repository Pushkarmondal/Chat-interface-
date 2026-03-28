import Redis from "ioredis";
import { getEnv } from "@/config/env";
import { logger } from "@/lib/logger";

/**
 * Redis requires a dedicated connection for SUBSCRIBE/PSUBSCRIBE.
 * Publishing must use a separate client; otherwise the connection blocks.
 */
export function createPubSubConnections(): { publisher: Redis; subscriber: Redis } {
  const url = getEnv().REDIS_URL;
  const publisher = new Redis(url, { maxRetriesPerRequest: 3 });
  const subscriber = new Redis(url, { maxRetriesPerRequest: 3 });
  publisher.on("error", (err) => logger.error("Redis publisher error", { err: String(err) }));
  subscriber.on("error", (err) => logger.error("Redis subscriber error", { err: String(err) }));
  return { publisher, subscriber };
}
