#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
. ./.env
set +a
. ./scripts/lib.sh

BASE_URL="${EVOLUTION_PUBLIC_URL:-http://localhost:${SERVER_PORT:-8080}}"
API_KEY="${EVOLUTION_API_KEY:-${AUTHENTICATION_API_KEY:-}}"
INSTANCE_NAME="${INSTANCE_NAME:-main}"
INSTANCE_TOKEN="${INSTANCE_TOKEN:-main-local-token}"
OWNER_NUMBER="${OWNER_NUMBER:-}"

if [ -z "$API_KEY" ]; then
  echo "Missing AUTHENTICATION_API_KEY in evolution/.env" >&2
  exit 1
fi

if [ -n "$OWNER_NUMBER" ]; then
  NUMBER_FIELD=", \"number\": \"$OWNER_NUMBER\""
else
  NUMBER_FIELD=""
fi

wait_for_evolution "$BASE_URL"

request_with_retry 5 2 curl -sS -X POST "$BASE_URL/instance/create" \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d "{
    \"instanceName\": \"$INSTANCE_NAME\",
    \"token\": \"$INSTANCE_TOKEN\",
    \"qrcode\": true,
    \"integration\": \"WHATSAPP-BAILEYS\",
    \"rejectCall\": true,
    \"msgCall\": \"Não consigo atender chamadas por aqui. Envie uma mensagem.\",
    \"groupsIgnore\": true,
    \"alwaysOnline\": true,
    \"readMessages\": true,
    \"readStatus\": true$NUMBER_FIELD
  }" | tee /tmp/talktostellar-evolution-create-instance.json

echo
echo "Instance requested: $INSTANCE_NAME"
echo "Next: ./scripts/connect-qr.sh"
