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

assert_real_revision() {
  local app="$1" latest ready image
  latest="$(az containerapp show --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.latestRevisionName -o tsv)"
  ready="$(az containerapp show --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.latestReadyRevisionName -o tsv)"
  image="$(az containerapp show --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.template.containers[0].image -o tsv)"
  [[ "$latest" == "$ready" ]] || { echo "$app latest revision is not ready: latest=$latest ready=$ready" >&2; exit 1; }
  [[ "$image" != 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest' ]] || { echo "$app is still using the Azure hello-world placeholder image." >&2; exit 1; }
}

for app in "$SERVICE_WEB_NAME" "$SERVICE_API_NAME" "$SERVICE_WORKER_NAME" "$SERVICE_VOICE_AGENT_NAME" "$SERVICE_KNOWLEDGE_PARSER_NAME"; do
  assert_real_revision "$app"
done

api_live="$(curl -fsS "https://$API_FQDN/health/live")"
api_ready="$(curl -fsS "https://$API_FQDN/health/ready")"
openapi="$(curl -fsS "https://$API_FQDN/openapi.yaml")"
web_html="$(curl -fsS "https://$WEB_FQDN/")"
[[ "$api_live" == *'"status":"ok"'* ]] || { echo "API live health did not return ok." >&2; exit 1; }
[[ "$api_ready" == *'"status":"ok"'* ]] || { echo "API ready health did not return ok." >&2; exit 1; }
[[ "$openapi" == openapi:* ]] || { echo "API OpenAPI document was not served." >&2; exit 1; }
[[ "$web_html" == *'_next/static'* ]] || { echo "Web app did not serve a Next.js page." >&2; exit 1; }
echo "Azure default endpoints are live and ready."

if [[ -n "${CUSTOM_WEB_DOMAIN:-}" && -n "${CUSTOM_API_DOMAIN:-}" ]]; then
  custom_api_live="$(curl -fsS "https://$CUSTOM_API_DOMAIN/health/live")"
  custom_api_ready="$(curl -fsS "https://$CUSTOM_API_DOMAIN/health/ready")"
  custom_web_html="$(curl -fsS "https://$CUSTOM_WEB_DOMAIN/")"
  [[ "$custom_api_live" == *'"status":"ok"'* ]] || { echo "Custom API live health did not return ok." >&2; exit 1; }
  [[ "$custom_api_ready" == *'"status":"ok"'* ]] || { echo "Custom API ready health did not return ok." >&2; exit 1; }
  [[ "$custom_web_html" == *'_next/static'* ]] || { echo "Custom web app did not serve a Next.js page." >&2; exit 1; }
  echo "Azure custom domains are live and ready."
fi

if [[ "${VOICE_SMOKE:-0}" == "1" ]]; then
  command -v pnpm >/dev/null || { echo "pnpm is required for VOICE_SMOKE=1." >&2; exit 1; }
  E2E_BASE_URL="https://$WEB_FQDN" E2E_API_URL="https://$API_FQDN" \
    pnpm --filter @montenegrina/web e2e -- --grep "production voice MVP"
fi
