# MONEY-FLOWS.md — End-to-End Transaction Lifecycles

> **Living document.** Updated when flows change or new flow steps are implemented.

## 1. On-Ramp: PIX → Balance

```
User enters BRL amount (WhatsApp/Web)
  ↓
agent/routes.ts → structured tool "create_pix_onramp"
  ↓
ramp.controller.ts → POST /api/ramp/etherfuse/onramp
  ↓
pix-funding.service.ts → PixFundingService.createPixIntent()
  ├── AnchorService.createCustomerForSession()  [anchor.service.ts:4179]
  ├── AnchorService.getQuoteForSession()         [anchor.service.ts:4282]
  └── AnchorService.createOnRampForSession()     [anchor.service.ts:4479]
      └── EtherfuseClient.createOnRamp()
  ↓
Returns: PIX BrCode + QR code
  ↓
User pays via bank app (real BRL)
  ↓
Etherfuse webhook → etherfuse-webhook.controller.ts
  └── InternationalTransferService.handlePixConfirmation()
  ↓
State: PIX_RECEIVED → BRL_TO_USDC_PENDING
  ↓
Auto-conversion: Stellar pathfinding → settlement
  ↓
stellar-settlement.service.ts → StellarService.submitAssetPaymentFromSecret()
  ↓
State: USDC_SETTLED
  ↓
Balance updated → notification via EvolutionService
```

**Sequence files**: `pix-funding.service.ts:16-102`, `anchor.service.ts:4479-4670`, `etherfuse-webhook.controller.ts:32-54`, `stellar-settlement.service.ts:56-140`

## 2. Conversion: Asset → Asset

```
User: "Converte 100 BRL pra USDC"
  ↓
agent/routes.ts → structured tool "convert_assets"
  ↓
financial.controller.ts → POST /api/financial/conversion-preview
  ↓
brl-reference-rate.service.ts → quoteStrictSend()
  └── Horizon.strictSendPaths(BRL, amount, [USDC])
  ↓
Returns: rate, fee (30bps), estimated output, TTL
  ↓
User confirms → PIN check
  ↓
financial.controller.ts → POST /api/financial/conversion-confirmation
  ↓
stellar.service.ts → StellarService.submitAssetPaymentFromSecret()
  ├── buildStrictSendConversionXdr()
  ├── signAndSubmitXdr()
  └── getSubmittedPaymentDetails()
  ↓
Operation persisted: OP-xxxxxx
  ↓
Platform fee routed to admin treasury wallet
```

**Sequence files**: `financial.controller.ts:conversion-preview`, `brl-reference-rate.service.ts:100-140`, `stellar.service.ts:961-1100`

## 3. P2P Send

```
User: "Manda $500 pra Marina" (WhatsApp/Web)
  ↓
Agent resolves recipient:
  ├── UserRepository.findByEmail(marina@email)     [user.repository.ts]
  ├── ContactRepository.findByOwnerAndName()        [contact.repository.ts]
  └── If not found: prompt to add
  ↓
Check sender balance:
  ├── Sufficient → direct Stellar payment
  └── Insufficient → funding paths:
      ├── Convert existing BRL/USDC balance
      └── PIX on-ramp (Flow #1)
  ↓
financial.controller.ts → POST /api/financial/send
  ↓
stellar.service.ts → StellarService.submitAssetPaymentFromSecret()
  └── buildPaymentXdr(source, destination, amount, asset, memo)
  ↓
Cross-asset: sender BRL → path payment → recipient USD
  ↓
Platform fee → admin wallet
  ↓
Both notified via EvolutionService
```

**Sequence files**: agent send tool, `financial.controller.ts:send`, `stellar.service.ts:526-700`

## 4. Off-Ramp: Balance → PIX

```
User requests PIX withdrawal (Web)
  ↓
ramp.controller.ts → POST /api/ramp/etherfuse/offramp
  ↓
AnchorService.createOffRampForSession()  [anchor.service.ts:5000+]
  ├── Validate PIX key
  ├── Build off-ramp quote (USDC → BRL)
  └── Execute off-ramp via Etherfuse
  ↓
Stellar settlement: USDC sent to Etherfuse
  ↓
Etherfuse sends BRL via PIX to user's key
  ↓
State: OFF_RAMP_COMPLETED → notification
```

**Sequence files**: `ramp.controller.ts:offramp`, `anchor.service.ts:offramp methods`

## 5. Investments (DeFindex Vaults)

```
User applies USDC to vault (Web)
  ↓
financial.controller.ts → POST /api/financial/defindex/apply
  ↓
defindex-yield.service.ts → applyToVault()
  ├── Validate USDC balance
  ├── DeFindex SDK: deposit(vault, amount)
  └── Track operation
  ↓
Yield accrues automatically
  ↓
User withdraws: principal + yield
  ↓
Performance display: TWR (time-weighted return)
  └── Exclude deposits/withdrawals from return calc
```

**Sequence files**: `defindex-yield.service.ts`, `financial.controller.ts:defindex`

## 6. Orchestration Flow (D1)

```
Agent/API creates BRL→USD transfer intent
  ↓
international-transfer.service.ts executes existing real side effects:
  ├── BrlUsdQuoteService → Stellar quote
  ├── PixFundingService → Etherfuse PIX intent
  ├── Etherfuse webhook → handlePixConfirmation()
  ├── StellarSettlementService → USDC settlement
  └── UsdPayoutCoordinationService → Circle/Etherfuse/Bridge/Mock payout adapter
  ↓
TransferOrchestrator.syncFromInternationalTransfer()
  ├── CREATED → QUOTED
  ├── PIX_CHARGE_ISSUED → PIX_FUNDED
  ├── CONVERTING → STELLAR_SETTLED
  ├── PAYOUT_ROUTING → PAYOUT_INSTRUCTED
  └── RECONCILED when evidence is complete
  ↓
transition_transfer() RPC atomically updates transfers + inserts transfer_events
  ↓
Structured JSON logs are emitted per transition
  ↓
/ops shows the complete database transaction history
  └── source=transfers isolates normalized D1 records
      └── /ops/transfers/:id shows event timeline, reconciliation, and raw record
```

**Sequence files**: `backend/src/api/services/international-transfer.service.ts`, `backend/src/orchestration/TransferOrchestrator.ts`, `backend/src/api/repository/transfer.repository.ts`, `backend/src/api/repository/ops-history.repository.ts`, `backend/src/api/controllers/ops.controller.ts`

**Circle payout foundation**: after `USDC_SETTLED`, `backend/src/api/services/usd-payout-adapters.ts` can build Circle Mint `/v1/businessAccount/payouts` instructions, poll payout status, normalize Circle webhook events, and persist redacted provider evidence. Sandbox/live execution still requires `ENABLE_REAL_PAYOUT_EXECUTION=true`, `CIRCLE_API_KEY`, and a linked Circle bank account ID.

**Replay behavior**: Etherfuse retries with the same `e2e_id`/`txid` and Stellar retries with the same `tx_hash` append `idempotent_replay` events without changing state.
