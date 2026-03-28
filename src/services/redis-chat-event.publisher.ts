import type Redis from "ioredis";
import { chatChannel } from "@/data/redis-keys";
import type { MessageDTO } from "@/types/domain";

export const REDIS_EVENT_VERSION = 1 as const;

/**
 * Fan-out contract for horizontal scale: every app instance subscribes to the same
 * channels and forwards only to local sockets. No in-memory room sync across nodes.
 *
 * Tradeoff: PSUBSCRIBE chat:* receives all chat traffic on every node — acceptable
 * through ~low thousands of chats per region; beyond that, shard channels or use a
 * dedicated fan-out tier / Redis Streams consumer group.
 */
export type RedisChatPayload =
  | {
      v: typeof REDIS_EVENT_VERSION;
      kind: "message_new";
      chatId: string;
      message: MessageDTO;
    }
  | {
      v: typeof REDIS_EVENT_VERSION;
      kind: "typing";
      chatId: string;
      userId: string;
      active: boolean;
    }
  | {
      v: typeof REDIS_EVENT_VERSION;
      kind: "messages_read";
      chatId: string;
      userId: string;
      messageIds: string[];
      readAt: string;
    };

export class RedisChatEventPublisher {
  constructor(private readonly publisher: Redis) {}

  async publish(payload: RedisChatPayload): Promise<void> {
    const channel = chatChannel(payload.chatId);
    await this.publisher.publish(channel, JSON.stringify(payload));
  }
}

export function parseRedisChatPayload(raw: string): RedisChatPayload | null {
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || !("v" in data) || data.v !== 1) {
      return null;
    }
    if (!("kind" in data) || typeof data.kind !== "string") return null;
    return data as RedisChatPayload;
  } catch {
    return null;
  }
}
