# Montenegrina

Montenegrina is a multi-tenant conversational-AI gateway with a stable `cnr`
public API, a provider-independent voice pipeline, Montenegrin language
validation, knowledge retrieval, typed tools, and evaluation infrastructure.

## Local development

Prerequisites: Docker with Compose v2.

```sh
cp .env.example .env
docker compose up --build
```

The seeded local account is `admin@montenegrina.local` / `local-admin-change-me`.
Local mode uses deterministic fake AI providers and does not require paid
credentials. The web application is available at <http://localhost:3000>, the
API at <http://localhost:3001>, and OpenAPI at
<http://localhost:3001/openapi.yaml>.

See [the developer guide](docs/voice-platform/developer-guide.md) for native
commands and [the architecture](docs/voice-platform/target-architecture.md) for
system boundaries.

