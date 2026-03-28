import WebSocket from "ws";
import { serializeServerEvent, type ServerEvent } from "@/types/events";

export interface ClientSession {
  readonly id: string;
  readonly userId: string;
  readonly socket: WebSocket;
  /** Chats this connection has joined for local fan-out */
  rooms: Set<string>;
}

/**
 * Per-process registry only. Combined with Redis Pub/Sub, each node stays stateless
 * regarding other nodes: local rooms + shared event bus == horizontal scale.
 *
 * Tradeoff: reconnect must re-issue join_chat; no sticky-session requirement.
 */
export class SessionRegistry {
  private readonly byUser = new Map<string, Set<ClientSession>>();
  private readonly byChat = new Map<string, Set<ClientSession>>();

  addSession(session: ClientSession): void {
    let set = this.byUser.get(session.userId);
    if (!set) {
      set = new Set();
      this.byUser.set(session.userId, set);
    }
    set.add(session);
  }

  removeSession(session: ClientSession): void {
    for (const chatId of session.rooms) {
      this.leaveRoom(session, chatId);
    }
    const set = this.byUser.get(session.userId);
    if (set) {
      set.delete(session);
      if (set.size === 0) this.byUser.delete(session.userId);
    }
  }

  joinRoom(session: ClientSession, chatId: string): void {
    session.rooms.add(chatId);
    let set = this.byChat.get(chatId);
    if (!set) {
      set = new Set();
      this.byChat.set(chatId, set);
    }
    set.add(session);
  }

  leaveRoom(session: ClientSession, chatId: string): void {
    session.rooms.delete(chatId);
    const set = this.byChat.get(chatId);
    if (set) {
      set.delete(session);
      if (set.size === 0) this.byChat.delete(chatId);
    }
  }

  broadcastToChat(chatId: string, event: ServerEvent, exceptSessionId?: string): void {
    const set = this.byChat.get(chatId);
    if (!set) return;
    const payload = serializeServerEvent(event);
    for (const s of set) {
      if (s.id === exceptSessionId) continue;
      if (s.socket.readyState === WebSocket.OPEN) {
        s.socket.send(payload);
      }
    }
  }

  /** Send to every connection owned by a user (multi-device / tabs). */
  getUserSessionCount(userId: string): number {
    return this.byUser.get(userId)?.size ?? 0;
  }

  sendToUser(userId: string, event: ServerEvent): void {
    const set = this.byUser.get(userId);
    if (!set) return;
    const payload = serializeServerEvent(event);
    for (const s of set) {
      if (s.socket.readyState === WebSocket.OPEN) {
        s.socket.send(payload);
      }
    }
  }

  broadcastToChatIncludeSender(chatId: string, event: ServerEvent): void {
    this.broadcastToChat(chatId, event);
  }
}
