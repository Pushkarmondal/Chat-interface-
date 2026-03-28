import { Prisma, type Message, type MessageType } from "../../../generated/prisma/client";
import { prisma } from "../repositories/prismaConnection";

export class MessageRepository {
  async findByClientGeneratedId(
    chatId: string,
    clientGeneratedId: string
  ): Promise<Message | null> {
    return prisma.message.findUnique({
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
    return prisma.message.create({ data });
  }

  async createManyReadReceipts(
    messageIds: string[],
    userId: string
  ): Promise<{ count: number }> {
    if (messageIds.length === 0) return { count: 0 };
    const data = messageIds.map((messageId) => ({ messageId, userId }));
    return prisma.messageReadReceipt.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async assertMessagesBelongToChat(messageIds: string[], chatId: string): Promise<boolean> {
    const count = await prisma.message.count({
      where: { chatId, id: { in: messageIds } },
    });
    return count === messageIds.length;
  }
}
