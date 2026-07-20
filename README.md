# Montenegrina

Montenegrina is a multi-tenant conversational-AI gateway with a stable `cnr`
public API, a provider-independent voice pipeline, Montenegrin language
validation, knowledge retrieval, typed tools, and evaluation infrastructure.

## Local development

Prerequisites: Docker with Compose v2.

```sh
./run_local
```

`./run_local` creates ignored `.env.development` from
`.env.development.example` and uses that file for Docker Compose. Keep `.env`
for private production-like/deployment values only; local Docker no longer reads
it. Local object storage is MinIO via its S3-compatible API; Azure production
uses Azure Blob Storage and does not read local S3/MinIO settings.

Local browser voice uses real provider credentials. With the default
OpenAI STT + ElevenLabs TTS setup, fill these in `.env.development` before
startup: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, and
`ELEVENLABS_MONTENEGRIN_VOICE_ID`. `DEEPGRAM_API_KEY` is only required if you
set `VOICE_STT_PROVIDER=deepgram`. The web application is available at
<http://localhost:3000>, the API at <http://localhost:3001>, and OpenAPI at
<http://localhost:3001/openapi.yaml>.

See [the architecture](docs/voice-platform/target-architecture.md) for system
boundaries.
