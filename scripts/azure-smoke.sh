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
