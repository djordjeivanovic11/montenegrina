#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/azure-lib.sh"
azure_load_env
azure_assert_login
azure_load_azd
azure_need CUSTOM_WEB_DOMAIN CUSTOM_API_DOMAIN SERVICE_WEB_NAME SERVICE_API_NAME AZURE_RESOURCE_GROUP
MODE="${1:---dns-only}"
ENV_ID="$(az containerapp show --name "$SERVICE_WEB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.managedEnvironmentId -o tsv)"
ENV_NAME="${ENV_ID##*/}"
VERIFY="$(az containerapp env show --name "$ENV_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.customDomainConfiguration.customDomainVerificationId -o tsv)"
WEB_FQDN="$(az containerapp show --name "$SERVICE_WEB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)"
API_FQDN="$(az containerapp show --name "$SERVICE_API_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)"
printf 'Create these records in GoDaddy:\n  voice CNAME %s\n  api.voice CNAME %s\n  asuid.voice TXT %s\n  asuid.api.voice TXT %s\n' "$WEB_FQDN" "$API_FQDN" "$VERIFY" "$VERIFY"
[[ "$MODE" == '--bind' ]] || exit 0

require_dns() {
  local host="$1" expected_cname="$2" asuid_host="$3"
  local cname txt
  cname="$(dig +short "$host" CNAME | sed 's/\.$//' | tail -n 1)"
  txt="$(dig +short "$asuid_host" TXT | tr -d '"' | tail -n 1)"
  [[ "$cname" == "$expected_cname" ]] || {
    echo "DNS is not ready for $host: expected CNAME $expected_cname, got ${cname:-<empty>}." >&2
    exit 1
  }
  [[ "$txt" == "$VERIFY" ]] || {
    echo "DNS ownership TXT is not ready for $asuid_host." >&2
    exit 1
  }
}

ensure_hostname() {
  local app="$1" host="$2"
  local binding
  binding="$(az containerapp hostname list \
    --name "$app" \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --query "[?name=='$host'].bindingType | [0]" \
    -o tsv)"
  if [[ -z "$binding" ]]; then
    az containerapp hostname add --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --hostname "$host" >/dev/null
    binding="Disabled"
  fi
  if [[ "$binding" != "SniEnabled" ]]; then
    az containerapp hostname bind \
      --name "$app" \
      --resource-group "$AZURE_RESOURCE_GROUP" \
      --environment "$ENV_NAME" \
      --hostname "$host" \
      --validation-method CNAME >/dev/null
  fi
  echo "$host is bound to $app with managed TLS."
}

require_dns "$CUSTOM_WEB_DOMAIN" "$WEB_FQDN" "asuid.voice.mne-mcp.com"
require_dns "$CUSTOM_API_DOMAIN" "$API_FQDN" "asuid.api.voice.mne-mcp.com"
ensure_hostname "$SERVICE_WEB_NAME" "$CUSTOM_WEB_DOMAIN"
ensure_hostname "$SERVICE_API_NAME" "$CUSTOM_API_DOMAIN"
