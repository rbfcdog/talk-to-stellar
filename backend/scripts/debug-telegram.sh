#!/bin/bash
# Quick debug setup for Telegram integration

set -e

echo "🔧 TalkToStellar Telegram Debug Setup"
echo "===================================="
echo ""

BACKEND_DIR="/home/rodrigodog/talk-to-stellar/backend"
TELEGRAM_DIR="/home/rodrigodog/talk-to-stellar/telegram"

# Check if backend is running
echo "1️⃣  Checking backend..."
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "   ✅ Backend is running on port 3001"
else
    echo "   ❌ Backend NOT running. Start it first:"
    echo "      cd $BACKEND_DIR && npm run dev"
    exit 1
fi

# Check if telegram .env exists
echo ""
echo "2️⃣  Checking Telegram .env..."
if [ -f "$TELEGRAM_DIR/.env" ]; then
    echo "   ✅ .env exists"
    TOKEN=$(grep TELEGRAM_BOT_TOKEN "$TELEGRAM_DIR/.env" | cut -d= -f2)
    if [ -z "$TOKEN" ]; then
        echo "   ❌ TELEGRAM_BOT_TOKEN is empty in .env"
        exit 1
    fi
    echo "   ✅ TELEGRAM_BOT_TOKEN is set"
else
    echo "   ❌ .env not found in $TELEGRAM_DIR"
    exit 1
fi

# Check backend .env
echo ""
echo "3️⃣  Checking Backend .env..."
if [ -f "$BACKEND_DIR/.env" ]; then
    echo "   ✅ .env exists"
else
    echo "   ❌ .env not found in $BACKEND_DIR"
    exit 1
fi

# Test check-account endpoint
echo ""
echo "4️⃣  Testing /api/external/check-account endpoint..."
echo "   (Using fake Telegram user ID: 999888777)"

RESULT=$(curl -s -X POST http://localhost:3001/api/external/check-account \
  -H "Content-Type: application/json" \
  -d '{"provider":"telegram","provider_user_id":"999888777"}')

echo "   Response: $RESULT"

if echo "$RESULT" | grep -q "exists"; then
    echo "   ✅ Endpoint is working"
else
    echo "   ❌ Endpoint returned unexpected response"
    exit 1
fi

# Instructions
echo ""
echo "✅ All checks passed!"
echo ""
echo "📝 Next steps:"
echo "   1. Start the bot:"
echo "      cd $TELEGRAM_DIR && npm start"
echo ""
echo "   2. Test with actual Telegram user ID:"
echo "      node $BACKEND_DIR/scripts/test-telegram-flow.js <YOUR_TELEGRAM_ID>"
echo ""
echo "   3. Send a message from another Telegram account to the bot"
echo "   4. Check bot logs for errors"
echo ""
echo "🐛 If still broken, check:"
echo "   - Bot token is valid"
echo "   - Backend /api/external/check-account endpoint works"
echo "   - Supabase connection is live"
