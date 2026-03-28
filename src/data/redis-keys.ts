/** Typing indicator — short TTL so stale state disappears without DB writes. */
export const TYPING_TTL_SECONDS = 4;

/** Presence — refreshed by client heartbeat; disconnect detection via TTL expiry. */
export const PRESENCE_TTL_SECONDS = 45;

export function typingKey(chatId: string, userId: string): string {
  return `typing:${chatId}:${userId}`;
}

export function onlineKey(userId: string): string {
  return `online:${userId}`;
}

/** One Redis channel per chat keeps payloads scoped; PSUBSCRIBE chat:* on each node. */
export function chatChannel(chatId: string): string {
  return `chat:${chatId}`;
}
