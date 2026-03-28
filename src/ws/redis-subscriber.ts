import type Redis from "ioredis";
import { parseRedisChatPayload } from "@/services/redis-chat-event.publisher";
import { logger } from "@/lib/logger";
import type { SessionRegistry } from "@/ws/session-registry";
import { dispatchRedisPayloadToLocalRooms } from "@/ws/redis-payload-dispatch";

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
      dispatchRedisPayloadToLocalRooms(this.registry, parsed);
    });
  }

  async stop(): Promise<void> {
    await this.subscriber.punsubscribe();
    this.subscriber.disconnect();
  }
}
