#!/usr/bin/env bash
set -euo pipefail
[[ $# -eq 1 ]] || { echo "Usage: $0 <known-good-image-tag>" >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/azure-lib.sh"
azure_load_env; azure_assert_login; azure_load_azd
TAG="$1"
LOGIN="$AZURE_CONTAINER_REGISTRY_ENDPOINT"

rollback_private() {
  local app="$1" image="$2" revision
  revision="$(az containerapp update --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/$image:$TAG" --revision-suffix "rollback-$TAG" --query properties.latestRevisionName -o tsv)"
  azure_wait_revision "$app" "$revision" "$AZURE_RESOURCE_GROUP"
}

rollback_public() {
  local app="$1" image="$2" revision
  revision="$(az containerapp update --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/$image:$TAG" --revision-suffix "rollback-$TAG" --query properties.latestRevisionName -o tsv)"
  azure_wait_revision "$app" "$revision" "$AZURE_RESOURCE_GROUP"
}

rollback_private "$SERVICE_KNOWLEDGE_PARSER_NAME" montenegrina-parser
rollback_public "$SERVICE_API_NAME" montenegrina-api
rollback_private "$SERVICE_WORKER_NAME" montenegrina-worker
rollback_private "$SERVICE_VOICE_AGENT_NAME" montenegrina-voice-agent
rollback_public "$SERVICE_WEB_NAME" montenegrina-web
"$ROOT/scripts/azure-smoke.sh"
