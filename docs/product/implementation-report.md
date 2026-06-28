# Montenegrina SaaS Implementation Report

Last updated: 2026-06-28.

## Completed

### Platform (Phase 0)
- Knowledge bases schema aligned with API (`knowledge_bases`, assignments, ingestion jobs)
- `POST /v1/auth/register` with automatic workspace bootstrap
- Google OAuth creates/links user and ensures personal workspace
- `GET /v1/auth/me` returns user, organizations, onboarding state
- Password reset flow (dev token logged locally)
- Voice runtime events persist to `transcript_segments`
- Migration journal reconciled; `0003_saas_platform.sql` added
- Audit logging on knowledge, onboarding, team, webhook mutations

### Marketing (Phase 1)
- Bilingual EN/CNR homepage at `/` with hero, use cases, how-it-works, knowledge, security, deployment, pricing, FAQ, CTA
- Language toggle in marketing header

### Auth (Phase 2)
- `/login`, `/signup` with email and Google
- Session bootstrap via `useSession` hook

### Onboarding (Phase 3)
- Seven-step wizard at `/onboarding`
- `PATCH /v1/organizations/:id/onboarding`

### Dashboard (Phases 4–7)
- App shell with Overview, Agents, Knowledge, Conversations, Integrations, Usage, Team, Billing, Settings
- Playground with browser voice and text at `/playground`
- Agent duplicate/archive API endpoints

### Team & integrations (Phase 8)
- Invitations and membership management (`/v1/team/*`)
- Communication channel stubs (browser active; phone providers coming soon)
- Webhook CRUD behind `WEBHOOKS_ENABLED`
- API keys (existing) with list/revoke patterns in settings

### Billing (Phase 9)
- Plans table seeded: Free, Pro, Business, Enterprise
- Entitlement enforcement on agent creation
- `/billing` page with plan comparison and usage summary
- `BILLING_ENABLED=false` — no Stripe checkout

### Security (Phase 10)
- Redis rate limits on auth and voice session creation
- Cross-tenant `assertTenant` unit tests
- Tenant isolation via org-scoped queries and composite FKs

### Provider abstraction (Phase 11)
- `packages/provider-core/src/channels.ts` — browser + stub phone channels
- DB models for channels, phone numbers, provider credentials

### QA (Phase 12)
- API and web typecheck pass
- Web production build passes
- API unit tests pass
- Documentation in `docs/product/saas-platform.md`

## Behind feature flags

| Feature | Flag | Status |
| --- | --- | --- |
| Stripe billing | `BILLING_ENABLED` | Schema + UI only |
| Phone/SIP/Twilio | `PHONE_INTEGRATIONS_ENABLED` | DB + disabled UI |
| Public anonymous demo | `PUBLIC_DEMO_ENABLED` | Not built |
| Per-tenant provider keys | — | Platform env keys only |

## Before accepting paying customers

1. Stripe Customer Portal and webhook handlers
2. Transactional email (invites, password reset)
3. Per-tenant provider credential resolution in voice runtime
4. Production SIP routing with runtime token dispatch
5. SOC2/DPA and data residency documentation
6. Load testing for concurrent voice sessions per org
