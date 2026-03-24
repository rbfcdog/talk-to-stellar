#!/bin/bash
# Test script for Twilio webhook endpoint

echo "🧪 Testing Twilio Webhook Endpoint"
echo ""

# Configuration
BACKEND_URL="http://localhost:3000"
TEST_PHONE_FROM="whatsapp:+1234567890"
TEST_PHONE_TO="whatsapp:+0987654321"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health check
echo -e "${YELLOW}Test 1: Health Check${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BACKEND_URL/agent-webhook/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Health check passed${NC}"
  echo "Response: $BODY"
else
  echo -e "${RED}✗ Health check failed (HTTP $HTTP_CODE)${NC}"
fi

echo ""

# Test 2: Status endpoint
echo -e "${YELLOW}Test 2: Status Endpoint${NC}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$BACKEND_URL/agent-webhook/status")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Status check passed${NC}"
  echo "Response: $BODY"
else
  echo -e "${RED}✗ Status check failed (HTTP $HTTP_CODE)${NC}"
fi

echo ""

# Test 3: Message webhook (without signature validation)
echo -e "${YELLOW}Test 3: Message Webhook (without signature)${NC}"
echo "📨 Sending test message..."

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BACKEND_URL/agent-webhook/message" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=$TEST_PHONE_FROM&To=$TEST_PHONE_TO&Body=Hello%20Agent&MessageSid=test123&NumMedia=0")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✓ Message webhook passed (HTTP 200)${NC}"
  echo "Response: $BODY"
else
  echo -e "${YELLOW}⚠ Message webhook returned HTTP $HTTP_CODE${NC}"
  echo "Response: $BODY"
  echo ""
  echo "Note: If you're seeing 401, make sure TWILIO_AUTH_TOKEN is not set in .env"
  echo "      Signature validation is only enforced in production."
fi

echo ""
echo -e "${GREEN}✅ Testing complete!${NC}"
echo ""
echo "📝 Next steps:"
echo "1. Make sure Python agent is running: python main.py"
echo "2. Check backend logs for message processing"
echo "3. Configure Twilio webhook URL in console"
echo "4. Send a real WhatsApp message to test the integration"
