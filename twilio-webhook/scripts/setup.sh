#!/bin/bash

# ─── Colors ───────────────────────────────────────────────────────────────────
CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}  📡 Twilio Webhook Tester — Setup${RESET}"
echo -e "${CYAN}  ──────────────────────────────────────${RESET}"
echo ""

# ── Check Node ────────────────────────────────────────────────────────────────
if ! command -v node &> /dev/null; then
  echo -e "${RED}  ✗ Node.js not found. Install from https://nodejs.org${RESET}"
  exit 1
fi
echo -e "${GREEN}  ✓ Node.js $(node -v)${RESET}"

# ── Check npm ────────────────────────────────────────────────────────────────
if ! command -v npm &> /dev/null; then
  echo -e "${RED}  ✗ npm not found.${RESET}"
  exit 1
fi
echo -e "${GREEN}  ✓ npm $(npm -v)${RESET}"

# ── Install dependencies ──────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}  Installing dependencies...${RESET}"
npm install --silent
echo -e "${GREEN}  ✓ Dependencies installed${RESET}"

# ── Check .env ────────────────────────────────────────────────────────────────
echo ""
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}  ⚠  .env file not found. Creating from template...${RESET}"
  cp .env.example .env
  echo -e "${YELLOW}  ➜  Edit .env and fill in your Twilio credentials:${RESET}"
  echo ""
  echo -e "     ${BOLD}TWILIO_ACCOUNT_SID${RESET}  → console.twilio.com (starts with AC...)"
  echo -e "     ${BOLD}TWILIO_AUTH_TOKEN${RESET}   → console.twilio.com"
  echo -e "     ${BOLD}TWILIO_PHONE_NUMBER${RESET} → your Twilio number in E.164 (+1...)"
  echo ""
else
  echo -e "${GREEN}  ✓ .env found${RESET}"
fi

# ── Check ngrok ───────────────────────────────────────────────────────────────
echo ""
if command -v ngrok &> /dev/null; then
  echo -e "${GREEN}  ✓ ngrok is installed${RESET}"
  echo -e "${CYAN}  ➜  To expose your server run:  ${BOLD}ngrok http 3000${RESET}"
else
  echo -e "${YELLOW}  ⚠  ngrok not found. Install from https://ngrok.com/download${RESET}"
  echo -e "     Then run: ${BOLD}ngrok http 3000${RESET}"
fi

echo ""
echo -e "${CYAN}  ──────────────────────────────────────${RESET}"
echo -e "${CYAN}  ${BOLD}Next steps:${RESET}"
echo ""
echo -e "  1. Fill in ${BOLD}.env${RESET} with your Twilio credentials"
echo -e "  2. Run ${BOLD}npm start${RESET} to start the server"
echo -e "  3. In another terminal run ${BOLD}ngrok http 3000${RESET}"
echo -e "  4. Copy the ngrok URL → Twilio Console → Phone Numbers"
echo -e "     Set SMS webhook:   ${BOLD}https://xxxx.ngrok.app/webhook/sms${RESET}"
echo -e "     Set Voice webhook: ${BOLD}https://xxxx.ngrok.app/webhook/voice${RESET}"
echo -e "  5. Open ${BOLD}http://localhost:3000${RESET} for the live dashboard"
echo -e "  6. Text or call your Twilio number and watch events appear!"
echo ""
