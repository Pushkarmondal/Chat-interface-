import { ZodError } from "zod";
import { AppError, isAppError } from "@/lib/errors";
import { parseClientEvent, type ClientEvent } from "@/types/events";
import type { PresignedUploadResult } from "@/types/domain";
import { MessageService } from "@/services/message.service";
import { TypingService } from "@/services/typing.service";
import { PresenceService } from "@/services/presence.service";
import { MediaService } from "@/services/media.service";
import { ChatPermissionService } from "@/services/chat-permission.service";

/** Side effects applied by the transport layer after successful command handling. */
export type CommandEffect =
  | {
      type: "message_delivered";
      chatId: string;
      clientGeneratedId: string;
      messageId: string;
    }
  | { type: "joined_chat"; chatId: string }
  | { type: "left_chat"; chatId: string };

export type CommandSuccess = {
  ok: true;
  effects: CommandEffect[];
  presigned?: PresignedUploadResult;
};

export type CommandFailure = { ok: false; error: AppError };

export type CommandResult = CommandSuccess | CommandFailure;

function validationError(err: ZodError): AppError {
  return new AppError("VALIDATION_ERROR", "Invalid event payload", {
    issues: err.flatten(),
  });
}

/**
 * Orchestrates domain services for WebSocket commands. No knowledge of `ws` —
 * returns structured results so the gateway can emit ACKs and Redis remains the
 * cross-node fan-out path for chat-visible events.
 */
export class ChatCommandService {
  constructor(
    private readonly messages: MessageService,
    private readonly typing: TypingService,
    private readonly presence: PresenceService,
    private readonly media: MediaService,
    private readonly permissions: ChatPermissionService
  ) {}

  parseAndValidate(raw: unknown): ClientEvent {
    try {
      return parseClientEvent(raw);
    } catch (e) {
      if (e instanceof ZodError) throw validationError(e);
      throw e;
    }
  }

  async execute(userId: string, event: ClientEvent): Promise<CommandResult> {
    try {
      switch (event.type) {
        case "join_chat": {
          await this.permissions.requireMember(event.chatId, userId);
          return { ok: true, effects: [{ type: "joined_chat", chatId: event.chatId }] };
        }
        case "leave_chat": {
          await this.permissions.requireMember(event.chatId, userId);
          return { ok: true, effects: [{ type: "left_chat", chatId: event.chatId }] };
        }
        case "send_message": {
          const { message } = await this.messages.sendMessage({
            chatId: event.chatId,
            senderId: userId,
            clientGeneratedId: event.clientGeneratedId,
            messageType: event.messageType,
            content: event.content,
            metadata: event.metadata,
          });
          return {
            ok: true,
            effects: [
              {
                type: "message_delivered",
                chatId: event.chatId,
                clientGeneratedId: event.clientGeneratedId,
                messageId: message.id,
              },
            ],
          };
        }
        case "typing_start": {
          await this.typing.startTyping(event.chatId, userId);
          return { ok: true, effects: [] };
        }
        case "typing_stop": {
          await this.typing.stopTyping(event.chatId, userId);
          return { ok: true, effects: [] };
        }
        case "presence_heartbeat": {
          await this.presence.touchOnline(userId);
          return { ok: true, effects: [] };
        }
        case "mark_messages_read": {
          await this.messages.markRead({
            chatId: event.chatId,
            userId,
            messageIds: event.messageIds,
          });
          return { ok: true, effects: [] };
        }
        case "request_presigned_upload": {
          await this.permissions.requireCanWrite(event.chatId, userId);
          const presigned = await this.media.createPresignedUpload({
            chatId: event.chatId,
            userId,
            fileName: event.fileName,
            mimeType: event.mimeType,
            messageType: event.messageType,
          });
          return { ok: true, effects: [], presigned };
        }
        default: {
          const _exhaustive: never = event;
          return _exhaustive;
        }
      }
    } catch (e) {
      if (isAppError(e)) return { ok: false, error: e };
      const message = e instanceof Error ? e.message : "Unexpected error";
      return {
        ok: false,
        error: new AppError("INTERNAL", message),
      };
    }
  }
}
