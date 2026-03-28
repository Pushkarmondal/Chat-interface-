import { z } from "zod";
import { MessageType } from "@prisma/client";

/**
 * Inbound client events — validated in the transport layer, then passed to services.
 * Keeping Zod schemas here avoids business logic in WebSocket handlers.
 */

const uuid = z.string().uuid();

export const joinChatSchema = z.object({
  type: z.literal("join_chat"),
  chatId: uuid,
});

export const leaveChatSchema = z.object({
  type: z.literal("leave_chat"),
  chatId: uuid,
});

export const sendMessageSchema = z.object({
  type: z.literal("send_message"),
  chatId: uuid,
  clientGeneratedId: z.string().min(1).max(128),
  messageType: z.nativeEnum(MessageType),
  content: z.string().min(1).max(65536),
  metadata: z.record(z.unknown()).optional().default({}),
});

export const typingStartSchema = z.object({
  type: z.literal("typing_start"),
  chatId: uuid,
});

export const typingStopSchema = z.object({
  type: z.literal("typing_stop"),
  chatId: uuid,
});

export const presenceHeartbeatSchema = z.object({
  type: z.literal("presence_heartbeat"),
});

export const markMessagesReadSchema = z.object({
  type: z.literal("mark_messages_read"),
  chatId: uuid,
  messageIds: z.array(uuid).min(1).max(100),
});

export const requestPresignedUploadSchema = z.object({
  type: z.literal("request_presigned_upload"),
  chatId: uuid,
  fileName: z.string().min(1).max(512),
  mimeType: z.string().min(1).max(128),
  messageType: z.nativeEnum(MessageType),
});

const clientEventSchema = z.discriminatedUnion("type", [
  joinChatSchema,
  leaveChatSchema,
  sendMessageSchema,
  typingStartSchema,
  typingStopSchema,
  presenceHeartbeatSchema,
  markMessagesReadSchema,
  requestPresignedUploadSchema,
]);

export type ClientEvent = z.infer<typeof clientEventSchema>;

export function parseClientEvent(raw: unknown): ClientEvent {
  return clientEventSchema.parse(raw);
}

/** Outbound envelope to clients */
export type ServerEvent =
  | { type: "connected"; userId: string }
  | { type: "joined_chat"; chatId: string }
  | { type: "left_chat"; chatId: string }
  | { type: "error"; error: import("@/lib/errors").SerializedAppError }
  | { type: "message"; message: import("@/types/domain").MessageDTO }
  | {
      type: "message_delivered";
      chatId: string;
      clientGeneratedId: string;
      messageId: string;
    }
  | {
      type: "messages_read";
      chatId: string;
      userId: string;
      messageIds: string[];
      readAt: string;
    }
  | { type: "typing"; chatId: string; userId: string; active: boolean }
  | { type: "presence"; userId: string; online: boolean }
  | {
      type: "presigned_upload";
      uploadUrl: string;
      fileUrl: string;
      expiresInSeconds: number;
      requiredHeaders: Record<string, string>;
    };

export function serializeServerEvent(ev: ServerEvent): string {
  return JSON.stringify(ev);
}
