# syntax=docker/dockerfile:1
# Offered Grade Maze: one image with the server and the built client (CP07 T9, PD4).
#   docker compose up --build        (or: pnpm start:local)

# ---------------------------------------------------------------- build
FROM node:22-slim AS builder
ENV CI=1 \
    TURBO_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN corepack enable
WORKDIR /repo

# Dependencies first, so source changes reuse the install layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY packages/generator/package.json packages/generator/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile

COPY . .
# shared → generator → server, and the client.
RUN pnpm turbo run build --filter=@ogm/server... --filter=@ogm/client
# Production node_modules for the server, with shared and generator copied in.
RUN pnpm --filter @ogm/server deploy --prod /out/server

# ---------------------------------------------------------------- runtime
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    CLIENT_DIST=/app/client
WORKDIR /app
COPY --from=builder --chown=node:node /out/server ./server
COPY --from=builder --chown=node:node /repo/packages/client/dist ./client
USER node
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/v1/health').then((r) => r.json()).then((j) => process.exit(j.db === 'ok' ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "server/dist/main.js"]
