import { randomUUID } from "crypto";
import { MessageType } from "../../generated/prisma/client";
import { getEnv } from "../config/env";
import { AppError } from "../lib/errors";
import type { PresignedUploadResult } from "../types/domain";

const ALLOWED_MIME_BY_TYPE: Record<MessageType, RegExp[]> = {
  TEXT: [],
  IMAGE: [/^image\//],
  AUDIO: [/^audio\//],
  FILE: [/.+/],
};

/**
 * Media never flows through WebSocket frames: binary on WS is memory-heavy, breaks
 * horizontal scale, and couples transport to CDN concerns. Clients upload directly to
 * object storage; messages reference the resulting URL only.
 */
export class MediaService {
  /**
   * Mock pre-signed PUT — returns a fake URL. Swap implementation for S3 SDK
   * (`getSignedUrl` / `@aws-sdk/s3-request-presigner`) without changing callers.
   */
  async createPresignedUpload(input: {
    chatId: string;
    userId: string;
    fileName: string;
    mimeType: string;
    messageType: MessageType;
  }): Promise<PresignedUploadResult> {
    if (input.messageType === "TEXT") {
      throw new AppError("VALIDATION_ERROR", "TEXT messages do not use presigned uploads");
    }
    const rules = ALLOWED_MIME_BY_TYPE[input.messageType];
    const ok = rules.some((re) => re.test(input.mimeType));
    if (!ok) {
      throw new AppError("VALIDATION_ERROR", "MIME type not allowed for message type", {
        messageType: input.messageType,
        mimeType: input.mimeType,
      });
    }

    const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `${input.chatId}/${input.userId}/${randomUUID()}-${safeName}`;
    const base = getEnv().MOCK_S3_BUCKET_BASE_URL.replace(/\/$/, "");
    const fileUrl = `${base}/${objectKey}`;
    const uploadUrl = `${fileUrl}?mockSignature=1&expires=3600`;

    return {
      uploadUrl,
      fileUrl,
      expiresInSeconds: 3600,
      requiredHeaders: {
        "Content-Type": input.mimeType,
      },
    };
  }
}
