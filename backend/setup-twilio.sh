#!/bin/bash
# Quick setup script for Twilio WhatsApp webhook integration

echo "🚀 Setting up Twilio WhatsApp Webhook Integration"
echo ""

# Step 1: Install dependencies
echo "📦 Installing Twilio SDK..."
npm install twilio

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "1. Copy .env.example to .env"
echo "   cp .env.example .env"
echo ""
echo "2. Add your Twilio credentials to .env:"
echo "   TWILIO_ACCOUNT_SID=your_sid_here"
echo "   TWILIO_AUTH_TOKEN=your_token_here"
echo ""
echo "3. Expose your backend with ngrok (for local testing):"
echo "   npm install -g ngrok"
echo "   ngrok http 3000"
echo ""
echo "4. Configure Twilio webhook URL:"
echo "   https://your-ngrok-url/agent-webhook/message"
echo ""
echo "5. Start your backend:"
echo "   npm run dev"
echo ""
echo "6. Start the Python agent (in talktostellar-agent directory):"
echo "   python main.py"
echo ""
echo "7. Test the webhook:"
echo "   curl http://localhost:3000/agent-webhook/health"
echo ""
echo "📚 For more info, see: src/agent_webhook/README.md"
