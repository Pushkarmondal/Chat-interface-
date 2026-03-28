# Bun image (Debian-based) for better Prisma / OpenSSL compatibility than Alpine.
FROM oven/bun:1.2

WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN bun install --frozen-lockfile

COPY src ./src

RUN bun run db:generate

COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
