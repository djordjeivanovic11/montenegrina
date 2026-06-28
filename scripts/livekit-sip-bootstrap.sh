#!/usr/bin/env bash
# LiveKit SIP bootstrap examples (requires LiveKit CLI: lk)
# https://docs.livekit.io/sip/
set -euo pipefail

: "${LIVEKIT_URL:?Set LIVEKIT_URL (https://your-project.livekit.cloud)}"
: "${LIVEKIT_API_KEY:?Set LIVEKIT_API_KEY}"
: "${LIVEKIT_API_SECRET:?Set LIVEKIT_API_SECRET}"

echo "Create outbound trunk (Twilio example — replace address and numbers):"
cat <<'EOF'
lk sip outbound create \
  --name montenegrina-outbound \
  --address your-subdomain.pstn.twilio.com \
  --numbers +15551234567 \
  --auth-user YOUR_TWILIO_USER \
  --auth-pass YOUR_TWILIO_PASS
EOF

echo ""
echo "Create inbound trunk:"
cat <<'EOF'
lk sip inbound create \
  --name montenegrina-inbound \
  --numbers +15551234567
EOF

echo ""
echo "Create platform inbound dispatch rule (individual rooms → montenegrina-voice):"
cat <<'EOF'
lk sip dispatch create \
  --name montenegrina-inbound-default \
  --trunks ST_INBOUND_TRUNK_ID \
  --individual-prefix inbound- \
  --room-agent montenegrina-voice \
  --room-agent-metadata '{"mode":"inbound"}'
EOF

echo ""
echo "Register LiveKit webhook in Cloud dashboard:"
echo "  POST https://YOUR_API_HOST/webhooks/livekit"
echo "  Events: participant_left, room_finished, egress_ended"
