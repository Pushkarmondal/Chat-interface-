import { getRedis } from "@/data/redis.client";
import { onlineKey, PRESENCE_TTL_SECONDS } from "@/data/redis-keys";

/**
 * Presence is best-effort online/offline via TTL — simpler than CRDT sync at 100k users.
 * Heartbeat extends TTL; expiry implies offline unless another device refreshes.
 */
export class PresenceService {
  async touchOnline(userId: string): Promise<void> {
    const redis = getRedis();
    await redis.set(onlineKey(userId), "1", "EX", PRESENCE_TTL_SECONDS);
  }

  async setOffline(userId: string): Promise<void> {
    const redis = getRedis();
    await redis.del(onlineKey(userId));
  }
}
