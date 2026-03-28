import { createServer } from "http";
import { WebSocketServer } from "ws";
import { getEnv } from "@/config/env";
import { prisma } from "@/data/repositories/prismaConnection";
import { getRedis } from "@/data/redis.client";
import { createPubSubConnections } from "@/data/redis.pubsub";
import { ChatMemberRepository } from "@/data/repositories/chat-member.repository";
import { MessageRepository } from "@/data/repositories/message.repository";
import { logger } from "@/lib/logger";
import { ChatPermissionService } from "@/services/chat-permission.service";
import { ChatCommandService } from "@/services/chat-command.service";
import { MessageService } from "@/services/message.service";
import { TypingService } from "@/services/typing.service";
import { PresenceService } from "@/services/presence.service";
import { MediaService } from "@/services/media.service";
import { RedisChatEventPublisher } from "@/services/redis-chat-event.publisher";
import { ChatGateway } from "@/ws/chat-gateway";
import { SessionRegistry } from "@/ws/session-registry";
import { RedisChatSubscriber } from "@/ws/redis-subscriber";

/**
 * Composition root: wires data + domain + transport. In larger deployments this
 * moves to a DI container; explicit construction keeps startup transparent.
 */
function buildApp() {
  const { publisher, subscriber } = createPubSubConnections();
  const registry = new SessionRegistry();
  const chatMembers = new ChatMemberRepository();
  const messagesRepo = new MessageRepository();
  const permissions = new ChatPermissionService(chatMembers);
  const bus = new RedisChatEventPublisher(publisher);
  const messageService = new MessageService(messagesRepo, permissions, bus);
  const typingService = new TypingService(permissions, bus);
  const presenceService = new PresenceService();
  const mediaService = new MediaService();
  const commands = new ChatCommandService(
    messageService,
    typingService,
    presenceService,
    mediaService,
    permissions
  );
  const gateway = new ChatGateway(registry, commands, presenceService);
  const redisSub = new RedisChatSubscriber(subscriber, registry);
  return { gateway, redisSub, publisher, subscriber };
}

const { gateway, redisSub, publisher } = buildApp();

const server = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on("connection", (socket, req) => {
  gateway.handleConnection(socket, req);
});

async function main(): Promise<void> {
  await redisSub.start();
  const port = getEnv().PORT;
  server.listen(port, () => {
    logger.info("Chat server listening", { port });
  });
}

function shutdown(signal: string): void {
  logger.info("Shutting down", { signal });
  void redisSub.stop().finally(() => {
    wss.close(() => {
      server.close(() => {
        void Promise.all([
          prisma.$disconnect(),
          publisher.quit(),
          getRedis().quit(),
        ]).finally(() => process.exit(0));
      });
    });
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

main().catch((e) => {
  logger.error("Fatal startup error", { err: String(e) });
  process.exit(1);
});
