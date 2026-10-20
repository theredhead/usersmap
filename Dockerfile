FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY vendor ./vendor
RUN npm ci --no-audit --no-fund
COPY angular.json tsconfig.json ./
COPY apps ./apps
COPY shared ./shared
COPY config ./config
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/apps/api/src/database/migrations ./apps/api/src/database/migrations
COPY --from=build --chown=node:node /app/config ./config
USER node
EXPOSE 3000
CMD ["node", "dist/api/apps/api/src/main.js"]
