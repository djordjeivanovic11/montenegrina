#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/azure-lib.sh"
azure_load_env
azure_assert_login
azure_load_azd
azure_need AZURE_RESOURCE_GROUP AZURE_CONTAINER_REGISTRY_NAME AZURE_CONTAINER_REGISTRY_ENDPOINT SERVICE_WEB_NAME SERVICE_API_NAME SERVICE_WORKER_NAME SERVICE_VOICE_AGENT_NAME SERVICE_KNOWLEDGE_PARSER_NAME SERVICE_MIGRATION_JOB_NAME SERVICE_SEED_JOB_NAME
[[ -z "$(git -C "$ROOT" status --porcelain)" || "${ALLOW_DIRTY:-0}" == 1 ]] || { echo "Refusing to deploy a dirty worktree." >&2; exit 1; }
TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short=12 HEAD)}"
ACR="$AZURE_CONTAINER_REGISTRY_NAME"
LOGIN="$AZURE_CONTAINER_REGISTRY_ENDPOINT"

build() {
  local image="$1"
  local dockerfile="$2"
  shift 2
  az acr build --registry "$ACR" --platform linux/amd64 --image "$image:$TAG" --file "$dockerfile" "$@" "$ROOT"
}
build montenegrina-api apps/api/Dockerfile
build montenegrina-web apps/web/Dockerfile --build-arg "NEXT_PUBLIC_API_URL=https://api.voice.mne-mcp.com" --build-arg "NEXT_PUBLIC_LIVEKIT_URL=$LIVEKIT_URL" --build-arg "NEXT_PUBLIC_GOOGLE_CLIENT_ID=$PUBLIC_GOOGLE_CLIENT_ID" --build-arg "NEXT_PUBLIC_TURNSTILE_SITE_KEY=$PUBLIC_TURNSTILE_SITE_KEY"
build montenegrina-worker apps/worker/Dockerfile
build montenegrina-voice-agent apps/voice-agent/Dockerfile
build montenegrina-parser apps/knowledge-parser/Dockerfile
build montenegrina-ops apps/ops/Dockerfile

az containerapp job update --name "$SERVICE_MIGRATION_JOB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/montenegrina-ops:$TAG" >/dev/null
az containerapp job update --name "$SERVICE_SEED_JOB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/montenegrina-ops:$TAG" >/dev/null
azure_wait_job "$SERVICE_MIGRATION_JOB_NAME" "$AZURE_RESOURCE_GROUP"
azure_wait_job "$SERVICE_SEED_JOB_NAME" "$AZURE_RESOURCE_GROUP"

update_private() {
  local app="$1" image="$2" revision
  revision="$(az containerapp update --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/$image:$TAG" --revision-suffix "$TAG" --query properties.latestRevisionName -o tsv)"
  azure_wait_revision "$app" "$revision" "$AZURE_RESOURCE_GROUP"
}

update_public() {
  local app="$1" image="$2" revision
  revision="$(az containerapp update --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/$image:$TAG" --revision-suffix "$TAG" --query properties.latestRevisionName -o tsv)"
  azure_wait_revision "$app" "$revision" "$AZURE_RESOURCE_GROUP"
  az containerapp ingress traffic set --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --revision-weight "$revision=100" >/dev/null
}

update_private "$SERVICE_KNOWLEDGE_PARSER_NAME" montenegrina-parser
update_public "$SERVICE_API_NAME" montenegrina-api
update_private "$SERVICE_WORKER_NAME" montenegrina-worker
update_private "$SERVICE_VOICE_AGENT_NAME" montenegrina-voice-agent
update_public "$SERVICE_WEB_NAME" montenegrina-web
"$ROOT/scripts/azure-smoke.sh"
echo "Deployed immutable image tag $TAG"
