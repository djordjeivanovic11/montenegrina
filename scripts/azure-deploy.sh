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
RAW_REVISION_SUFFIX="${REVISION_SUFFIX:-r-$TAG}"
REVISION_SUFFIX_BASE="$(printf '%s' "$RAW_REVISION_SUFFIX" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9-]+/-/g; s/^-+//; s/-+$//')"
[[ -n "$REVISION_SUFFIX_BASE" ]] || REVISION_SUFFIX_BASE="r-$(git -C "$ROOT" rev-parse --short=12 HEAD)"

: "${OPENAI_MODEL:=gpt-5.4}"
: "${OPENAI_REALTIME_MODEL:=gpt-realtime-2}"
: "${OPENAI_STT_MODEL:=gpt-4o-transcribe}"
: "${OPENAI_TTS_MODEL:=gpt-4o-mini-tts}"
: "${OPENAI_TTS_VOICE:=ash}"
: "${VOICE_STT_PROVIDER:=openai}"
: "${VOICE_TTS_PROVIDER:=elevenlabs}"
: "${RATE_LIMIT_VOICE_SESSIONS_PER_HOUR:=60}"
: "${MNE_MCP_ENABLED:=false}"
: "${MNE_MCP_API_URL:=https://api.mne-mcp.com}"
: "${ACR_BUILD_CLIENT_TIMEOUT_SECONDS:=1800}"
if [[ "$MNE_MCP_ENABLED" == 'true' ]]; then
  azure_need MNE_MCP_API_KEY MNE_MCP_API_URL
  [[ "$MNE_MCP_API_URL" == https://* ]] || { echo "MNE_MCP_API_URL must use HTTPS." >&2; exit 1; }
elif [[ "$MNE_MCP_ENABLED" != 'false' ]]; then
  echo "MNE_MCP_ENABLED must be true or false." >&2
  exit 1
fi

runtime_env_args=(
  --set-env-vars
  "OPENAI_MODEL=$OPENAI_MODEL"
  "OPENAI_REALTIME_MODEL=$OPENAI_REALTIME_MODEL"
  "OPENAI_STT_MODEL=$OPENAI_STT_MODEL"
  "OPENAI_TTS_MODEL=$OPENAI_TTS_MODEL"
  "OPENAI_TTS_VOICE=$OPENAI_TTS_VOICE"
  "VOICE_STT_PROVIDER=$VOICE_STT_PROVIDER"
  "VOICE_TTS_PROVIDER=$VOICE_TTS_PROVIDER"
  "RATE_LIMIT_VOICE_SESSIONS_PER_HOUR=$RATE_LIMIT_VOICE_SESSIONS_PER_HOUR"
)

api_runtime_env_args=(
  "${runtime_env_args[@]}"
  "MNE_MCP_ENABLED=$MNE_MCP_ENABLED"
  "MNE_MCP_API_URL=$MNE_MCP_API_URL"
  "MNE_MCP_TIMEOUT_MS=1200"
  "MNE_MCP_CACHE_TTL_SECONDS=60"
)

build() {
  local image="$1"
  local dockerfile="$2"
  local attempt pid started elapsed status
  shift 2
  if [[ "${REUSE_EXISTING_IMAGES:-0}" == 1 ]] && az acr repository show --name "$ACR" --image "$image:$TAG" >/dev/null 2>&1; then
    echo "Reusing existing image $LOGIN/$image:$TAG"
    return 0
  fi
  for attempt in 1 2 3; do
    az acr build --registry "$ACR" --platform linux/amd64 --image "$image:$TAG" --file "$dockerfile" "$@" "$ROOT" &
    pid="$!"
    started="$(date +%s)"
    status=0
    while kill -0 "$pid" 2>/dev/null; do
      sleep 5
      elapsed="$(($(date +%s) - started))"
      if (( elapsed > ACR_BUILD_CLIENT_TIMEOUT_SECONDS )); then
        echo "ACR build timed out for $image after ${ACR_BUILD_CLIENT_TIMEOUT_SECONDS}s." >&2
        kill "$pid" 2>/dev/null || true
        wait "$pid" 2>/dev/null || true
        status=124
        break
      fi
    done
    if [[ "$status" == 0 ]]; then
      wait "$pid" || status="$?"
    fi
    if [[ "$status" == 0 ]]; then
      return 0
    fi
    if [[ "$attempt" == 3 ]]; then
      echo "ACR build failed for $image after $attempt attempts." >&2
      return 1
    fi
    echo "ACR build failed for $image, retrying in $((attempt * 15)) seconds..." >&2
    sleep $((attempt * 15))
  done
}

revision_suffix_for() {
  local app="$1" max suffix
  max=$((54 - ${#app} - 2))
  if (( max < 1 )); then
    echo "Container app name is too long for revisions: $app" >&2
    exit 1
  fi
  suffix="${REVISION_SUFFIX_BASE:0:max}"
  suffix="${suffix%-}"
  [[ -n "$suffix" ]] || suffix="r"
  printf '%s' "$suffix"
}

build montenegrina-api apps/api/Dockerfile
build montenegrina-web apps/web/Dockerfile --build-arg "NEXT_PUBLIC_API_URL=https://api.voice.mne-mcp.com" --build-arg "NEXT_PUBLIC_LIVEKIT_URL=$LIVEKIT_URL" --build-arg "NEXT_PUBLIC_GOOGLE_CLIENT_ID=$PUBLIC_GOOGLE_CLIENT_ID"
build montenegrina-worker apps/worker/Dockerfile
build montenegrina-voice-agent apps/voice-agent/Dockerfile
build montenegrina-parser apps/knowledge-parser/Dockerfile
build montenegrina-ops apps/ops/Dockerfile

az containerapp job update --name "$SERVICE_MIGRATION_JOB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/montenegrina-ops:$TAG" >/dev/null
az containerapp job update --name "$SERVICE_SEED_JOB_NAME" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/montenegrina-ops:$TAG" >/dev/null
azure_wait_job "$SERVICE_MIGRATION_JOB_NAME" "$AZURE_RESOURCE_GROUP"
azure_wait_job "$SERVICE_SEED_JOB_NAME" "$AZURE_RESOURCE_GROUP"

update_private() {
  local app="$1" image="$2" revision revision_suffix
  shift 2
  revision_suffix="$(revision_suffix_for "$app")"
  revision="$(az containerapp update --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/$image:$TAG" --revision-suffix "$revision_suffix" "$@" --query properties.latestRevisionName -o tsv)"
  azure_wait_revision "$app" "$revision" "$AZURE_RESOURCE_GROUP"
}

update_public() {
  local app="$1" image="$2" revision revision_suffix
  shift 2
  revision_suffix="$(revision_suffix_for "$app")"
  revision="$(az containerapp update --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --image "$LOGIN/$image:$TAG" --revision-suffix "$revision_suffix" "$@" --query properties.latestRevisionName -o tsv)"
  azure_wait_revision "$app" "$revision" "$AZURE_RESOURCE_GROUP"
  az containerapp ingress traffic set --name "$app" --resource-group "$AZURE_RESOURCE_GROUP" --revision-weight "$revision=100" >/dev/null
}

update_private "$SERVICE_KNOWLEDGE_PARSER_NAME" montenegrina-parser
update_public "$SERVICE_API_NAME" montenegrina-api "${api_runtime_env_args[@]}"
update_private "$SERVICE_WORKER_NAME" montenegrina-worker "${runtime_env_args[@]}"
update_private "$SERVICE_VOICE_AGENT_NAME" montenegrina-voice-agent "${runtime_env_args[@]}"
update_public "$SERVICE_WEB_NAME" montenegrina-web
if [[ "${BIND_CUSTOM_DOMAINS:-1}" == "1" ]]; then
  "$ROOT/scripts/azure-bind-domains.sh" --bind
fi
"$ROOT/scripts/azure-smoke.sh"
echo "Deployed immutable image tag $TAG"
