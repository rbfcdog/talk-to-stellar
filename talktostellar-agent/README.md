# TalkToStellar Agent

An AI-powered conversational agent for the Stellar blockchain, enabling users to manage accounts, contacts, and execute payments through natural language.

## Features

🤖 **Natural Language Intent Detection** - Automatically understand user requests
💬 **Multi-Channel Support** - Web, Telegram, Discord integration ready
🔐 **Secure Authentication** - Session-based user management
⛓️ **Stellar Integration** - Full support for payments, contacts, and operations
📊 **Transaction Management** - Check balances and operation history
🔄 **Cross-Asset Payments** - Path payments for asset conversion
🇧🇷 **PIX Integration** - Brazilian Instant Payment System support

## Quick Start

### Prerequisites

- Python 3.9+
- `uv` package manager ([install](https://github.com/astral-sh/uv))
- OpenAI API key
- Running TalkToStellar backend (Node.js API on port 3001)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/talktostellar-agent.git
cd talktostellar-agent

# Install dependencies with uv
uv sync

# Create environment file
cp .env.example .env
```

### Configuration

Update `.env` with your settings:

```env
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-4
TEMPERATURE=0.5
NODE_API_BASE_URL=http://localhost:3001
INTERNAL_API_SECRET=your-secret-key
STELLAR_PUBLIC_KEY=your-public-key
PHONE_NUMBER=+55your-number
VERBOSE=false
```

### Running the Server

```bash
# Using uv
uv run uvicorn api.main:app --reload --port 8000

# Or manually
python -m uvicorn api.main:app --reload --port 8000
```

Server will be available at `http://localhost:8000`
- **Docs**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## API Endpoints

### Query Agent
```http
POST /api/actions/query
Content-Type: application/json

{
  "query": "What's my account balance?",
  "session_id": "user_123"
}
```

**Response:**
```json
{
  "result": {
    "message": "Your balance is...",
    "task": "balance",
    "params": {"success": true}
  }
}
```

### Session Info
```http
GET /api/actions/session/{session_id}
```

### Health Check
```http
GET /api/actions/health
```

### Logout
```http
POST /api/actions/logout/{session_id}
```

## Supported User Intents

| Intent | Examples | Description |
|--------|----------|-------------|
| **Login** | "login with email@example.com" | User authentication |
| **Onboard** | "create account" | New account creation |
| **Contacts** | "show my contacts", "add contact" | Contact management |
| **Payment** | "send 100 USDC to Alice" | Stellar payments |
| **Balance** | "what's my balance?" | Account balance |
| **History** | "show operations" | Transaction history |
| **PIX** | "deposit 100 via PIX" | Brazilian payments |

## Project Structure

```
talktostellar-agent/
├── src/
│   └── talktostellar_agent/
│       ├── __init__.py       # Package exports
│       ├── agent.py          # Main agent logic
│       ├── tools.py          # LangChain tool definitions
│       ├── config.py         # Configuration management
│       └── types.py          # Type definitions
├── api/
│   ├── __init__.py
│   ├── main.py              # FastAPI application setup
│   └── routes.py            # API route definitions
├── tests/
│   └── test_agent.py        # Agent tests
├── pyproject.toml           # Project configuration (uv)
├── .env.example             # Environment variables template
├── .gitignore               # Git ignore rules
└── README.md                # This file
```

## Development

### Install Development Dependencies

```bash
uv sync --extra dev
```

### Run Tests

```bash
# Run all tests
uv run pytest

# With coverage
uv run pytest --cov=src tests/

# Watch mode
uv run pytest-watch tests/
```

### Code Quality

```bash
# Format code
uv run black src/ api/

# Linting
uv run ruff check src/ api/

# Type checking
uv run mypy src/ api/
```

## Tool Definitions

The agent has access to 12 tools for backend integration:

### Authentication
- `login_user(email)` - Login with email
- `create_account(email)` - Create new account

### Contacts
- `list_contacts(session_token)` - List all contacts
- `add_contact(session_token, user_id, contact_name, public_key)` - Add contact
- `lookup_contact(session_token, contact_name)` - Find contact by name

### Account
- `get_account_balance(session_token)` - Check balance
- `get_operations_history(session_token)` - Transaction history

### Payments
- `build_payment_xdr(session_token, destination, amount, asset_code, memo)` - Prepare payment
- `sign_and_submit_xdr(session_token, user_id, secret_key, unsigned_xdr, ...)` - Submit payment
- `build_path_payment_xdr(session_token, ...)` - Cross-asset payment

### PIX
- `initiate_pix_deposit(session_token, amount, asset_code)` - Start PIX deposit
- `check_deposit_status(session_token, deposit_id)` - Check PIX status

## Example Usage

```python
from src.talktostellar_agent import SimpleAgent
from src.talktostellar_agent.types import QueryRequest

# Initialize agent
agent = SimpleAgent()

# Login
response = agent.run(
    QueryRequest(query="login with user@example.com"),
    session_id="user_123"
)
print(response.message)

# Check balance
response = agent.run(
    QueryRequest(query="what's my balance?"),
    session_id="user_123"
)
print(response.message)
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | - | OpenAI API key (required) |
| `OPENAI_MODEL` | gpt-4 | OpenAI model to use |
| `TEMPERATURE` | 0.5 | Model temperature (0-1) |
| `NODE_API_BASE_URL` | http://localhost:3001 | Backend API URL |
| `INTERNAL_API_SECRET` | hackathon-secret-2024 | Internal API secret |
| `STELLAR_PUBLIC_KEY` | - | Default Stellar public key |
| `PHONE_NUMBER` | 100000000 | Default phone number |
| `VERBOSE` | false | Verbose logging |

## Architecture

```
User Input (Web/Telegram/Discord)
    ↓
FastAPI Server
    ↓
Routes (routes.py)
    ↓
SimpleAgent (agent.py)
    ├─→ Intent Detection
    ├─→ Session Management
    └─→ LangChain Agent Executor
        └─→ Tool Definitions (tools.py)
            └─→ Backend API Calls
```

## Testing

Write tests in the `tests/` directory:

```python
# tests/test_agent.py
import pytest
from src.talktostellar_agent import SimpleAgent

@pytest.mark.asyncio
async def test_agent_initialization():
    agent = SimpleAgent()
    assert agent is not None
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: [project issues](https://github.com/yourusername/talktostellar-agent/issues)
- Documentation: See `/docs` endpoint
- Email: team@talktostellar.com

## Acknowledgments

- Built with [LangChain](https://langchain.com)
- Powered by [OpenAI](https://openai.com)
- Blockchain integration via [Stellar](https://stellar.org)

---

**Made with ❤️ for the Stellar community**
