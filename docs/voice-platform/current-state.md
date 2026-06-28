# Current state

Assessment date: 2026-06-28.

The repository was an empty Git repository on `main`, with no commits and a
nonexistent upstream branch. It contained no source files, manifests, schemas,
migrations, Docker configuration, CI, environment configuration, or existing
documentation. There were therefore no application conventions or working
features to preserve.

No baseline test, lint, type-check, or build commands existed. This is recorded
as an absence of a baseline, not a passing baseline. The platform is being
introduced as four applications in one monorepo because the TypeScript control
plane, browser application, background jobs, and Python realtime media worker
have different deployment and scaling characteristics.

Local tooling detected during assessment:

- Node.js 24.6.0
- pnpm 10.33.2
- Python 3.13.7
- uv 0.10.2
- Docker 27.4.0
- Terraform CLI was not installed

