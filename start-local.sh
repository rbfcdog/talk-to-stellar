#!/bin/bash

# TalkToStellar Local Development - No Docker
# Starts Backend + Frontend as separate processes

echo "🚀 TalkToStellar - Local Development Setup"
echo "=========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not installed. Install from https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✅ Node.js: $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm not installed"
    exit 1
fi

NPM_VERSION=$(npm -v)
echo "✅ npm: $NPM_VERSION"
echo ""

# Backend setup
echo "📦 Setting up Backend..."
if [ ! -f backend/.env ]; then
    echo "Creating backend/.env..."
    cat > backend/.env << 'EOF'
# Backend Configuration
NODE_ENV=development
PORT=3001
LOG_LEVEL=info

# JWT Configuration
JWT_SECRET=dev-secret-key-change-in-production
INTERNAL_API_SECRET=dev-internal-secret

# Stellar Configuration
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org

# Supabase Configuration (optional - agent works without it)
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_KEY=
SUPABASE_JWT_SECRET=

# OpenAI Configuration (optional - agent warns but works without it)
OPENAI_API_KEY=

# CORS Configuration
CORS_ORIGINS=http://localhost:3000
EOF
    echo "✅ Created backend/.env"
fi

if [ ! -d backend/node_modules ]; then
    echo "🔨 Installing backend dependencies..."
    cd backend
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Backend npm install failed"
        exit 1
    fi
    cd ..
    echo "✅ Backend dependencies installed"
fi

# Frontend setup
echo ""
echo "📦 Setting up Frontend..."
if [ ! -f frontend/stellar-chat/.env.local ]; then
    echo "Creating frontend/stellar-chat/.env.local..."
    mkdir -p frontend/stellar-chat
    cat > frontend/stellar-chat/.env.local << 'EOF'
# Frontend Configuration
NODE_ENV=development
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
BACKEND_URL=http://localhost:3001
EOF
    echo "✅ Created frontend/stellar-chat/.env.local"
fi

if [ ! -d frontend/stellar-chat/node_modules ]; then
    echo "🔨 Installing frontend dependencies..."
    cd frontend/stellar-chat
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Frontend npm install failed"
        exit 1
    fi
    cd ../..
    echo "✅ Frontend dependencies installed"
fi

echo ""
echo "=========================================="
echo "✅ All dependencies ready!"
echo "=========================================="
echo ""

# Function to stop services on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    wait 2>/dev/null
    echo "✅ Services stopped"
}

trap cleanup EXIT

# Start Backend
echo "🚀 Starting Backend (port 3001)..."
cd backend
npm run dev &
BACKEND_PID=$!
cd ..
echo "   PID: $BACKEND_PID"

sleep 2

# Start Frontend
echo "🚀 Starting Frontend (port 3000)..."
cd frontend/stellar-chat
npm run dev &
FRONTEND_PID=$!
cd ../..
echo "   PID: $FRONTEND_PID"

echo ""
echo "=========================================="
echo "✅ TalkToStellar is Running!"
echo "=========================================="
echo ""
echo "📊 Access Points:"
echo "   🌐 Frontend:  http://localhost:3000"
echo "   🔌 Backend:   http://localhost:3001"
echo "   🏥 Health:    http://localhost:3001/health"
echo ""
echo "📝 Configuration Files:"
echo "   📄 Backend:   backend/.env"
echo "   📄 Frontend:  frontend/stellar-chat/.env.local"
echo ""
echo "🧪 Test Agent:"
echo "   curl -X POST http://localhost:3001/api/agent/query \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"query\":\"Hello!\",\"session_id\":\"test\"}'"
echo ""
echo "🛑 Ctrl+C to stop services"
echo ""

# Wait for both processes
wait
