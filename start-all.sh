#!/bin/bash

set -u

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
TELEGRAM_DIR="$ROOT_DIR/telegram"
FRONTEND_DIR="$ROOT_DIR/frontend/stellar-chat"

echo "🚀 TalkToStellar - full local startup"
echo "======================================"
echo ""

check_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "❌ Missing required command: $command_name"
    exit 1
  fi
}

check_command node
check_command npm

if [ ! -d "$BACKEND_DIR/node_modules" ]; then
  echo "📦 Installing backend dependencies..."
  (cd "$BACKEND_DIR" && npm install) || exit 1
fi

if [ ! -d "$TELEGRAM_DIR/node_modules" ]; then
  echo "📦 Installing telegram dependencies..."
  (cd "$TELEGRAM_DIR" && npm install) || exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  echo "📦 Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install) || exit 1
fi

cleanup() {
  echo ""
  echo "🛑 Stopping services..."
  [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" >/dev/null 2>&1 || true
  [ -n "${TELEGRAM_PID:-}" ] && kill "$TELEGRAM_PID" >/dev/null 2>&1 || true
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

echo "🚀 Starting Telegram..."
(cd "$TELEGRAM_DIR" && npm run dev) > >(sed -u 's/^/[TELEGRAM] /') 2> >(sed -u 's/^/[TELEGRAM][ERR] /' >&2) &
TELEGRAM_PID=$!
echo "   PID: $TELEGRAM_PID"

echo "🚀 Starting Frontend..."
(cd "$FRONTEND_DIR" && npm run dev) > >(sed -u 's/^/[FRONTEND] /') 2> >(sed -u 's/^/[FRONTEND][ERR] /' >&2) &
FRONTEND_PID=$!
echo "   PID: $FRONTEND_PID"

echo ""
echo "🚀 Starting Backend (logs stay visible in this terminal)..."
echo ""
cd "$BACKEND_DIR" || exit 1
npm run dev
