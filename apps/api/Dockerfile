FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@montenegrina/api...

FROM node:24-bookworm-slim AS development
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
CMD ["pnpm", "--filter", "@montenegrina/api", "dev"]

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
RUN corepack enable && pnpm prune --prod
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
