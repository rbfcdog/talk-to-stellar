/**
 * Bridge.xyz Integration — Simulation
 *
 * Simulates a full PIX → USDC → ACH flow using mock Bridge API responses.
 * Demonstrates the customer lifecycle: creation, KYC, PIX on-ramp,
 * and USDC ACH off-ramp.
 *
 * Run: npx ts-node bridge/simulate.ts
 */

import crypto from 'crypto';

// ── Simulation Config ────────────────────────────────────────────

const SIM = {
  customerId: `cust_sim_${Date.now().toString(36)}`,
  stellarAddress: 'GDUCMSVRZGYJATZTQRYLK6XUKHWXIOTGYYJKDXHQXOIBNZGX3BWXQDA3',
  pixKey: 'simulado@talktostellar.com',
  ownerName: 'Rodrigo Banin',
  amountBrl: '100.00',
  amountUsd: '18.50',
  cpf: '12345678900',
  usBank: {
    routingNumber: '101019644',
    accountNumber: '215268129123',
    accountType: 'checking' as const,
    bankName: 'Lead Bank',
    streetLine1: '923 Folsom Street',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94107',
  },
};

// ── Mock Bridge API ──────────────────────────────────────────────

let mockKycApproved = false;

function uuid() {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function fmt(value: string, decimals = 2): string {
  return Number(value).toFixed(decimals);
}

// ── Simulated Responses ──────────────────────────────────────────

function createCustomerResponse() {
  return {
    id: SIM.customerId,
    first_name: SIM.ownerName.split(' ')[0],
    last_name: SIM.ownerName.split(' ').slice(1).join(' '),
    email: 'sim@talktostellar.com',
    type: 'individual',
    kyc_status: mockKycApproved ? 'approved' : 'not_started',
    country: 'BR',
    created_at: now(),
    updated_at: now(),
  };
}

function createKycLinkResponse() {
  return {
    id: `kyc_${uuid().slice(0, 8)}`,
    customer_id: SIM.customerId,
    url: `https://bridge.xyz/kyc/sim_${uuid().slice(0, 8)}`,
    status: 'not_started',
    created_at: now(),
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function createPixVirtualAccountResponse() {
  return {
    id: `va_${uuid().slice(0, 8)}`,
    status: 'activated',
    customer_id: SIM.customerId,
    developer_fee_percent: '0.30',
    source_deposit_instructions: {
      currency: 'brl',
      payment_rail: 'pix',
      pix_key: SIM.pixKey,
      pix_qr_code: '[QR Code Base64]',
    },
    destination: {
      payment_rail: 'stellar',
      currency: 'usdc',
      address: SIM.stellarAddress,
    },
    created_at: now(),
    updated_at: now(),
  };
}

function createPixExternalAccountResponse() {
  return {
    id: `ea_${uuid().slice(0, 8)}`,
    customer_id: SIM.customerId,
    active: true,
    currency: 'brl',
    account_type: 'pix_key',
    pix_key: SIM.pixKey.toLowerCase(),
    account_owner_type: 'individual',
    account_owner_name: SIM.ownerName,
    created_at: now(),
    updated_at: now(),
  };
}

function createUsBankExternalAccountResponse() {
  return {
    id: `ea_${uuid().slice(0, 8)}`,
    customer_id: SIM.customerId,
    active: true,
    currency: 'usd',
    account_type: 'us',
    first_name: SIM.ownerName.split(' ')[0],
    last_name: SIM.ownerName.split(' ').slice(1).join(' '),
    account_owner_type: 'individual',
    account_owner_name: SIM.ownerName,
    bank_name: SIM.usBank.bankName,
    account: {
      last_4: SIM.usBank.accountNumber.slice(-4),
      routing_number: SIM.usBank.routingNumber,
      checking_or_savings: SIM.usBank.accountType,
    },
    created_at: now(),
    updated_at: now(),
  };
}

function createPixOnRampTransferResponse() {
  return {
    id: `xfer_${uuid().slice(0, 8)}`,
    state: 'awaiting_funds',
    on_behalf_of: SIM.customerId,
    amount: SIM.amountBrl,
    developer_fee_percent: '0.30',
    source: {
      payment_rail: 'pix',
      currency: 'brl',
      amount: SIM.amountBrl,
    },
    destination: {
      payment_rail: 'stellar',
      currency: 'usdc',
      address: SIM.stellarAddress,
    },
    source_deposit_instructions: {
      currency: 'brl',
      payment_rail: 'pix',
      pix_key: SIM.pixKey,
      amount: SIM.amountBrl,
      deposit_message: 'TTS_PIX_DEPOSIT',
    },
    receipt: {
      initial_amount: SIM.amountBrl,
      developer_fee: fmt(Number(SIM.amountBrl) * 0.003),
      exchange_fee: fmt(Number(SIM.amountBrl) * 0.005),
      final_amount: fmt(Number(SIM.amountBrl) * 0.992),
    },
    created_at: now(),
    updated_at: now(),
  };
}

function createAchOffRampTransferResponse() {
  return {
    id: `xfer_${uuid().slice(0, 8)}`,
    state: 'awaiting_funds',
    on_behalf_of: SIM.customerId,
    amount: SIM.amountUsd,
    developer_fee_percent: '0.30',
    source: {
      payment_rail: 'stellar',
      currency: 'usdc',
      from_address: SIM.stellarAddress,
    },
    destination: {
      amount: SIM.amountUsd,
      payment_rail: 'ach',
      currency: 'usd',
      external_account_id: `ea_${uuid().slice(0, 8)}`,
      ach_reference: 'TTS PAYOUT',
    },
    receipt: {
      initial_amount: SIM.amountUsd,
      developer_fee: fmt(Number(SIM.amountUsd) * 0.003),
      exchange_fee: fmt(Number(SIM.amountUsd) * 0.002),
      final_amount: fmt(Number(SIM.amountUsd) * 0.995),
      destination_tx_hash: '0x' + uuid().replace(/-/g, ''),
    },
    created_at: now(),
    updated_at: now(),
  };
}

// ── Simulation ───────────────────────────────────────────────────

function header(title: string) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'═'.repeat(60)}`);
}

function step(n: number, label: string) {
  console.log(`\n[Step ${n}] ${label}`);
  console.log(`${'─'.repeat(50)}`);
}

function json(obj: unknown) {
  console.log(JSON.stringify(obj, null, 2));
}

async function simulate() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     Bridge.xyz — PIX → USDC on Stellar → ACH (USD)       ║');
  console.log('║     Full Flow Simulation                                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // ── Phase 1: Customer Onboarding ─────────────────────────────

  header('Phase 1: Customer Onboarding');

  step(1, 'Create Customer');
  const customer = createCustomerResponse();
  console.log(`  Customer ID: ${customer.id}`);
  console.log(`  Name: ${customer.first_name} ${customer.last_name}`);
  console.log(`  Country: ${customer.country}`);
  console.log(`  KYC Status: ${customer.kyc_status}`);

  step(2, 'Generate KYC Link');
  const kycLink = createKycLinkResponse();
  console.log(`  KYC URL: ${kycLink.url}`);
  console.log(`  Expires: ${kycLink.expires_at}`);
  console.log(`  → Send this link to user via WhatsApp/Telegram`);

  step(3, 'User Completes KYC');
  mockKycApproved = true;
  console.log(`  ✓ CPF submitted: ${SIM.cpf}`);
  console.log(`  ✓ Selfie submitted`);
  console.log(`  ✓ KYC Status: approved`);
  console.log(`  → Bridge webhook: customer.kyc_approved`);

  // ── Phase 2: PIX On-Ramp (BRL → USDC on Stellar) ────────────

  header('Phase 2: PIX On-Ramp (BRL → USDC on Stellar)');

  step(4, 'Create PIX Virtual Account');
  const pixVa = createPixVirtualAccountResponse();
  console.log(`  Virtual Account ID: ${pixVa.id}`);
  console.log(`  Status: ${pixVa.status}`);
  console.log(`  PIX Key: ${pixVa.source_deposit_instructions.pix_key}`);
  console.log(`  Destination: Stellar ${pixVa.destination.address.slice(0, 8)}...`);
  console.log(`  Developer Fee: ${pixVa.developer_fee_percent}%`);
  console.log(`  → Tell user: "Send PIX to ${pixVa.source_deposit_instructions.pix_key}"`);

  step(5, 'User Sends PIX Payment');
  console.log(`  Amount: R$ ${SIM.amountBrl}`);
  console.log(`  From: user's bank account`);
  console.log(`  To: Bridge PIX key (${SIM.pixKey})`);
  console.log(`  → Bridge webhook: virtual_account.deposit_received`);

  step(6, 'Bridge Auto-Converts and Settles');
  const onRampTransfer = createPixOnRampTransferResponse();
  onRampTransfer.state = 'completed';
  console.log(`  Transfer ID: ${onRampTransfer.id}`);
  console.log(`  State: ${onRampTransfer.state}`);
  console.log(`  Source: R$ ${onRampTransfer.receipt.initial_amount}`);
  console.log(`  Developer Fee: R$ ${onRampTransfer.receipt.developer_fee}`);
  console.log(`  Bridge Fee: R$ ${onRampTransfer.receipt.exchange_fee}`);
  console.log(`  Net Received: R$ ${onRampTransfer.receipt.final_amount} equivalent in USDC`);
  console.log(`  Destination: Stellar ${SIM.stellarAddress.slice(0, 8)}...`);
  console.log(`  → Bridge webhook: transfer.completed`);
  console.log(`  → TalkToStellar shows: "R$ ${SIM.amountBrl} converted to USDC ✓"`);

  // ── Phase 3: Register Off-Ramp Destinations ──────────────────

  header('Phase 3: Register Off-Ramp Destinations');

  step(7, 'Add PIX Key (for future PIX withdrawals)');
  const pixExternal = createPixExternalAccountResponse();
  console.log(`  External Account ID: ${pixExternal.id}`);
  console.log(`  Type: PIX key → ${pixExternal.pix_key}`);
  console.log(`  Active: ${pixExternal.active}`);

  step(8, 'Add US Bank Account (for ACH withdrawals)');
  const usBankExternal = createUsBankExternalAccountResponse();
  console.log(`  External Account ID: ${usBankExternal.id}`);
  console.log(`  Type: US Bank (${usBankExternal.bank_name})`);
  console.log(`  Account: ****${usBankExternal.account?.last_4}`);
  console.log(`  Routing: ${usBankExternal.account?.routing_number}`);
  console.log(`  Owner: ${usBankExternal.account_owner_name}`);
  console.log(`  Active: ${usBankExternal.active}`);

  // ── Phase 4: USDC → ACH Off-Ramp ────────────────────────────

  header('Phase 4: USDC → ACH Off-Ramp (Stellar → US Bank)');

  step(9, 'Create ACH Off-Ramp Transfer');
  const achTransfer = createAchOffRampTransferResponse();
  console.log(`  Transfer ID: ${achTransfer.id}`);
  console.log(`  State: ${achTransfer.state}`);
  console.log(`  Source: USDC on Stellar (${SIM.stellarAddress.slice(0, 8)}...)`);
  console.log(`  Destination: $${SIM.amountUsd} via ACH to bank ****${SIM.usBank.accountNumber.slice(-4)}`);
  console.log(`  Reference: TTS PAYOUT`);
  console.log(`  Developer Fee: $${achTransfer.receipt.developer_fee}`);
  console.log(`  Bridge Fee: $${achTransfer.receipt.exchange_fee}`);
  console.log(`  Net: $${achTransfer.receipt.final_amount}`);

  step(10, 'Transfer Completes');
  achTransfer.state = 'completed';
  console.log(`  State: ${achTransfer.state}`);
  console.log(`  Destination Tx Hash: ${achTransfer.receipt.destination_tx_hash}`);
  console.log(`  → Bridge webhook: transfer.completed`);
  console.log(`  → User receives: "$${SIM.amountUsd} sent to bank ****${SIM.usBank.accountNumber.slice(-4)} ✓"`);

  // ── Summary ──────────────────────────────────────────────────

  header('Transaction Summary');

  const devFeeBrl = fmt(Number(SIM.amountBrl) * 0.003);
  const bridgeFeeBrl = fmt(Number(SIM.amountBrl) * 0.005);
  const netBrl = fmt(Number(SIM.amountBrl) * 0.992);

  const devFeeUsd = fmt(Number(SIM.amountUsd) * 0.003);
  const bridgeFeeUsd = fmt(Number(SIM.amountUsd) * 0.002);
  const netUsd = fmt(Number(SIM.amountUsd) * 0.995);

  console.log(`
  ┌─────────────────────────────────────────────────────────┐
  │                   TALKTOSTELLAR RECEIPT                  │
  ├─────────────────────────────────────────────────────────┤
  │                                                         │
  │  PIX On-Ramp                                            │
  │    Sent:           R$ ${SIM.amountBrl.padEnd(35)}│
  │    TalkToStellar:  R$ ${devFeeBrl.padEnd(35)}│
  │    Bridge:         R$ ${bridgeFeeBrl.padEnd(35)}│
  │    Received (net): R$ ${netBrl.padEnd(35)}│
  │    Asset:          USDC on Stellar                       │
  │    Status:         ✓ Completed                           │
  │                                                         │
  │  ACH Off-Ramp                                            │
  │    Sent:           $${SIM.amountUsd.padEnd(36)}│
  │    TalkToStellar:  $${devFeeUsd.padEnd(36)}│
  │    Bridge:         $${bridgeFeeUsd.padEnd(36)}│
  │    Received (net): $${netUsd.padEnd(36)}│
  │    Destination:    US Bank ****${SIM.usBank.accountNumber.slice(-4).padEnd(26)}│
  │    Status:         ✓ Completed                           │
  │                                                         │
  │  Total Fees:                                              │
  │    TalkToStellar:  0.30% (configurable)                  │
  │    Bridge:          ~0.50% PIX / ~0.20% ACH (estimated)  │
  │    Traditional:     ~3.50%                               │
  │    You saved:       ~2.70%                               │
  │                                                         │
  └─────────────────────────────────────────────────────────┘
  `);

  // ── API Call Log ─────────────────────────────────────────────

  header('Bridge API Call Log (10 requests total)');

  const calls = [
    { method: 'POST', path: '/v0/customers', idempotency: `cust_${uuid().slice(0, 8)}`, status: 201 },
    { method: 'POST', path: `/v0/customers/${SIM.customerId}/kyc_links`, idempotency: `kyc_${uuid().slice(0, 8)}`, status: 201 },
    { method: 'POST', path: `/v0/customers/${SIM.customerId}/virtual_accounts`, idempotency: `va_${uuid().slice(0, 8)}`, status: 201 },
    { method: 'POST', path: '/v0/transfers', idempotency: `xfer_${uuid().slice(0, 8)}`, status: 201 },
    { method: 'POST', path: `/v0/customers/${SIM.customerId}/external_accounts`, idempotency: `ea_${uuid().slice(0, 8)}`, status: 201 },
    { method: 'POST', path: `/v0/customers/${SIM.customerId}/external_accounts`, idempotency: `ea_${uuid().slice(0, 8)}`, status: 201 },
    { method: 'POST', path: '/v0/transfers', idempotency: `xfer_${uuid().slice(0, 8)}`, status: 201 },
  ];

  for (const call of calls) {
    console.log(`  ${call.method.padEnd(6)} ${call.path.padEnd(55)} → ${call.status}`);
  }

  // ── Webhook Events Received ──────────────────────────────────

  header('Bridge Webhooks Received (4 events)');

  const webhooks = [
    { type: 'customer.kyc_approved', data: { customer_id: SIM.customerId } },
    { type: 'virtual_account.deposit_received', data: { virtual_account_id: pixVa.id, amount: SIM.amountBrl, currency: 'brl' } },
    { type: 'transfer.completed', data: { transfer_id: onRampTransfer.id, state: 'completed' } },
    { type: 'transfer.completed', data: { transfer_id: achTransfer.id, state: 'completed' } },
  ];

  for (const wh of webhooks) {
    console.log(`  ✓ ${wh.type.padEnd(42)} ${JSON.stringify(wh.data)}`);
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              Simulation Complete                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
}

simulate().catch(console.error);
