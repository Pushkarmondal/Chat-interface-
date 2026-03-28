#!/usr/bin/env sh
set -e
echo "Running database migrations..."
bunx prisma migrate deploy
echo "Starting server..."
exec bun run src/index.ts
