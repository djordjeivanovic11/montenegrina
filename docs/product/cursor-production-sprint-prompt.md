# Cursor Agent Prompt — Montenegrina Production Sprint (Highest ROI)

Copy everything below the line into Cursor Agent (Composer). Use **one workstream per agent session** for parallel execution. Do not edit this plan file unless updating the sprint itself.

---

## MASTER PROMPT (paste this first)

You are implementing the **highest-ROI production readiness sprint** for **Montenegrina** — a pnpm/turbo monorepo SaaS voice + knowledge platform for Montenegro (bilingual EN/CNR).

### Repository map

| Area | Path |
| --- | --- |
| API (NestJS + Fastify) | `apps/api/src/` |
| Web (Next.js App Router) | `apps/web/app/` |
| Worker (ingestion, jobs) | `apps/worker/src/` |
| Voice agent (Python LiveKit) | `apps/voice-agent/` |
| Database schema + migrations | `packages/database/` |
| Shared config/env schema | `packages/config/src/index.ts` |
| OpenAPI contracts | `packages/contracts/openapi/openapi.yaml` |
| AWS deploy | `infra/terraform/aws/`, `./deploy`, `.env.deploy.example` |
| Local dev | `./run_local`, `compose.yaml` |
| Product docs | `docs/product/` |

### What already works (do NOT rebuild)

- Multi-tenant org model, composite FKs, session auth + CSRF, Google ID-token login
- Register/login/signup, 7-step onboarding (incl. knowledge upload step 5), dashboard shell
- Knowledge bases CRUD, bulk upload, ingestion pipeline, scoped retrieval
- Agents CRUD, playground voice+text, plans/entitlements schema (Free/Pro/Business/Enterprise seeded)
- Team invitations API + UI (but **no email sent** — token returned in API response)
- Password reset API (but **token logged to stdout in dev only**, **no web UI**)
- Rate limits on auth, audit logging hooks, `./deploy` + Terraform skeleton
- `./run_local` Docker stack

### Hard rules for all agents

1. **Minimize scope** — smallest correct diff; no drive-by refactors
2. **Match existing patterns** — NestJS modules, `ApiException`, Drizzle, `apiHeaders()`, `useI18n`, CSS vars in `globals.css`
3. **Do not edit** `docs/product/cursor-production-sprint-prompt.md` unless explicitly updating the sprint
4. **Do not commit** unless the user asks
5. **Tenant isolation** — every query must filter by `organizationId`; use `assertTenant` patterns from `apps/api/src/tenant.test.ts`
6. **Migrations** — if schema changes: add SQL in `packages/database/migrations/`, update `meta/_journal.json`, run typecheck
7. **Env vars** — add to `packages/config/src/index.ts`, `.env.example`, and document in `docs/product/saas-platform.md` if user-facing
8. **Verification before done**: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` (at least affected packages), and note if `./run_local` rebuild needed
9. **OpenAPI** — if API surface changes: update `packages/contracts/openapi/openapi.yaml`, run `pnpm openapi:generate` and `pnpm sdk:generate`
10. **No secrets in code** — use env only; never commit real keys

### Sprint goal

Make Montenegrina **usable by strangers on a production domain** (free tier beta), with a path to paid plans. Prioritize work **coding agents can complete without manual AWS console clicks** — but include deploy/env wiring agents can do in-repo.

### Execution order (dependency-aware)

```
Wave 1 (parallel):  WS-A Email  |  WS-B Auth UI  |  WS-C Quota enforcement  |  WS-D CI
Wave 2 (parallel):  WS-E E2E tests  |  WS-F Legal pages  |  WS-G Webhook delivery
Wave 3 (parallel):  WS-H Stripe  |  WS-I Deploy env wiring  |  WS-J Observability hooks
```

Start your session by stating which **Workstream ID** you are implementing, then execute fully including tests and docs updates for that stream only.

---

## WS-A — Transactional email (CRITICAL)

**ROI:** Unblocks password reset, team invites, and any future billing emails. Currently broken for real users.

### Current state

- `apps/api/src/security/session.service.ts` → `forgotPassword()` writes token to stdout in development only
- `apps/api/src/team/invitations.service.ts` → `create()` returns `{ inviteToken: token }` in API response — must not leak in production
- No email provider integrated
- Team UI (`apps/web/app/(app)/team/page.tsx`) shows "Invitation sent" but nothing is emailed

### Implement

1. Create `packages/email/` (or `apps/api/src/email/`) with:
   - `EmailService` interface: `sendPasswordReset`, `sendTeamInvitation`, `sendWelcome` (optional stub)
   - Provider: **Resend** preferred (simple HTTP API); fallback **console/log provider** when `EMAIL_PROVIDER=console` or missing API key in development
2. Add env to `packages/config/src/index.ts`:
   - `EMAIL_PROVIDER`: `console` | `resend` (default `console` in dev)
   - `RESEND_API_KEY` (optional)
   - `EMAIL_FROM` (e.g. `Montenegrina <noreply@montenegrina.me>`)
   - `PUBLIC_WEB_URL` (e.g. `http://localhost:3000`) for link building in emails
