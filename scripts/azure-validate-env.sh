#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
source "$ROOT/scripts/azure-lib.sh"
azure_load_env
azure_need AZURE_LOCATION AZURE_ENV_NAME POSTGRES_ADMIN_PASSWORD SESSION_SECRET INTERNAL_TOKEN_SECRET VOICE_AGENT_SERVICE_SECRET LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET OPENAI_API_KEY DEEPGRAM_API_KEY ELEVENLABS_API_KEY ELEVENLABS_MONTENEGRIN_VOICE_ID GOOGLE_CLIENT_ID PUBLIC_GOOGLE_CLIENT_ID RESEND_API_KEY TURNSTILE_SECRET_KEY PUBLIC_TURNSTILE_SITE_KEY CUSTOM_WEB_DOMAIN CUSTOM_API_DOMAIN
[[ "$CUSTOM_WEB_DOMAIN" == 'voice.mne-mcp.com' ]] || { echo "Unexpected web domain." >&2; exit 1; }
[[ "$CUSTOM_API_DOMAIN" == 'api.voice.mne-mcp.com' ]] || { echo "Unexpected API domain." >&2; exit 1; }
[[ ${#POSTGRES_ADMIN_PASSWORD} -ge 16 && ${#SESSION_SECRET} -ge 32 && ${#INTERNAL_TOKEN_SECRET} -ge 32 ]] || { echo "Generated secrets are too short." >&2; exit 1; }
echo "Production environment is complete (values not printed)."
