import type { GroupRole, MessageType } from "@prisma/client";

export type { GroupRole, MessageType };

export interface MessageDTO {
  id: string;
  chatId: string;
  senderId: string;
  type: MessageType;
  content: string;
  metadata: Record<string, unknown>;
  clientGeneratedId: string | null;
  createdAt: string;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  /** Public or CDN URL to store in message.content after upload completes */
  fileUrl: string;
  expiresInSeconds: number;
  requiredHeaders: Record<string, string>;
}