3. HTML + plain-text templates (minimal, bilingual not required yet — English OK with CNR footer line)
4. Wire:
   - `SessionService.forgotPassword` → send email with link `${PUBLIC_WEB_URL}/reset-password?token=${token}`
   - `InvitationsService.create` → send email with link `${PUBLIC_WEB_URL}/invite/accept?token=${token}`
   - **Remove `inviteToken` from production API responses**; keep `devToken`/`devInviteLink` only when `NODE_ENV=development`
5. Register `EmailModule` in `apps/api/src/app.module.ts`
6. Unit tests with mocked provider

### Acceptance criteria

- [ ] Forgot-password sends email (or logs full link in console mode)
- [ ] Team invite sends email (or logs full link in console mode)
- [ ] Production response for invite create does NOT include raw token
- [ ] `.env.example` updated
- [ ] `pnpm --filter @montenegrina/api test:unit` passes

---

## WS-B — Auth UI gaps (CRITICAL)

**ROI:** Users cannot reset passwords or accept invites in the browser today.

### Missing pages

- `/forgot-password` — form POST `/v1/auth/forgot-password`
- `/reset-password?token=` — form POST `/v1/auth/reset-password`
- `/invite/accept?token=` — if logged in POST `/v1/team/invitations/accept`; if not, redirect to signup/login with return URL

### Implement

1. Add routes under `apps/web/app/(auth)/`:
   - `forgot-password/page.tsx`
   - `reset-password/page.tsx` (read `token` from searchParams)
   - `invite/accept/page.tsx`
2. Add links from login page (`apps/web/app/(auth)/login/page.tsx`) → "Forgot password?"
3. i18n strings in `apps/web/app/lib/i18n/en.json` and `cnr.json`
4. Use existing `AuthForm` / `page-shell` styling patterns
5. Handle Google-only users on forgot-password (show message: use Google sign-in)

### Acceptance criteria

- [ ] Full flow works locally: forgot → dev token/link → reset → login
- [ ] Invite accept works for logged-in user with matching email
- [ ] `pnpm --filter @montenegrina/web typecheck` passes

---

## WS-C — Entitlements enforcement everywhere (HIGH)

**ROI:** Prevents free-tier abuse before public beta; required before Stripe.

### Current state

- `apps/api/src/billing/entitlements.service.ts` — `assertWithinLimit` exists
- Agent creation already gated (verify in `agents.service.ts`)
- **NOT gated:** document upload, team invites, voice session creation, knowledge base count

### Implement

Call `entitlements.assertWithinLimit(organizationId, metric, increment)` at:

| Action | Metric | File(s) to update |
| --- | --- | --- |
| Create document / bulk upload | `DOCUMENTS` | `apps/api/src/knowledge/knowledge.service.ts` |
| Invite member (pending + active seats) | `TEAM_MEMBERS` | `apps/api/src/team/invitations.service.ts` |
| Create voice session | `VOICE_MINUTES` | provider/session controller (find via grep `sessions` + LiveKit) |
| Create knowledge base | new or `DOCUMENTS` | `knowledge-bases.service.ts` if plan limits bases |

Also:

1. Return `429` with `QUOTA_EXCEEDED` and `{ metric, limit, current }` in details (already in ApiException)
2. Web: show quota errors on upload, team invite, agent create — map `QUOTA_EXCEEDED` in `api-client.ts` error helper
3. Usage page (`apps/web/app/(app)/usage/page.tsx`) — verify it reflects live counts (fix if stale)
4. Unit tests for at least document + team limit paths

### Acceptance criteria

