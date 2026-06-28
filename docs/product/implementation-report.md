# Montenegrina SaaS Implementation Report

Last updated: 2026-06-28.

## Completed

### Platform
- Knowledge bases, auth, onboarding, workspace bootstrap, entitlements, audit logging
- Stripe billing (checkout, portal, webhooks) behind `BILLING_ENABLED`
- Transactional email (Resend + console) for invites and password reset
- Webhooks with signing secrets and delivery worker
- CI workflow, Playwright smoke tests, enriched health checks, optional Sentry

### Voice & telephony (LiveKit SIP)
- Shared `LiveKitVoiceService` for browser + outbound SIP (room dispatch before dial)
- Inbound `provision-inbound` + Python agent branch
- Phone numbers CRUD with LiveKit dispatch rule + inbound trunk number sync
- LiveKit webhooks (call completion, egress metadata)
- Call recording egress to S3 + presigned download API
- Integrations UI (add/edit/delete numbers) and playground outbound test with status polling
- Conversations UI with SIP metadata and recording download

### Marketing & app surfaces
- Bilingual homepage, auth, onboarding, dashboard, legal pages

## Behind feature flags

| Feature | Flag | Notes |
| --- | --- | --- |
| Stripe billing | `BILLING_ENABLED` | Code complete; enable with live Stripe keys |
| Phone/SIP UI | `PHONE_INTEGRATIONS_ENABLED` | Requires LiveKit Cloud SIP trunks |
| Public demo | `PUBLIC_DEMO_ENABLED` | Not built |
| Per-tenant provider keys | — | Platform env keys only |

## Ops checklist (not code)

1. Apply all DB migrations including `0005_phone_telephony.sql`
2. LiveKit Cloud project + outbound/inbound SIP trunks + webhook URL
3. Secrets Manager: `VOICE_AGENT_SERVICE_SECRET`, LiveKit keys, optional egress S3 IAM user
4. Set `PHONE_INTEGRATIONS_ENABLED=true` on staging/prod
5. Purchase/route DIDs; for Montenegro +382 inbound consider local operator SIP trunk
6. Enable `BILLING_ENABLED`, Resend, Google OAuth prod origins for paying customers

## E2E smoke tests

```bash
./run_local
pnpm --filter @montenegrina/web e2e
```

SIP/PSTN requires LiveKit Cloud — not testable on local Docker LiveKit alone.
