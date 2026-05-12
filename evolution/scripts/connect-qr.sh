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
OWNER_NUMBER="${OWNER_NUMBER:-}"

if [ -z "$API_KEY" ]; then
  echo "Missing AUTHENTICATION_API_KEY in evolution/.env" >&2
  exit 1
fi

CONNECT_URL="$BASE_URL/instance/connect/$INSTANCE_NAME"
if [ -n "$OWNER_NUMBER" ]; then
  CONNECT_URL="$CONNECT_URL?number=$OWNER_NUMBER"
fi

wait_for_evolution "$BASE_URL"

echo "Requesting QR data from: $CONNECT_URL"
echo "Browser QR page will be written to: evolution/qr.html"

RESPONSE="$(request_with_retry 5 2 curl -sS -X GET "$CONNECT_URL" -H "apikey: $API_KEY")"
printf '%s\n' "$RESPONSE" | tee /tmp/talktostellar-evolution-connect.json

python3 - "$BASE_URL" "$INSTANCE_NAME" <<'PY'
import json
import sys
import urllib.parse
from pathlib import Path

base_url = sys.argv[1]
instance = sys.argv[2]
raw = Path("/tmp/talktostellar-evolution-connect.json").read_text()

try:
    data = json.loads(raw)
except Exception:
    print("\nCould not parse Evolution response as JSON.")
    sys.exit(0)

def find_key(obj, names):
    if isinstance(obj, dict):
        for name in names:
            value = obj.get(name)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for value in obj.values():
            found = find_key(value, names)
            if found:
                return found
    if isinstance(obj, list):
        for item in obj:
            found = find_key(item, names)
            if found:
                return found
    return ""

base64_qr = find_key(data, {"base64", "qr", "qrcode"})
pairing_code = find_key(data, {"pairingCode", "pairing_code"})
wa_code = find_key(data, {"code"})

html = ""
if base64_qr.startswith("data:image"):
    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Evolution QR - {instance}</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#fff;font-family:sans-serif}}main{{text-align:center}}img{{width:min(80vw,420px);height:auto;background:#fff;padding:20px;border-radius:20px}}code{{display:block;margin-top:16px;color:#aaa}}</style>
</head><body><main><h1>Scan WhatsApp QR</h1><img src="{base64_qr}" alt="Evolution QR"><code>{instance}</code></main></body></html>"""
elif wa_code:
    qr_url = "https://api.qrserver.com/v1/create-qr-code/?size=420x420&data=" + urllib.parse.quote(wa_code)
    html = f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Evolution QR - {instance}</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#fff;font-family:sans-serif}}main{{max-width:720px;padding:24px;text-align:center}}img{{width:min(80vw,420px);height:auto;background:#fff;padding:20px;border-radius:20px}}pre{{white-space:pre-wrap;word-break:break-all;text-align:left;background:#111;padding:16px;border-radius:12px;color:#ddd}}</style>
</head><body><main><h1>Scan WhatsApp QR</h1><p>Se a imagem não aparecer, copie o code abaixo para um gerador de QR.</p><img src="{qr_url}" alt="Evolution QR"><h2>Pairing code</h2><p>{pairing_code or "not provided"}</p><h2>Raw code</h2><pre>{wa_code}</pre></main></body></html>"""

if html:
    out = Path("qr.html")
    out.write_text(html)
    print(f"\nQR page written: {out.resolve()}")
    print("Open it with:")
    print("  xdg-open qr.html")
elif pairing_code:
    print(f"\nPairing code: {pairing_code}")
else:
    print("\nNo QR code found in this response yet.")
    print(f"Try opening the manager: {base_url}/manager")
PY