- [ ] Upload blocked when document quota exceeded (test with seeded Free plan limits)
- [ ] Invite blocked when team quota exceeded
- [ ] UI shows human-readable quota message (CNR + EN)
- [ ] API unit tests added

---

## WS-D — CI pipeline (HIGH)

**ROI:** Prevents regressions (Google login, migrations, type errors) from merging.

### Implement

Create `.github/workflows/ci.yml`:

```yaml
# On push + PR to main:
# - pnpm install --frozen-lockfile
# - pnpm lint
# - pnpm typecheck
# - pnpm test:unit
# - pnpm --filter @montenegrina/web build
# - docker compose config --quiet
# Optional: validate openapi (pnpm contracts:check)
```

Use Node 24, pnpm cache, turbo cache if straightforward.

### Acceptance criteria

- [ ] Workflow file valid YAML
- [ ] Document in `docs/product/saas-platform.md` under "Development" (brief)

---

## WS-E — E2E smoke tests (HIGH)

**ROI:** Catches broken auth, onboarding, upload flows automatically.

### Implement

1. Add `apps/web/e2e/` with Playwright
2. Script in root or web package: `pnpm --filter @montenegrina/web e2e`
3. Tests (run against `PUBLIC_API_URL` + web dev server or docker):
   - **Smoke 1:** Register → lands on onboarding step 1
   - **Smoke 2:** Login with seeded admin (from seed) → overview
   - **Smoke 3:** API health `GET /health/live` = 200
4. Use env `E2E_BASE_URL`, `E2E_API_URL`; skip in CI if no services (or use docker-compose job later)

Keep tests **minimal and stable** — no voice/LiveKit in v1.

### Acceptance criteria

- [ ] At least 2 passing Playwright tests locally
- [ ] README note in `docs/product/implementation-report.md`

---

## WS-F — Legal & trust pages (MEDIUM, fast)

**ROI:** Required before public signup; pure frontend.

### Implement

1. `apps/web/app/(marketing)/terms/page.tsx`
2. `apps/web/app/(marketing)/privacy/page.tsx`
3. Footer links in `apps/web/app/components/marketing/marketing-shell.tsx`
4. Signup checkbox or line: "By signing up you agree to Terms and Privacy" with links
5. Placeholder content structured with headings (not lorem ipsum — real sections: data collected, AI providers, retention days from env docs, contact email placeholder)

### Acceptance criteria

- [ ] Pages render at `/terms` and `/privacy`
- [ ] Linked from marketing footer and signup

---

## WS-G — Webhook delivery worker (MEDIUM)

**ROI:** Integrations are half-built — CRUD exists, nothing delivers.

### Current state

- `apps/api/src/integrations/integrations.controller.ts` — webhook CRUD only
- `packages/database` — `webhook_endpoints` table
- No delivery, no signing, no retries

### Implement

1. Outbox or direct queue: on key events (`agent.published`, `document.ready`, `conversation.completed`) enqueue webhook deliveries
2. Worker processor in `apps/worker/src/webhook-delivery.ts`:
   - HMAC-SHA256 signature header `X-Montenegrina-Signature`
   - Retry with backoff (3 attempts)
   - Log failures to audit or new `webhook_deliveries` table (optional — keep minimal)
3. Hook at least **one event** end-to-end: `document.ready` after ingestion completes in `apps/worker/src/document-processor.ts`
4. Feature flag `WEBHOOKS_ENABLED` already exists — respect it

### Acceptance criteria

- [ ] POST to customer URL on document READY
- [ ] Signature verifiable documented in `docs/product/saas-platform.md`
- [ ] Unit test for signing helper

---

## WS-H — Stripe billing (MEDIUM — do after WS-A/C)

**ROI:** Revenue; schema + UI exist, checkout missing.

### Current state

- `apps/api/src/billing/billing.controller.ts` — `upgrade-request` stub
- `BILLING_ENABLED` flag in config (default false)
- `organization_subscriptions`, `plans` tables seeded

### Implement

