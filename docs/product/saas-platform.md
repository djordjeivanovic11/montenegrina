# Montenegrina SaaS Platform

## Product surfaces

- **Marketing site** (`/`) — bilingual EN/CNR public homepage
- **Auth** (`/login`, `/signup`) — email and Google authentication
- **App** (`/overview`, `/agents`, `/knowledge`, etc.) — authenticated workspace dashboard
- **Onboarding** (`/onboarding`) — seven-step first-run wizard

## Workspace model

Users receive a personal workspace (`organizations` table) on signup. All agents, knowledge bases, conversations, API keys, and usage records are scoped by `organizationId` with composite foreign keys and API-layer filtering.

## Plans and entitlements

Plans: Free, Pro, Business, Enterprise (seeded). Quotas enforced on agent creation and visible on `/usage` and `/billing`.

## Feature flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `BILLING_ENABLED` | false | Stripe checkout (not implemented) |
| `PHONE_INTEGRATIONS_ENABLED` | false | SIP/Twilio UI |
| `WEBHOOKS_ENABLED` | true | Webhook CRUD |
| `PUBLIC_DEMO_ENABLED` | false | Anonymous homepage demo |

## Before accepting paying customers

- Stripe billing integration
- Per-tenant provider credentials
- Production email delivery for invites and password reset
- Phone/SIP routing
- SOC2 / DPA artifacts
