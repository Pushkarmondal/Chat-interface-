import type { GroupRole } from "../../../generated/prisma/client";
import { prisma } from "../repositories/prismaConnection";

export class ChatMemberRepository {
  async findMembership(
    chatId: string,
    userId: string
  ): Promise<{ role: GroupRole } | null> {
    const row = await prisma.chatMember.findUnique({
      where: { userId_chatId: { userId, chatId } },
      select: { role: true },
    });
    return row;
  }

  async listMemberUserIds(chatId: string): Promise<string[]> {
    const rows = await prisma.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}