import { PrismaClientKnownRequestError } from "../../generated/prisma/internal/prismaNamespace";
import type { MessageType } from "../../generated/prisma/client";
import { AppError } from "../lib/errors";
import { MessageRepository } from "../data/repositories/message.repository";
import { ChatPermissionService } from "../services/chat-permission.service";
import type {
  RedisChatEventPublisher,
  RedisChatPayload,
} from "../services/redis-chat-event.publisher";
import type { LocalRoomFanout } from "../services/local-room-fanout";
import type { MessageDTO } from "../types/domain";
import { logger } from "../lib/logger";
import { InputJsonValue, JsonValue } from "../../generated/prisma/internal/prismaNamespace";

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function validateContentForType(type: MessageType, content: string): void {
  if (type === "TEXT") return;
  if (!isHttpUrl(content)) {
    throw new AppError("VALIDATION_ERROR", "Media messages must use content as HTTPS/HTTP URL", {
      type,
    });
  }
}

function toDto(row: {
  id: string;
  chatId: string;
  senderId: string;
  type: MessageType;
  content: string;
  metadata: JsonValue | null;
  clientGeneratedId: string | null;
  createdAt: Date;
}): MessageDTO {
  const metadata =
    typeof row.metadata === "object" && row.metadata !== null && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  return {
    id: row.id,
    chatId: row.chatId,
    senderId: row.senderId,
    type: row.type,
    content: row.content,
    metadata,
    clientGeneratedId: row.clientGeneratedId,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface SendMessageInput {
  chatId: string;
  senderId: string;
  clientGeneratedId: string;
  messageType: MessageType;
  content: string;
  metadata?: Record<string, unknown>;
}

export class MessageService {
  constructor(
    private readonly messages: MessageRepository,
    private readonly permissions: ChatPermissionService,
    private readonly bus: RedisChatEventPublisher,
    private readonly localFanout?: LocalRoomFanout
  ) {}

  private async publishOrDegradeLocal(payload: RedisChatPayload): Promise<void> {
    try {
      await this.bus.publish(payload);
    } catch (e) {
      logger.warn("Redis publish failed; degrading to local room broadcast only", {
        kind: payload.kind,
        chatId: payload.chatId,
        err: String(e),
      });
      this.localFanout?.broadcast(payload);
    }
  }

  async sendMessage(input: SendMessageInput): Promise<{ message: MessageDTO; deduplicated: boolean }> {
    await this.permissions.requireCanWrite(input.chatId, input.senderId);
    validateContentForType(input.messageType, input.content);

    const existing = await this.messages.findByClientGeneratedId(
      input.chatId,
      input.clientGeneratedId
    );
    if (existing) {
      return { message: toDto(existing), deduplicated: true };
    }

    try {
      const created = await this.messages.create({
        chatId: input.chatId,
        senderId: input.senderId,
        type: input.messageType,
        content: input.content,
        metadata: input.metadata as InputJsonValue,
        clientGeneratedId: input.clientGeneratedId,
      });
      const dto = toDto(created);
      await this.publishOrDegradeLocal({
        v: 1,
        kind: "message_new",
        chatId: input.chatId,
        message: dto,
      });
      return { message: dto, deduplicated: false };
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
        const again = await this.messages.findByClientGeneratedId(
          input.chatId,
          input.clientGeneratedId
        );
        if (again) return { message: toDto(again), deduplicated: true };
      }
      throw e;
    }
  }

  async markRead(input: {
    chatId: string;
    userId: string;
    messageIds: string[];
  }): Promise<{ readAt: string; messageIds: string[] }> {
    await this.permissions.requireMember(input.chatId, input.userId);
    const valid = await this.messages.assertMessagesBelongToChat(input.messageIds, input.chatId);
    if (!valid) {
      throw new AppError("VALIDATION_ERROR", "One or more messages are not in this chat");
    }
    await this.messages.createManyReadReceipts(input.messageIds, input.userId);
    const readAt = new Date().toISOString();
    await this.publishOrDegradeLocal({
      v: 1,
      kind: "messages_read",
      chatId: input.chatId,
      userId: input.userId,
      messageIds: input.messageIds,
      readAt,
    });
    return { readAt, messageIds: input.messageIds };
  }
}
