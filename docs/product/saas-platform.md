# Montenegrina SaaS Platform

## Product surfaces

- **Marketing site** (`/`) — bilingual EN/CNR public homepage
- **Auth** (`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/invite/accept`) — email and Google authentication
- **App** (`/overview`, `/agents`, `/knowledge`, etc.) — authenticated workspace dashboard
- **Onboarding** (`/onboarding`) — seven-step first-run wizard
- **Legal** (`/terms`, `/privacy`) — terms of service and privacy policy

## Workspace model

Users receive a personal workspace (`organizations` table) on signup. All agents, knowledge bases, conversations, API keys, and usage records are scoped by `organizationId` with composite foreign keys and API-layer filtering.

## Plans and entitlements

Plans: Free, Pro, Business, Enterprise (seeded). Quotas enforced on agent creation, document upload, team invites, and voice sessions. Visible on `/usage` and `/billing`.

## Feature flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `BILLING_ENABLED` | false | Stripe checkout and customer portal |
| `PHONE_INTEGRATIONS_ENABLED` | false | SIP/Twilio UI |
| `WEBHOOKS_ENABLED` | true | Webhook CRUD and delivery |
| `PUBLIC_DEMO_ENABLED` | false | Anonymous homepage demo |
| `SENTRY_ENABLED` | false | Error reporting (API + web) |

## Environment variables (user-facing)

| Variable | Purpose |
| --- | --- |
| `PUBLIC_WEB_URL` | Web app URL for email links and Stripe redirects |
| `PUBLIC_API_URL` | API URL for web client |
| `EMAIL_PROVIDER` | `console` (dev) or `resend` (production) |
| `RESEND_API_KEY` | Resend API key when `EMAIL_PROVIDER=resend` |
| `EMAIL_FROM` | From address for transactional email |
| `STRIPE_SECRET_KEY` | Stripe secret key (test or live) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `STRIPE_PRICE_PRO` | Stripe Price ID for Pro plan |
| `STRIPE_PRICE_BUSINESS` | Stripe Price ID for Business plan |
| `SENTRY_DSN` | Optional Sentry DSN |
| `KNOWLEDGE_PARSER_URL` | Internal URL for document parser service |

## Webhook signatures

Outbound webhooks include header `X-Montenegrina-Signature: sha256=<hex>` where `<hex>` is HMAC-SHA256 of the raw JSON body using the secret shown once at webhook creation.

Verify in your receiver:

```javascript
const crypto = require('node:crypto');
const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
const valid = signatureHeader === `sha256=${expected}`;
```

## Development

CI runs on push/PR to `main`: lint, typecheck, unit tests, web build, and `docker compose config`.

```bash
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test:unit
pnpm --filter @montenegrina/web e2e   # requires ./run_local
```

## Production Google OAuth

Before beta launch, add your production web origin to Google Cloud Console OAuth client:

- Authorized JavaScript origins: `https://your-app-domain.com`
- Authorized redirect URIs (if using redirect flow): same origin paths used by Google Identity Services

Set `PUBLIC_GOOGLE_CLIENT_ID` (web build arg) and `GOOGLE_CLIENT_ID` (API token verification).

## Phone / SIP (LiveKit Cloud)

Montenegrina uses **LiveKit Cloud SIP** for PSTN — not Twilio Voice SDK in the API. Local `./run_local` LiveKit supports browser voice only; SIP requires LiveKit Cloud plus carrier trunks.

### Architecture

PSTN ↔ Twilio/Telnyx ↔ LiveKit Cloud SIP ↔ LiveKit room ↔ `montenegrina-voice` agent ↔ NestJS API.

### Environment checklist (staging/prod)

| Variable | Purpose |
| --- | --- |
| `LIVEKIT_URL` / `PUBLIC_LIVEKIT_URL` | LiveKit Cloud WebSocket URL (`wss://….livekit.cloud`) |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | LiveKit project credentials |
| `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` | Outbound trunk (`ST_…`) for API-initiated calls |
| `LIVEKIT_SIP_INBOUND_TRUNK_ID` | Inbound trunk for DID routing |
| `LIVEKIT_WEBHOOK_SECRET` | Optional; LiveKit signs webhooks with API secret |
| `VOICE_AGENT_SERVICE_SECRET` | Shared secret for inbound `provision-inbound` (API + voice-agent) |
| `LIVEKIT_EGRESS_S3_ACCESS_KEY_ID` / `LIVEKIT_EGRESS_S3_SECRET_ACCESS_KEY` | Optional dedicated IAM user credentials for LiveKit Cloud egress (falls back to `S3_*` keys) |
| `PHONE_INTEGRATIONS_ENABLED` | Enables phone number UI and SIP channel management |

Set the same `VOICE_AGENT_SERVICE_SECRET` on API and voice-agent containers.

### Phase 1 — Outbound pilot

1. Create a LiveKit Cloud project.
2. Create an **outbound SIP trunk** (Twilio or Telnyx elastic SIP trunk → LiveKit docs).
3. Set `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`.
4. Test from playground **Call** or `POST /v1/agents/{agentId}/calls` with `{ "to": "+382…" }`.

Outbound to Montenegro mobiles (+382) works with any carrier DID; you do not need a local +382 number for outbound demos.

### Phase 2 — Inbound

1. Purchase a DID from Twilio/Telnyx (or LiveKit phone numbers if available).
2. Create a LiveKit **inbound SIP trunk** and point the carrier at it.
3. Set `LIVEKIT_SIP_INBOUND_TRUNK_ID`.
4. Create a platform **dispatch rule** (individual rooms) dispatching `montenegrina-voice` with metadata `{"mode":"inbound"}` — see `scripts/livekit-sip-bootstrap.sh`.
5. Register the DID in Montenegrina under **Integrations → Phone numbers** with an inbound agent.
6. Configure LiveKit webhook URL: `https://your-api/webhooks/livekit` (participant lifecycle + recording).

Per-number dispatch rules are created automatically when you enable a number in the UI (if inbound trunk is configured).

### Phase 3 — Production notes

- **Recording:** enable `retention.recordAudio` on the agent; optional `telephony.recordingNotice` (default CNR consent).
- **Quotas:** SIP minutes count toward `VOICE_MINUTES`.
- **Local +382 inbound:** typically requires a SIP trunk from a Montenegrin operator into LiveKit — procurement/compliance, not application code.

### Montenegro-specific

- Fastest demo: any Twilio/Telnyx number + outbound to +382.
- “Pravi” lokalni +382 inbound: operator SIP trunk → LiveKit inbound trunk.

## Before accepting paying customers

- Enable Stripe billing (`BILLING_ENABLED=true`) with test mode first
- Configure Resend for transactional email
- Phone/SIP via LiveKit Cloud (see above)
- Per-tenant provider credentials
- SOC2 / DPA artifacts
