import type { GroupRole } from "@prisma/client";
import { getPrisma } from "@/data/prisma";

export class ChatMemberRepository {
  async findMembership(
    chatId: string,
    userId: string
  ): Promise<{ role: GroupRole } | null> {
    const row = await getPrisma().chatMember.findUnique({
      where: { userId_chatId: { userId, chatId } },
      select: { role: true },
    });
    return row;
  }

  async listMemberUserIds(chatId: string): Promise<string[]> {
    const rows = await getPrisma().chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }
}
