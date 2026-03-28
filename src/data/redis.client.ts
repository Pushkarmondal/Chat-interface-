import Redis from "ioredis";
import { getEnv } from "@/config/env";
import { logger } from "@/lib/logger";

let commandClient: Redis | null = null;

export function getRedis(): Redis {
  if (!commandClient) {
    commandClient = new Redis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        logger.warn("Redis retry", { times, delay });
        return delay;
      },
    });
    commandClient.on("error", (err) => logger.error("Redis command client error", { err: String(err) }));
  }
  return commandClient;
}
