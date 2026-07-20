#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/azure-lib.sh"
azure_load_env
: "${OPENAI_MODEL:=gpt-5.4-mini}"
: "${OPENAI_REALTIME_MODEL:=gpt-realtime-2}"
: "${OPENAI_STT_MODEL:=gpt-4o-transcribe}"
: "${OPENAI_TTS_MODEL:=gpt-4o-mini-tts}"
: "${OPENAI_TTS_VOICE:=ash}"
: "${VOICE_STT_PROVIDER:=openai}"
: "${VOICE_TTS_PROVIDER:=elevenlabs}"
if [[ -z "${GOOGLE_CLIENT_ID:-}" && -n "${PUBLIC_GOOGLE_CLIENT_ID:-}" ]]; then GOOGLE_CLIENT_ID="$PUBLIC_GOOGLE_CLIENT_ID"; fi
if [[ -z "${PUBLIC_GOOGLE_CLIENT_ID:-}" && -n "${GOOGLE_CLIENT_ID:-}" ]]; then PUBLIC_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID"; fi
azure_need AZURE_LOCATION AZURE_ENV_NAME POSTGRES_ADMIN_PASSWORD SESSION_SECRET INTERNAL_TOKEN_SECRET VOICE_AGENT_SERVICE_SECRET LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET OPENAI_API_KEY GOOGLE_CLIENT_ID PUBLIC_GOOGLE_CLIENT_ID CUSTOM_WEB_DOMAIN CUSTOM_API_DOMAIN
[[ "$CUSTOM_WEB_DOMAIN" == 'voice.mne-mcp.com' ]] || { echo "Unexpected web domain." >&2; exit 1; }
[[ "$CUSTOM_API_DOMAIN" == 'api.voice.mne-mcp.com' ]] || { echo "Unexpected API domain." >&2; exit 1; }
[[ "$LIVEKIT_URL" == wss://*.livekit.cloud ]] || { echo "Azure production requires a LiveKit Cloud wss endpoint." >&2; exit 1; }
[[ "$PUBLIC_GOOGLE_CLIENT_ID" == "$GOOGLE_CLIENT_ID" ]] || { echo "Public and server Google client IDs must match." >&2; exit 1; }
[[ "$VOICE_STT_PROVIDER" == 'openai' || "$VOICE_STT_PROVIDER" == 'deepgram' ]] || { echo "VOICE_STT_PROVIDER must be openai or deepgram." >&2; exit 1; }
[[ "$VOICE_TTS_PROVIDER" == 'elevenlabs' || "$VOICE_TTS_PROVIDER" == 'openai' ]] || { echo "VOICE_TTS_PROVIDER must be elevenlabs or openai." >&2; exit 1; }
if [[ "$VOICE_STT_PROVIDER" == 'deepgram' ]]; then azure_need DEEPGRAM_API_KEY; fi
if [[ "$VOICE_TTS_PROVIDER" == 'elevenlabs' ]]; then azure_need ELEVENLABS_API_KEY ELEVENLABS_MONTENEGRIN_VOICE_ID; fi
[[ ${#POSTGRES_ADMIN_PASSWORD} -ge 16 && ${#SESSION_SECRET} -ge 32 && ${#INTERNAL_TOKEN_SECRET} -ge 32 ]] || { echo "Generated secrets are too short." >&2; exit 1; }
echo "Production environment is complete (values not printed)."
