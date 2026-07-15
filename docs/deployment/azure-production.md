# Azure production runbook

Montenegrina is deployed independently from MNE-MCP into `rg-montenegrina-prod`.

- Web: `https://voice.mne-mcp.com`
- API: `https://api.voice.mne-mcp.com`
- Azure environment: `montenegrina-prod`

The primary application stack runs in North Europe. Azure Managed Redis runs as an HA
`Balanced_B0` cache in Sweden Central because the subscription currently receives terminal
capacity failures for HA Managed Redis in North Europe. Its private endpoint remains in the
North Europe virtual network, and public network access is disabled after provisioning.

## External release inputs

Before provisioning, configure the existing Google OAuth client for `https://voice.mne-mcp.com` and put its client ID in the ignored `.env.azure` file. Azure production requires the existing LiveKit Cloud `wss://...livekit.cloud` endpoint and matching API credentials; local Docker LiveKit values are rejected. Never commit or paste secret values into command output.

GoDaddy must receive the CNAME and `asuid` TXT records printed by the domain script. Domain binding must not run until those records resolve publicly.

## Provision and deploy

```bash
./scripts/azure-prepare-env.sh
./scripts/azure-validate-env.sh
./scripts/azure-up.sh
./scripts/azure-deploy.sh
./scripts/azure-bind-domains.sh --dns-only
```

After the DNS records resolve:

```bash
./scripts/azure-bind-domains.sh --bind
./scripts/azure-smoke.sh
```

`azure-deploy.sh` uses the current Git SHA as an immutable image tag, builds in ACR, executes the migration and deterministic seed jobs, updates the five runtimes, and then runs smoke tests. It refuses a dirty worktree by default.

## Rollback

Select a previously healthy Git-SHA tag from ACR and run:

```bash
./scripts/azure-rollback.sh <known-good-image-tag>
```

The rollback creates new revisions using the known-good images and reruns readiness smoke tests. Database migrations must remain backward-compatible with the immediately preceding application revision.

## Production checks

Confirm both custom domains have valid TLS, `/health/live` and `/health/ready` return 200, and Google login creates a free workspace with a published starter agent. Complete one browser conversation and confirm it ends within five minutes, appears in monthly usage, and cannot exceed the free ten-minute allowance.

Blob containers, PostgreSQL, Redis, and Key Vault are private. Validate that recordings, phone/SIP, billing, anonymous demo, and local bootstrap administration remain disabled. Review the Log Analytics scheduled alerts for readiness, 5xx responses, restart loops, replica exhaustion, PostgreSQL/Redis failures, queue failures, and provider failures.
