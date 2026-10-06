FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 ELECTRON_SKIP_BINARY_DOWNLOAD=1 MUSIC_UNIVERSE_SOURCE=/tmp/no-universe-source
ARG NEXT_PUBLIC_ENABLE_QQMUSIC=false
ENV NEXT_PUBLIC_ENABLE_QQMUSIC=$NEXT_PUBLIC_ENABLE_QQMUSIC
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 DATABASE_PATH=/app/data/music-world.db MUSIC_INTEGRATION_ROOT=/app/integrations/mineradio MUSIC_DESKTOP_LOGIN=0
COPY --from=builder --chown=node:node /app/.next/standalone ./
# fork(worker.cjs) is a separate module-resolution boundary. Keep production
# dependencies explicitly; Next's trace omits NeteaseCloudMusicApi and qrcode.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/integrations/mineradio ./integrations/mineradio
COPY --from=builder --chown=node:node /app/src/db/migrations ./src/db/migrations
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts/storage-check.mjs ./scripts/storage-check.mjs
RUN mkdir -p /app/data && chown node:node /app/data
USER node
EXPOSE 3000
CMD ["node", "server.js"]
