import type Redis from "ioredis";
import {
  parseRedisChatPayload,
  type RedisChatPayload,
} from "@/services/redis-chat-event.publisher";
import { logger } from "@/lib/logger";
import type { SessionRegistry } from "@/ws/session-registry";
/**
 * Subscribes to `chat:*` once per process. Parsing failures are logged — never swallowed silently.
 */
export class RedisChatSubscriber {
  constructor(
    private readonly subscriber: Redis,
    private readonly registry: SessionRegistry
  ) {}

  async start(): Promise<void> {
    await this.subscriber.psubscribe("chat:*");
    this.subscriber.on("pmessage", (_pattern, channel, message) => {
      const parsed = parseRedisChatPayload(message);
      if (!parsed) {
        logger.warn("Dropped malformed Redis payload", { channel });
        return;
      }
      const expectedChatId = channel.replace(/^chat:/, "");
      if (parsed.chatId !== expectedChatId) {
        logger.warn("Channel/chatId mismatch", { channel, chatId: parsed.chatId });
      }
      this.dispatchToLocalSockets(parsed);
    });
  }

  private dispatchToLocalSockets(payload: RedisChatPayload): void {
    switch (payload.kind) {
      case "message_new":
        this.registry.broadcastToChatIncludeSender(payload.chatId, {
          type: "message",
          message: payload.message,
        });
        break;
      case "typing":
        this.registry.broadcastToChatIncludeSender(payload.chatId, {
          type: "typing",
          chatId: payload.chatId,
          userId: payload.userId,
          active: payload.active,
        });
        break;
      case "messages_read":
        this.registry.broadcastToChatIncludeSender(payload.chatId, {
          type: "messages_read",
          chatId: payload.chatId,
          userId: payload.userId,
          messageIds: payload.messageIds,
          readAt: payload.readAt,
        });
        break;
      default:
        break;
    }
  }

  async stop(): Promise<void> {
    await this.subscriber.punsubscribe();
    this.subscriber.disconnect();
  }
}
