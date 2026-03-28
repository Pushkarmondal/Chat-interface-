import { randomUUID } from "crypto";
import type { IncomingMessage } from "http";
import { ZodError } from "zod";
import WebSocket from "ws";
import { AppError, isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { serializeServerEvent, type ServerEvent } from "@/types/events";
import { ChatCommandService } from "@/services/chat-command.service";
import { PresenceService } from "@/services/presence.service";
import { ClientSession, SessionRegistry } from "@/ws/session-registry";
import { authenticateSocketRequest } from "@/ws/auth";

/**
 * Thin transport adapter: authenticates, parses JSON, delegates to ChatCommandService,
 * applies room membership + user-targeted ACKs. No persistence or permission rules here.
 */
export class ChatGateway {
  constructor(
    private readonly registry: SessionRegistry,
    private readonly commands: ChatCommandService,
    private readonly presence: PresenceService
  ) {}

  handleConnection(socket: WebSocket, req: IncomingMessage): void {
    let userId: string;
    try {
      const auth = authenticateSocketRequest(req);
      userId = auth.userId;
    } catch (e) {
      const err = isAppError(e) ? e : new AppError("UNAUTHORIZED", "Authentication failed");
      socket.send(
        serializeServerEvent({
          type: "error",
          error: err.toJSON(),
        })
      );
      socket.close(4401, "Unauthorized");
      return;
    }

    const session: ClientSession = {
      id: randomUUID(),
      userId,
      socket,
      rooms: new Set(),
    };
    this.registry.addSession(session);

    void this.presence.touchOnline(userId);
    socket.send(
      serializeServerEvent({
        type: "connected",
        userId,
      })
    );

    socket.on("message", (data) => {
      void this.onClientMessage(session, data);
    });

    socket.on("close", () => {
      this.registry.removeSession(session);
      if (this.registry.getUserSessionCount(userId) === 0) {
        void this.presence.setOffline(userId);
      }
    });

    socket.on("error", (err) => {
      logger.warn("WebSocket error", { sessionId: session.id, err: String(err) });
    });
  }

  private async onClientMessage(session: ClientSession, data: WebSocket.RawData): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(data.toString()) as unknown;
    } catch {
      this.sendError(session, new AppError("VALIDATION_ERROR", "Invalid JSON"));
      return;
    }

    let event;
    try {
      event = this.commands.parseAndValidate(raw);
    } catch (e) {
      if (e instanceof ZodError) {
        this.sendError(
          session,
          new AppError("VALIDATION_ERROR", "Invalid event payload", { issues: e.flatten() })
        );
        return;
      }
      this.sendError(session, new AppError("VALIDATION_ERROR", "Invalid event"));
      return;
    }

    const result = await this.commands.execute(session.userId, event);
    if (!result.ok) {
      this.sendError(session, result.error);
      return;
    }

    for (const effect of result.effects) {
      if (effect.type === "joined_chat") {
        this.registry.joinRoom(session, effect.chatId);
        session.socket.send(
          serializeServerEvent({ type: "joined_chat", chatId: effect.chatId } satisfies ServerEvent)
        );
      } else if (effect.type === "left_chat") {
        this.registry.leaveRoom(session, effect.chatId);
        session.socket.send(
          serializeServerEvent({ type: "left_chat", chatId: effect.chatId } satisfies ServerEvent)
        );
      } else if (effect.type === "message_delivered") {
        this.registry.sendToUser(session.userId, {
          type: "message_delivered",
          chatId: effect.chatId,
          clientGeneratedId: effect.clientGeneratedId,
          messageId: effect.messageId,
        });
      }
    }

    if (result.presigned) {
      session.socket.send(
        serializeServerEvent({
          type: "presigned_upload",
          uploadUrl: result.presigned.uploadUrl,
          fileUrl: result.presigned.fileUrl,
          expiresInSeconds: result.presigned.expiresInSeconds,
          requiredHeaders: result.presigned.requiredHeaders,
        })
      );
    }
  }

  private sendError(session: ClientSession, error: AppError): void {
    if (session.socket.readyState === WebSocket.OPEN) {
      session.socket.send(serializeServerEvent({ type: "error", error: error.toJSON() }));
    }
  }
}
