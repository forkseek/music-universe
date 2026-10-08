FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm --prefix apps/music-universe ci --include=dev
RUN npm run build

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 MUSIC_DESKTOP_LOGIN=0 ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY --from=builder /app/package.json /app/package-lock.json /app/.npmrc ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder --chown=node:node /app/.next/standalone ./.next/standalone
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/integrations ./integrations
COPY --from=builder --chown=node:node /app/src/db/postgres-migrations ./src/db/postgres-migrations
COPY --from=builder --chown=node:node /app/scripts/start.mjs ./scripts/start.mjs
RUN chown node:node /app/.next /app/.next/standalone
USER node
EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
