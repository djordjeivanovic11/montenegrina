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

read_or_default() {
  local key="$1" default="$2" value
  value="$(read_value "$key")"
  printf '%s' "${value:-$default}"
}

google_client_id="$(read_value GOOGLE_CLIENT_ID)"
public_google_client_id="$(read_value PUBLIC_GOOGLE_CLIENT_ID)"
google_client_id="${google_client_id:-$public_google_client_id}"
public_google_client_id="${public_google_client_id:-$google_client_id}"

umask 077
{
  printf 'AZURE_SUBSCRIPTION_ID=\nAZURE_LOCATION=northeurope\nAZURE_ENV_NAME=montenegrina-prod\n'
  printf 'POSTGRES_ADMIN_PASSWORD=%s\n' "$(openssl rand -base64 36 | tr -d '\n')Aa1!"
  printf 'SESSION_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')"
  printf 'INTERNAL_TOKEN_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')"
  printf 'VOICE_AGENT_SERVICE_SECRET=%s\n' "$(openssl rand -base64 48 | tr -d '\n')"
  printf 'OPENAI_MODEL=%s\n' "$(read_or_default OPENAI_MODEL gpt-5.4)"
  printf 'MNE_MCP_ENABLED=%s\n' "$(read_or_default MNE_MCP_ENABLED false)"
  printf 'MNE_MCP_API_URL=%s\n' "$(read_or_default MNE_MCP_API_URL https://api.mne-mcp.com)"
  printf 'MNE_MCP_API_KEY=%s\n' "$(read_value MNE_MCP_API_KEY)"
  printf 'OPENAI_REALTIME_MODEL=%s\n' "$(read_or_default OPENAI_REALTIME_MODEL gpt-realtime-2)"
  printf 'OPENAI_STT_MODEL=%s\n' "$(read_or_default OPENAI_STT_MODEL gpt-4o-transcribe)"
  printf 'OPENAI_TTS_MODEL=%s\n' "$(read_or_default OPENAI_TTS_MODEL gpt-4o-mini-tts)"
  printf 'OPENAI_TTS_VOICE=%s\n' "$(read_or_default OPENAI_TTS_VOICE ash)"
  printf 'VOICE_STT_PROVIDER=%s\n' "$(read_or_default VOICE_STT_PROVIDER openai)"
  printf 'VOICE_TTS_PROVIDER=%s\n' "$(read_or_default VOICE_TTS_PROVIDER elevenlabs)"
  for key in LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET OPENAI_API_KEY DEEPGRAM_API_KEY ELEVENLABS_API_KEY ELEVENLABS_MONTENEGRIN_VOICE_ID; do
    printf '%s=%s\n' "$key" "$(read_value "$key")"
  done
  printf 'GOOGLE_CLIENT_ID=%s\n' "$google_client_id"
  printf 'PUBLIC_GOOGLE_CLIENT_ID=%s\n' "$public_google_client_id"
  printf 'CUSTOM_WEB_DOMAIN=voice.mne-mcp.com\nCUSTOM_API_DOMAIN=api.voice.mne-mcp.com\n'
} >"$TARGET"
chmod 600 "$TARGET"
echo "Created .env.azure with fresh application secrets. Add the Azure subscription and Google OAuth client ID."
