#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/.env.azure"
SOURCE="$ROOT/.env"
[[ -f "$SOURCE" ]] || { echo "Missing local .env" >&2; exit 1; }
[[ ! -e "$TARGET" ]] || { echo "$TARGET already exists; leaving it unchanged."; exit 0; }

read_value() {
  local key="$1"
  sed -n "s/^${key}=//p" "$SOURCE" | tail -n 1
}

umask 077
{
  printf 'AZURE_SUBSCRIPTION_ID=\nAZURE_LOCATION=northeurope\nAZURE_ENV_NAME=montenegrina-prod\n'
  printf 'POSTGRES_ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 36 | tr -d '\n')Aa1!"
  printf 'SESSION_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')"
  printf 'INTERNAL_TOKEN_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')"
  printf 'VOICE_AGENT_SERVICE_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')"
  for key in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET OPENAI_API_KEY DEEPGRAM_API_KEY ELEVENLABS_API_KEY ELEVENLABS_MONTENEGRIN_VOICE_ID GOOGLE_CLIENT_ID PUBLIC_GOOGLE_CLIENT_ID; do
    printf '%s=%s\n' "$key" "$(read_value "$key")"
  done
  printf 'RESEND_API_KEY=\nTURNSTILE_SECRET_KEY=\nPUBLIC_TURNSTILE_SITE_KEY=\n'
  printf 'CUSTOM_WEB_DOMAIN=voice.mne-mcp.com\nCUSTOM_API_DOMAIN=api.voice.mne-mcp.com\n'
} >"$TARGET"
chmod 600 "$TARGET"
echo "Created .env.azure with fresh application secrets. Add Azure subscription, Resend, and Turnstile values."
