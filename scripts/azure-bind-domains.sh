#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/azure-lib.sh"
azure_load_env
azure_assert_login
azure_load_azd
MODE="${1:---dns-only}"
ENV_ID="$(az containerapp show --name "$SERVICE_WEB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.managedEnvironmentId -o tsv)"
ENV_NAME="${ENV_ID##*/}"
VERIFY="$(az containerapp env show --name "$ENV_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.customDomainConfiguration.customDomainVerificationId -o tsv)"
WEB_FQDN="$(az containerapp show --name "$SERVICE_WEB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)"
API_FQDN="$(az containerapp show --name "$SERVICE_API_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)"
printf 'Create these records in GoDaddy:\n  voice CNAME %s\n  api.voice CNAME %s\n  asuid.voice TXT %s\n  asuid.api.voice TXT %s\n' "$WEB_FQDN" "$API_FQDN" "$VERIFY" "$VERIFY"
[[ "$MODE" == '--bind' ]] || exit 0
for spec in "$SERVICE_WEB_NAME:$CUSTOM_WEB_DOMAIN" "$SERVICE_API_NAME:$CUSTOM_API_DOMAIN"; do
  app="${spec%%:*}"; host="${spec#*:}"
  az containerapp hostname add --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --hostname "$host"
  az containerapp hostname bind --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --environment "$ENV_NAME" --hostname "$host" --validation-method CNAME
done
