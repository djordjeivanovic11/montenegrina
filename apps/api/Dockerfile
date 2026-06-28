FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_HOME=/corepack
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@montenegrina/api...

FROM build AS deployer
RUN pnpm deploy --filter=@montenegrina/api --prod --legacy /release/api

FROM node:24-bookworm-slim AS development
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
CMD ["pnpm", "--filter", "@montenegrina/api", "dev"]

FROM node:24-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deployer /release/api .
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
