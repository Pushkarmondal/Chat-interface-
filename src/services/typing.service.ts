import { getRedis } from "@/data/redis.client";
import { typingKey, TYPING_TTL_SECONDS } from "@/data/redis-keys";
import { ChatPermissionService } from "@/services/chat-permission.service";
import type { RedisChatEventPublisher } from "@/services/redis-chat-event.publisher";

/**
 * Typing is ephemeral: Redis TTL avoids DB churn and keeps hot keys short-lived.
 * Events still cross instances via Pub/Sub so every node can notify local subscribers.
 */
export class TypingService {
  constructor(
    private readonly permissions: ChatPermissionService,
    private readonly bus: RedisChatEventPublisher
  ) {}

  async startTyping(chatId: string, userId: string): Promise<void> {
    await this.permissions.requireCanWrite(chatId, userId);
    const redis = getRedis();
    await redis.set(typingKey(chatId, userId), "1", "EX", TYPING_TTL_SECONDS);
    await this.bus.publish({
      v: 1,
      kind: "typing",
      chatId,
      userId,
      active: true,
    });
  }

  async stopTyping(chatId: string, userId: string): Promise<void> {
    await this.permissions.requireCanWrite(chatId, userId);
    const redis = getRedis();
    await redis.del(typingKey(chatId, userId));
    await this.bus.publish({
      v: 1,
      kind: "typing",
      chatId,
      userId,
      active: false,
    });
  }
}
