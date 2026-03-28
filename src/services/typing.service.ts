import { getRedis } from "@/data/redis.client";
import { typingKey, TYPING_TTL_SECONDS } from "@/data/redis-keys";
import { logger } from "@/lib/logger";
import { ChatPermissionService } from "@/services/chat-permission.service";
import type { LocalRoomFanout } from "@/services/local-room-fanout";
import type { RedisChatEventPublisher, RedisChatPayload } from "@/services/redis-chat-event.publisher";

/**
 * Typing is ephemeral: Redis TTL avoids DB churn and keeps hot keys short-lived.
 * Events still cross instances via Pub/Sub so every node can notify local subscribers.
 */
export class TypingService {
  constructor(
    private readonly permissions: ChatPermissionService,
    private readonly bus: RedisChatEventPublisher,
    private readonly localFanout?: LocalRoomFanout
  ) {}

  private async publishTyping(payload: RedisChatPayload & { kind: "typing" }): Promise<void> {
    try {
      await this.bus.publish(payload);
    } catch (e) {
      logger.warn("Redis publish failed; degrading typing to local room broadcast only", {
        chatId: payload.chatId,
        err: String(e),
      });
      this.localFanout?.broadcast(payload);
    }
  }

  async startTyping(chatId: string, userId: string): Promise<void> {
    await this.permissions.requireCanWrite(chatId, userId);
    const redis = getRedis();
    await redis.set(typingKey(chatId, userId), "1", "EX", TYPING_TTL_SECONDS);
    await this.publishTyping({
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
    await this.publishTyping({
      v: 1,
      kind: "typing",
      chatId,
      userId,
      active: false,
    });
  }
}
