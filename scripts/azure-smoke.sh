#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/azure-lib.sh"
azure_load_env
azure_assert_login
azure_load_azd
API_FQDN="$(az containerapp show --name "$SERVICE_API_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)"
WEB_FQDN="$(az containerapp show --name "$SERVICE_WEB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)"
curl -fsS "https://$API_FQDN/health/live" >/dev/null
curl -fsS "https://$API_FQDN/health/ready" >/dev/null
curl -fsS "https://$WEB_FQDN/" >/dev/null
echo "Azure default endpoints are live and ready."

if [[ "${VOICE_SMOKE:-0}" == "1" ]]; then
  command -v pnpm >/dev/null || { echo "pnpm is required for VOICE_SMOKE=1." >&2; exit 1; }
  E2E_BASE_URL="https://$WEB_FQDN" E2E_API_URL="https://$API_FQDN" \
    pnpm --filter @montenegrina/web e2e -- --grep "production voice MVP"
fi
