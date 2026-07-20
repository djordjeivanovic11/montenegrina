#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/azure-lib.sh"
azure_load_env
"$ROOT/scripts/azure-validate-env.sh"
azure_assert_login
[[ -z "${AZURE_SUBSCRIPTION_ID:-}" ]] || az account set --subscription "$AZURE_SUBSCRIPTION_ID"
if azd env list 2>/dev/null | awk 'NR>1 {print $1}' | grep -qx "$AZURE_ENV_NAME"; then azd env select "$AZURE_ENV_NAME"; else azd env new "$AZURE_ENV_NAME"; fi

: "${OPENAI_STT_MODEL:=gpt-4o-transcribe}"
: "${OPENAI_MODEL:=gpt-5.4-mini}"
: "${OPENAI_REALTIME_MODEL:=gpt-realtime-2}"
: "${OPENAI_TTS_MODEL:=gpt-4o-mini-tts}"
: "${OPENAI_TTS_VOICE:=ash}"
: "${VOICE_STT_PROVIDER:=openai}"
: "${VOICE_TTS_PROVIDER:=elevenlabs}"
: "${DEEPGRAM_API_KEY:=}"
: "${ELEVENLABS_API_KEY:=}"
: "${ELEVENLABS_MONTENEGRIN_VOICE_ID:=}"
if [[ -z "${GOOGLE_CLIENT_ID:-}" && -n "${PUBLIC_GOOGLE_CLIENT_ID:-}" ]]; then GOOGLE_CLIENT_ID="$PUBLIC_GOOGLE_CLIENT_ID"; fi
if [[ -z "${PUBLIC_GOOGLE_CLIENT_ID:-}" && -n "${GOOGLE_CLIENT_ID:-}" ]]; then PUBLIC_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID"; fi

for key in AZURE_LOCATION AZURE_ENV_NAME POSTGRES_ADMIN_PASSWORD SESSION_SECRET INTERNAL_TOKEN_SECRET VOICE_AGENT_SERVICE_SECRET LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET OPENAI_API_KEY OPENAI_MODEL OPENAI_REALTIME_MODEL OPENAI_STT_MODEL OPENAI_TTS_MODEL OPENAI_TTS_VOICE VOICE_STT_PROVIDER VOICE_TTS_PROVIDER DEEPGRAM_API_KEY ELEVENLABS_API_KEY ELEVENLABS_MONTENEGRIN_VOICE_ID GOOGLE_CLIENT_ID PUBLIC_GOOGLE_CLIENT_ID; do
  azd env set "$key" "${!key}"
done
azd env set AZURE_SUBSCRIPTION_ID "$(az account show --query id -o tsv)"
azd provision --no-prompt
