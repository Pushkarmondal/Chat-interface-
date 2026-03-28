import type { RedisChatPayload } from "@/services/redis-chat-event.publisher";

/** Injected from the composition root; avoids services importing WebSocket types. */
export interface LocalRoomFanout {
  broadcast(payload: RedisChatPayload): void;
}
