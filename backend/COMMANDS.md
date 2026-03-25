# Quick Commands Reference

## Wallet Operations

### Create Test Users for Payment Testing
```bash
npm run seed:users 5     # Create 5 test users with wallets & 10,000 XLM each
npm run seed:users 10    # Create 10 test users
npm run seed:users 2     # Create 2 test users
```

### Run Wallet Tests
```bash
npm run test:wallet      # Run all wallet tests (8 tests)
npm test                 # Run all tests
npm run test:coverage    # Run tests with coverage report
```

### Start Backend Server
```bash
npm run dev              # Start with auto-reload (development)
npm start                # Start production server
npm run build            # Compile TypeScript
```

## Database Schema

### Wallets Table
Stores wallet information for users:
- `id` - UUID primary key
- `user_id` - Link to user
- `public_key` - Stellar public key
- `balance` - JSON array of balances
- `sequence` - Account sequence number
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Users Table
Extended with Stellar info:
- `stellar_public_key` - Their Stellar public key
- Account created via `onboardUser()`

## Test User Seeding

### What Happens
1. Generates new Stellar testnet keypair
2. Funds account with Friendbot (~10,000 XLM)
3. Creates user record in database
4. Saves wallet info with initial balance
5. Displays credentials for payment testing

### Example Output
```
Test User 1
  Email: test-user-xxx-0@stellar-chat.local
  Public Key: GBRE7PFDJJLMZWCX4BDKXTLVDH3VLLW7GXL76L4YVQG5DWHQWU7VVTZ
  Initial Balance: 10000.0000000 XLM
```

## Wallet Creation (Chat)

### User Message
```
"criar carteira" or "create wallet"
```

### Agent Response
1. Detects WALLET intent
2. Extracts email/phone from message
3. Creates account via Friendbot
4. Saves to database
5. Shows public key + private key (⚠️ with warnings)

### Result
- Wallet stored in `wallets` table
- Initial balance: 10,000 XLM (Testnet)
- Available for immediate payments

## Key Files

| File | Purpose |
|------|---------|
| `src/services/stellar.service.ts` | Stellar blockchain operations |
| `src/api/services/user.service.ts` | User onboarding with wallet creation |
| `src/repositories/wallet.repository.ts` | Database wallet operations |
| `src/agent/graph.ts` | Agent wallet creation flow |
| `src/agent/types.ts` | Wallet & intent types |
| `scripts/seed-users.ts` | Test user generation script |
| `tests/wallet.test.ts` | Wallet test suite |

## All Tests Status

```
✓ 8/8 Wallet Tests Passing
  ✓ Wallet storage
  ✓ Wallet retrieval
  ✓ Balance updates
  ✓ XLM balance querying
  ✓ Multi-asset balance querying
  ✓ Public key validation
  ✓ Invalid key rejection
  ✓ Sequence number validation
```

## Environment Requirements

```env
# Required for database
SUPABASE_URL=xxxx
SUPABASE_KEY=xxxx

# Optional (default to testnet)
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

# For agent features
OPENAI_API_KEY=xxxx

# For WhatsApp
TWILIO_ACCOUNT_SID=xxxx
TWILIO_AUTH_TOKEN=xxxx
```

## Common Scenarios

### Scenario 1: Create Test Users
```bash
npm run seed:users 5
# Creates 5 users with 10,000 XLM each
# Copy public keys for recipient field
```

### Scenario 2: Create Personal Wallet
```
Chat: "criar minha carteira"
Agent: Creates wallet, shows keys
You: Copy public key for receiving payments
```

### Scenario 3: Send Payment
```
Chat: "enviar 100 XLM para GBRE..."
Agent: Builds transaction, signs, submits
Chat: Shows confirmation with transaction hash
```

### Scenario 4: Check Balance
```
Chat: "qual é meu saldo?"
Agent: Queries Stellar network
Chat: Shows XLM balance in wallet
```

## Development Workflow

1. **Run tests**: `npm run test:wallet` (verify system works)
2. **Seed users**: `npm run seed:users 3` (create test recipients)
3. **Start server**: `npm run dev` (run backend)
4. **Test chat**: Connect to agent and test wallet/payment flows
5. **Monitor DB**: Check Supabase dashboard for created records

## Troubleshooting

| Error | Solution |
|-------|----------|
| `supabaseUrl is required` | Add SUPABASE_URL & SUPABASE_KEY to .env |
| `ServerClass is not a constructor` | Update to correct Stellar SDK import (already fixed) |
| `Account funded with 0 XLM` | Friendbot rate limit - wait and retry |
| `Failed to save wallet` | Check database connection and migrations |
| Test failures | Run `npm run build` then `npm test` |

## Next Actions

1. **Configure .env** with Supabase credentials
2. **Run seed script** to create test users: `npm run seed:users 5`
3. **Start backend**: `npm run dev`
4. **Test wallet creation** through chat interface
5. **Test payments** using seeded user public keys

---
**All wallet infrastructure is production-ready!** 🚀
