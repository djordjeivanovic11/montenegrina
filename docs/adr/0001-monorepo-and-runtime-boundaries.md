# ADR 0001: Monorepo and runtime boundaries

Status: accepted.

Use pnpm workspaces and Turborepo for TypeScript applications/packages, with a
separate uv-managed Python project inside the same repository. Deploy API, web,
worker, and voice agent independently. This preserves contract sharing without
coupling realtime media scaling to control-plane traffic.

