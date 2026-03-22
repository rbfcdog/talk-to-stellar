# Quick Start Guide

## 1. Install Dependencies with uv

```bash
# Install uv (if not already installed)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Navigate to project
cd talktostellar-agent

# Install all dependencies
uv sync

# Or with dev dependencies
uv sync --extra dev
```

## 2. Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit with your settings
nano .env
```

Required variables:
- `OPENAI_API_KEY=sk-...`
- `NODE_API_BASE_URL=http://localhost:3001` (your backend)

## 3. Run the Server

```bash
# Option 1: Run with uv (recommended)
uv run main.py

# Option 2: Run with uvicorn directly
uv run uvicorn api.main:app --reload --port 8000

# Option 3: Run with Python (after uv sync)
python main.py
```

Server starts at: `http://localhost:8000`

## 4. Access API

**Interactive Docs:**
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

**Health Check:**
```bash
curl http://localhost:8000/api/actions/health
```

**Query Agent:**
```bash
curl -X POST http://localhost:8000/api/actions/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "login with user@example.com",
    "session_id": "session_1"
  }'
```

## 5. Run Tests

```bash
# Run all tests
uv run pytest tests/ -v

# Run with coverage
uv run pytest tests/ -v --cov=src
```

## Project Structure

```
talktostellar-agent/
├── src/talktostellar_agent/    # Core agent package
│   ├── agent.py                # Main agent logic
│   ├── tools.py                # 12 LangChain tools
│   ├── config.py               # Configuration
│   └── types.py                # Type definitions
├── api/                        # FastAPI server
│   ├── main.py                 # App factory
│   └── routes.py               # API endpoints
├── tests/                      # Unit tests
├── main.py                     # Entry point
├── pyproject.toml              # uv project config
└── README.md                   # Full documentation
```

## Common Commands

```bash
# Add a new package
uv add package-name

# Add dev-only package
uv add --dev package-name

# Format code
uv run black src/ api/

# Run linter
uv run ruff check src/ api/

# Type checking
uv run mypy src/ api/

# Update all dependencies
uv sync --upgrade
```

## Troubleshooting

**No module named 'talktostellar_agent'**
```bash
# Make sure you're in the right directory
cd talktostellar-agent

# And dependencies are installed
uv sync
```

**OpenAI API key error**
```bash
# Check .env file exists and has correct key
cat .env

# Key should start with: sk-
```

**Backend connection refused**
```bash
# Make sure backend is running on port 3001
curl http://localhost:3001/health

# Or update NODE_API_BASE_URL in .env
```

## Next Steps

1. ✅ Install with `uv sync`
2. ✅ Configure `.env` file
3. ✅ Run `uv run main.py`
4. ✅ Visit http://localhost:8000/docs
5. ✅ Try a query in Swagger UI
6. ✅ Check tests with `uv run pytest`

---

For full documentation, see [README.md](README.md)
