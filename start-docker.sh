#!/bin/bash

# TalkToStellar Startup Script
# Starts Backend (port 3001) + Frontend (port 3000) services
# Configuration files:
#   - backend/.env (service-specific)
#   - frontend/stellar-chat/.env.local (service-specific)
# Note: No .env file should exist in the root directory

echo "🚀 TalkToStellar - Backend + Frontend Development Setup"
echo "======================================================="
echo ""

# Initialize .env files if missing (per-service configuration)
if [ ! -f backend/.env ] || [ ! -f frontend/stellar-chat/.env.local ]; then
    echo "📝 Initializing service configuration files..."
    ./init.sh 2>/dev/null || true
    echo ""
fi

echo "✅ Service configuration files ready:"
echo "   • Backend:  backend/.env"
echo "   • Frontend: frontend/stellar-chat/.env.local"
echo ""

# Check Docker
echo "🔍 Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not installed"
    exit 1
fi
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose not installed"
    exit 1
fi
echo "   ✅ Docker ready"
echo ""

# Clean up old state
echo "🧹 Cleaning up..."
docker-compose down --remove-orphans 2>/dev/null || true
sleep 1

# Build images
echo "🔨 Building images..."
if ! docker-compose build backend frontend 2>&1 | tail -5; then
    echo "⚠️  Build had issues - trying with fresh start..."
    docker-compose down
    docker-compose build --no-cache backend frontend || {
        echo "❌ Build failed"
        exit 1
    }
fi

echo "✅ Build complete"
echo ""

# Start services
echo "🚀 Starting services..."
docker-compose up -d backend frontend

echo "⏳ Waiting for services (up to 45 seconds)..."
TIMEOUT=45
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT ]; do
    # Try to reach backend
    if curl -s http://localhost:3001/health > /dev/null 2>&1 && \
       curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo ""
        echo "✅ Services ready!"
        break
    fi
    echo -n "."
    sleep 1
    ELAPSED=$((ELAPSED+1))
done

if [ $ELAPSED -eq $TIMEOUT ]; then
    echo ""
    echo "⏳ Services starting (may take another moment)"
    echo "   View logs: docker-compose logs -f"
fi

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
echo "📝 Commands:"
echo "   Stop:  docker-compose down"
echo "   Logs:  docker-compose logs -f"
echo "   Rebuild: docker-compose build --no-cache"
echo ""
echo "🧪 Test Agent:"
echo "   curl -X POST http://localhost:3001/api/agent/query \\"
echo "     -H 'Content-Type: application/json' \\"
echo "     -d '{\"query\":\"Hello!\",\"session_id\":\"test\"}'"
echo ""
echo "📋 Configure API Keys (optional):"
echo "   nano backend/.env"
echo "   docker-compose restart backend"
echo ""
