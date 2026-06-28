FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_HOME=/corepack
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@montenegrina/worker...

FROM build AS deployer
RUN pnpm deploy --filter=@montenegrina/worker --prod --legacy /release/worker

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deployer /release/worker .
USER node
CMD ["node", "dist/main.js"]
