#!/bin/bash

# TalkToStellar Configuration Initialization
# Creates .env files in each service directory with sensible defaults

echo "⚙️  TalkToStellar Service Configuration"
echo "======================================"
echo ""
echo "This script initializes .env files for each service."
echo "Configuration should be managed per-service, not at root level."
echo ""

# Backend .env
echo "📝 Setting up backend service configuration..."
BACKEND_ENV="backend/.env"
if [ ! -f "$BACKEND_ENV" ]; then
    cat > "$BACKEND_ENV" << 'EOF'
# Backend Service Configuration
# Local development defaults - update with your API keys

# JWT & Security (change these in production!)
JWT_SECRET=dev-secret-key-12345-change-in-production
INTERNAL_API_SECRET=dev-internal-secret-change-in-production

# Supabase Configuration (optional for local testing)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_KEY=
SUPABASE_JWT_SECRET=

# OpenAI Configuration (optional - agent will work without it but with warnings)
# Get from: https://platform.openai.com/api-keys
OPENAI_API_KEY=

# Stellar Configuration (testnet is default)
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org

# Server Configuration
PORT=3001
NODE_ENV=development
LOG_LEVEL=info

# CORS Configuration (allow localhost for development)
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
EOF
    echo "   ✅ Created backend/.env with development defaults"
else
    echo "   ℹ️  backend/.env already exists"
fi

# Frontend .env.local
echo "📝 Setting up frontend service configuration..."
FRONTEND_ENV="frontend/stellar-chat/.env.local"
if [ ! -f "$FRONTEND_ENV" ]; then
    mkdir -p frontend/stellar-chat
    cat > "$FRONTEND_ENV" << 'EOF'
# Frontend Service Configuration
# Next.js environment variables for local development

# Backend API URL (must match backend port)
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3001

# Node environment
NODE_ENV=development
EOF
    echo "   ✅ Created frontend/stellar-chat/.env.local"
else
    echo "   ℹ️  frontend/stellar-chat/.env.local already exists"
fi

echo ""
echo "✅ Service configuration files ready!"
echo ""
echo "📋 Next Steps:"
echo "   1. Backend configuration is in: backend/.env"
echo "   2. Frontend configuration is in: frontend/stellar-chat/.env.local"
echo "   3. (Optional) Add your API keys to backend/.env"
echo "   4. Run: ./start.sh"
echo ""
echo "🔑 Getting API Keys:"
echo "   • OPENAI_API_KEY: https://platform.openai.com/api-keys"
echo "   • SUPABASE: https://supabase.com/dashboard"
echo ""
echo "⚠️  Note: Do NOT create .env files in the root directory!"
echo "      Each service manages its own configuration."
echo ""
