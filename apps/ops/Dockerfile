FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_HOME=/corepack
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@montenegrina/database...
RUN pnpm deploy --filter=@montenegrina/database --prod --legacy /release/ops

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /release/ops .
COPY --from=build --chown=node:node /app/packages/database/migrations ./dist/migrations
USER node
CMD ["node", "dist/src/migrate.js"]