1. Add `stripe` to `apps/api`
2. Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_BUSINESS` (or lookup by plan slug in seed/metadata)
3. Endpoints:
   - `POST /v1/billing/checkout` → Stripe Checkout Session (mode subscription)
   - `POST /v1/billing/portal` → Customer Portal session
   - `POST /v1/billing/stripe/webhook` (public, raw body) — sync subscription status to `organization_subscriptions`
4. Web `/billing` page: when `billingEnabled`, show "Upgrade" buttons → checkout
5. Map Stripe customer to org (store `stripeCustomerId` on org or subscription — migration if needed)
6. Idempotent webhook handling

### Acceptance criteria

- [ ] Test mode checkout creates session URL
- [ ] Webhook `checkout.session.completed` activates plan
- [ ] `BILLING_ENABLED=true` gates UI; false keeps "contact us" fallback
- [ ] OpenAPI updated

**Do NOT** implement invoicing PDFs or tax in this sprint.

---

## WS-I — Production deploy env wiring (MEDIUM)

**ROI:** `./deploy` exists but missing SaaS env vars added recently.

### Implement

1. Update `.env.deploy.example`:
   - `PUBLIC_WEB_URL`, `PUBLIC_API_URL`
   - `PUBLIC_GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`
   - `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`
   - `CORS_ORIGINS`
   - Optional Stripe keys
2. Update `infra/terraform/aws/ecs.tf` / secrets locals to pass new env vars to api + web tasks
3. Update `deploy` script if it builds web with `NEXT_PUBLIC_*` args (mirror `compose.yaml` web build args)
4. Document production Google OAuth origins checklist in `docs/product/saas-platform.md`

### Acceptance criteria

- [ ] All new config keys documented
- [ ] Web Docker build receives `NEXT_PUBLIC_GOOGLE_CLIENT_ID` at build time
- [ ] `terraform validate` passes (if terraform installed)

---

## WS-J — Observability & health (LOWER but quick wins)

### Implement

1. Enrich `GET /health/ready` (`apps/api/src/health/health.controller.ts`):
   - Postgres ping, Redis ping, S3/MinIO head bucket
   - Return `{ ok, checks: { postgres, redis, storage } }`
2. Add Sentry optional integration (`SENTRY_DSN` env) — API + web client — behind flag, no-op if unset
3. Structured log field `organizationId` on authenticated requests (if not already)

### Acceptance criteria

- [ ] `/health/ready` fails if postgres down
- [ ] Env documented

---

## Explicitly OUT OF SCOPE for this sprint

Do not start these unless a workstream above is fully done and user asks:

- Google Drive import (separate OAuth + token storage)
- Phone/SIP/Twilio routing (`COMING_SOON` channels)
- Per-tenant provider credentials (BYOK) — large project
- SOC2 / formal compliance
- Public anonymous demo (`PUBLIC_DEMO_ENABLED`)
- SSO/SAML
- Full i18n pass on every string
- Load testing infrastructure

---

## Verification checklist (run after all waves)

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm --filter @montenegrina/web build
docker compose down -v && ./run_local   # migrations + full stack
```

Manual smoke:

1. Register new user → onboarding → upload PDF on step 5 → continue → overview
2. Forgot password → email/console link → reset → login
3. Invite teammate → email/console link → accept
4. Hit document quota on Free plan → clear error
5. Google login on localhost (with `.env` client IDs set)

---

## Sub-prompt templates (one agent per session)

### Template

```
Implement Workstream WS-{LETTER} from docs/product/cursor-production-sprint-prompt.md.

Read the workstream section fully. Explore related files first. Implement completely including tests and .env.example updates. Run pnpm typecheck and pnpm test:unit for affected packages. Summarize changes and how to verify manually.

Do not implement other workstreams. Do not edit the sprint prompt file.
```

### Example parallel launch (5 agents)

1. `Implement WS-A (Transactional email)...`
2. `Implement WS-B (Auth UI gaps)...`
3. `Implement WS-C (Entitlements enforcement)...`
4. `Implement WS-D (CI pipeline)...`
5. `Implement WS-F (Legal pages)...`

After Wave 1 merges: WS-E, WS-G, WS-H, WS-I, WS-J.

---

## Notes for orchestrator (human)

- **Highest ROI first:** WS-A + WS-B + WS-C in parallel → immediately fixes "real user" blockers
- **Stripe (WS-H)** depends on stable quotas (WS-C) and email (WS-A) for receipts later
- **Merge conflicts** likely in `app.module.ts`, `packages/config`, i18n JSON — assign one agent to reconcile or merge sequentially
- Rebuild **web Docker image** after any `NEXT_PUBLIC_*` change
- Rebuild **api** container after email/env changes
- Google production: add `https://app.yourdomain.com` to OAuth origins before beta launch
