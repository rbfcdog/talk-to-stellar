# How to Test USD Wire On-Ramp with Bridge.xyz

This guide walks you through testing a real USD wire on-ramp (fiat → USDC on Stellar) using the Bridge.xyz integration on the `/bridge-test` page.

---

## What You Need

### 1. US Bank Account that supports wire transfers
Any major US bank works:
- **Chase** (JP Morgan)
- **Bank of America**
- **Wells Fargo**
- **Citibank**
- **SVB / Mercury / Relay** (fintech banks, good for wires)

> Wire transfers are domestic USD bank-to-bank transfers. Your bank may charge a wire fee ($15–$35 typical). For testing, a small amount ($50–$200) is fine.

### 2. Prerequisites on the bridge-test page
- [ ] Railway env vars set: `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=true`, `BRIDGE_ENABLED=true`
- [ ] Logged in as a customer with **KYC approved** status
- [ ] A Stellar wallet address set in Step 2

---

## Step-by-Step Flow

### Step 1 — Login
Go to `/bridge-test`. Enter `rodtretinha@gmail.com` and press **Find or create account**. If the customer doesn't exist yet, fill in a name and click **Create customer**, then complete KYC.

### Step 2 — Set Stellar Wallet
In the "Stellar Wallet" card, paste your Stellar G-address and click **Set wallet**. This will be the address that receives USDC after the on-ramp.

### Step 3 — Create a USD Virtual Account
In Step 4 (On-Ramp), click the **🇺🇸 ACH / Wire** tab, then:
- **Destination wallet**: auto-filled from your Stellar address (read-only)
- **Destination chain**: `stellar` (default, leave as-is)
- **Blockchain memo**: leave blank (only needed for exchange hot-wallets)
- Click **Create USD virtual account**

Bridge will return:
```
Bank: Lead Bank
Address: 1801 Main St., Kansas City, MO 64108
Routing: 101019644
Account number: [unique to your customer]
Beneficiary name: [your KYC name]
Payment rails: ach_push, fednow, wire
```

> The account number is permanent and reusable — you only need to create it once.

### Step 4 — Send the Wire from Your Bank

Log in to your US bank and initiate a **domestic wire transfer** with these details:

| Field | Value |
|---|---|
| Bank name | Lead Bank |
| Routing number | `101019644` |
| Account number | (from `source_deposit_instructions.bank_account_number`) |
| Beneficiary name | (from `source_deposit_instructions.bank_beneficiary_name`) |
| Amount | $50–$200 (minimum $5) |
| Wire memo | Optional — leave blank or write anything |

> **No deposit message required for virtual accounts.** Bridge matches the payment by account number, not a memo. (Memos are only required for one-time Transfers, not virtual accounts.)

### Step 5 — Wait for Conversion

Bridge detects the wire deposit and automatically:
1. Converts USD → USDC at market rate (minus developer fee ~0.30%)
2. Sends USDC to your Stellar address on-chain

**Settlement time:**
- ACH push: 1–2 business days
- Wire: same business day or next business day (cut-off ~4pm ET)
- FedNow: minutes (if your bank supports FedNow)

You can monitor in the **Transfer History** card (Step 6 on the page) or check your Stellar wallet balance in Step 2.

---

## Minimum Wire Amounts

| Rail | Min | Max |
|---|---|---|
| Wire (USD VA) | $5 | $50,000 |
| ACH push (USD VA) | $5 | $50,000 |
| FedNow (USD VA) | $5 | $50,000 |

---

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "Mainnet money movement is disabled" | Missing env var | Set `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=true` on Railway |
| "KYC not approved" | Customer not verified | Complete KYC via the link in Step 1 |
| No USDC after 2 days | Wire may have failed | Check with your bank if wire was accepted; verify account number |
| Virtual account shows `deactivated` | Manual deactivation | Click Reactivate in the virtual accounts list |

---

## Which Bank is Best for Testing?

For the fastest test cycle:
1. **Mercury Bank** (mercury.com) — fintech bank, free domestic wires, fast processing
2. **Relay Bank** (relayfi.com) — fintech, free wires, instant FedNow support
3. **Chase** — widely available, $25 wire fee, same-day if sent before 4pm ET

> If you have a **FedNow-enabled bank** (Mercury, Relay, some credit unions), the conversion can complete in **minutes** rather than hours.

---

## After the Wire Lands

Once Bridge processes the deposit:
- Your Stellar wallet shows a USDC balance increase
- A transfer record appears in Step 6 (Transfer History) with `state: completed`
- The `receipt` shows the final USDC amount after fees

You can now test **off-ramp**: take that USDC and send it back to a US bank via ACH or wire using Step 5 (Off-Ramp).
