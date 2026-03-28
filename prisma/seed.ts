/**
 * Demo data for local and Docker end-to-end tests.
 * Run: bun run db:seed (requires DATABASE_URL and JWT_SECRET in env).
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ChatType, GroupRole, MessageType } from "../generated/prisma/client";
import { signAccessToken } from "../src/lib/jwt";

config();

const DEMO_CHAT_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_MESSAGE_ID = "00000000-0000-4000-8000-000000000002";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

async function main(): Promise<void> {
  requireEnv("DATABASE_URL");
  requireEnv("JWT_SECRET");

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: { email: "admin@example.com" },
  });
  const writer = await prisma.user.upsert({
    where: { email: "writer@example.com" },
    update: {},
    create: { email: "writer@example.com" },
  });
  const reader = await prisma.user.upsert({
    where: { email: "reader@example.com" },
    update: {},
    create: { email: "reader@example.com" },
  });

  const chat = await prisma.chat.upsert({
    where: { id: DEMO_CHAT_ID },
    update: { name: "Demo room" },
    create: {
      id: DEMO_CHAT_ID,
      type: ChatType.GROUP,
      name: "Demo room",
    },
  });

  await prisma.chatMember.upsert({
    where: { userId_chatId: { userId: admin.id, chatId: chat.id } },
    update: { role: GroupRole.ADMIN },
    create: { userId: admin.id, chatId: chat.id, role: GroupRole.ADMIN },
  });
  await prisma.chatMember.upsert({
    where: { userId_chatId: { userId: writer.id, chatId: chat.id } },
    update: { role: GroupRole.WRITE },
    create: { userId: writer.id, chatId: chat.id, role: GroupRole.WRITE },
  });
  await prisma.chatMember.upsert({
    where: { userId_chatId: { userId: reader.id, chatId: chat.id } },
    update: { role: GroupRole.READ },
    create: { userId: reader.id, chatId: chat.id, role: GroupRole.READ },
  });

  await prisma.message.upsert({
    where: {
      chatId_clientGeneratedId: {
        chatId: chat.id,
        clientGeneratedId: "seed-welcome-msg",
      },
    },
    update: {},
    create: {
      id: DEMO_MESSAGE_ID,
      chatId: chat.id,
      senderId: admin.id,
      type: MessageType.TEXT,
      content: "Welcome. Use join_chat then send_message or typing_start.",
      metadata: {},
      clientGeneratedId: "seed-welcome-msg",
    },
  });

  const adminToken = signAccessToken(admin.id, admin.email);
  const writerToken = signAccessToken(writer.id, writer.email);
  const readerToken = signAccessToken(reader.id, reader.email);

  console.log("\n=== Seed complete ===");
  console.log("chatId:", chat.id);
  console.log("\nWebSocket URL (admin):");
  console.log(`  ws://localhost:8080?token=${adminToken}`);
  console.log("\nJWT admin (WRITE+):", adminToken);
  console.log("JWT writer:", writerToken);
  console.log("JWT reader (READ-only):", readerToken);
  console.log("\nUse the same JWT_SECRET as the running app when minting tokens.\n");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
