import type { GroupRole } from "../../generated/prisma/client";
import { AppError } from "../lib/errors";
import { ChatMemberRepository } from "../data/repositories/chat-member.repository";

/**
 * Authorization lives exclusively in the service layer so transports (HTTP, WS, gRPC)
 * cannot accidentally bypass checks.
 */
export class ChatPermissionService {
  constructor(private readonly members: ChatMemberRepository) {}

  async requireMember(chatId: string, userId: string): Promise<GroupRole> {
    const m = await this.members.findMembership(chatId, userId);
    if (!m) {
      throw new AppError("FORBIDDEN", "Not a member of this chat", { chatId });
    }
    return m.role;
  }

  /**
   * READ: consume only. WRITE/ADMIN: may send messages, request uploads, emit typing.
   */
  async requireCanWrite(chatId: string, userId: string): Promise<void> {
    const role = await this.requireMember(chatId, userId);
    if (role === "READ") {
      throw new AppError("FORBIDDEN", "Read-only role cannot perform this action", {
        chatId,
        role,
      });
    }
  }

  async requireAdmin(chatId: string, userId: string): Promise<void> {
    const role = await this.requireMember(chatId, userId);
    if (role !== "ADMIN") {
      throw new AppError("FORBIDDEN", "Admin role required", { chatId, role });
    }
  }
}
