import type { RedisChatPayload } from "@/services/redis-chat-event.publisher";
import type { SessionRegistry } from "@/ws/session-registry";

/**
 * Maps a Redis fan-out envelope to the same WebSocket `ServerEvent`s the subscriber uses.
 * Shared by `RedisChatSubscriber` and degraded-mode local broadcast when Pub/Sub is down.
 */
export function dispatchRedisPayloadToLocalRooms(
  registry: SessionRegistry,
  payload: RedisChatPayload
): void {
  switch (payload.kind) {
    case "message_new":
      registry.broadcastToChatIncludeSender(payload.chatId, {
        type: "message",
        message: payload.message,
      });
      break;
    case "typing":
      registry.broadcastToChatIncludeSender(payload.chatId, {
        type: "typing",
        chatId: payload.chatId,
        userId: payload.userId,
        active: payload.active,
      });
      break;
    case "messages_read":
      registry.broadcastToChatIncludeSender(payload.chatId, {
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
