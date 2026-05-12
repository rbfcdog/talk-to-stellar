#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
set -a
. ./.env
set +a

BASE_URL="${EVOLUTION_PUBLIC_URL:-http://localhost:${SERVER_PORT:-8080}}"
API_KEY="${EVOLUTION_API_KEY:-${AUTHENTICATION_API_KEY:-}}"
INSTANCE_NAME="${INSTANCE_NAME:-main}"
NUMBER="${1:-${TEST_SEND_NUMBER:-}}"
TEXT="${2:-TalkToStellar conectado via Evolution API.}"

if [ -z "$API_KEY" ]; then
  echo "Missing AUTHENTICATION_API_KEY in evolution/.env" >&2
  exit 1
fi

if [ -z "$NUMBER" ]; then
  echo "Usage: ./scripts/send-text.sh 5511999999999 \"message\"" >&2
  exit 1
fi

curl -sS -X POST "$BASE_URL/message/sendText/$INSTANCE_NAME" \
  -H "Content-Type: application/json" \
  -H "apikey: $API_KEY" \
  -d "{
    \"number\": \"$NUMBER\",
    \"text\": \"$TEXT\"
  }"
