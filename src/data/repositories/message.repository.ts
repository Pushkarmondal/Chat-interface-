import { Prisma, type Message, type MessageType } from "@prisma/client";
import { getPrisma } from "@/data/prisma";

export class MessageRepository {
  async findByClientGeneratedId(
    chatId: string,
    clientGeneratedId: string
  ): Promise<Message | null> {
    return getPrisma().message.findUnique({
      where: {
        chatId_clientGeneratedId: { chatId, clientGeneratedId },
      },
    });
  }

  async create(data: {
    chatId: string;
    senderId: string;
    type: MessageType;
    content: string;
    metadata: Prisma.InputJsonValue;
    clientGeneratedId: string;
  }): Promise<Message> {
    return getPrisma().message.create({ data });
  }

  async createManyReadReceipts(
    messageIds: string[],
    userId: string
  ): Promise<{ count: number }> {
    if (messageIds.length === 0) return { count: 0 };
    const data = messageIds.map((messageId) => ({ messageId, userId }));
    return getPrisma().messageReadReceipt.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async assertMessagesBelongToChat(messageIds: string[], chatId: string): Promise<boolean> {
    const count = await getPrisma().message.count({
      where: { chatId, id: { in: messageIds } },
    });
    return count === messageIds.length;
  }
}
