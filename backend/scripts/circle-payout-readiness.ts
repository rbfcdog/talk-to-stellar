import crypto from 'crypto';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

function text(value: unknown): string {
  return String(value || '').trim();
}

function enabled(value: unknown): boolean {
  return ['1', 'true', 'yes', 'on'].includes(text(value).toLowerCase());
}

function hashPrefix(value: string): string | undefined {
  return value ? crypto.createHash('sha256').update(value).digest('hex').slice(0, 12) : undefined;
}

function idTail(value: string): string | undefined {
  return value ? value.slice(-4) : undefined;
}

function circleBaseUrl(): string {
  const configured = text(process.env.CIRCLE_API_BASE_URL);
  if (configured) return configured.replace(/\/+$/, '');
  const environment = text(process.env.CIRCLE_ENVIRONMENT || process.env.CIRCLE_API_ENVIRONMENT || 'sandbox').toLowerCase();
  return environment === 'production' || environment === 'prod'
    ? 'https://api.circle.com'
    : 'https://api-sandbox.circle.com';
}

const apiKey = text(process.env.CIRCLE_API_KEY);
const destinationId = text(process.env.CIRCLE_PAYOUT_DESTINATION_ID || process.env.CIRCLE_BANK_ACCOUNT_ID);
const destinationType = text(process.env.CIRCLE_PAYOUT_DESTINATION_TYPE) || 'wire';
const baseUrl = circleBaseUrl();
const executionGate = enabled(process.env.ENABLE_REAL_PAYOUT_EXECUTION);
const sandbox = /api-sandbox\.circle\.com/i.test(baseUrl) ||
  text(process.env.CIRCLE_ENVIRONMENT || 'sandbox').toLowerCase() === 'sandbox';
const createUrl = text(process.env.CIRCLE_PAYOUT_CREATE_URL) || `${baseUrl}/v1/businessAccount/payouts`;
const statusUrl = text(process.env.CIRCLE_PAYOUT_STATUS_URL) || `${baseUrl}/v1/businessAccount/payouts/{id}`;
const sandboxReady = Boolean(apiKey && destinationId && executionGate && sandbox);

const blockers = [
  ...(!apiKey ? ['CIRCLE_API_KEY is missing.'] : []),
  ...(!destinationId ? ['CIRCLE_PAYOUT_DESTINATION_ID is missing. Use the linked Circle bank account id.'] : []),
  ...(!executionGate ? ['ENABLE_REAL_PAYOUT_EXECUTION is false.'] : []),
  ...(!sandbox ? ['CIRCLE_ENVIRONMENT is not sandbox. Refuse sandbox readiness claim.'] : []),
];

console.log(JSON.stringify({
  provider: 'circle',
  purpose: 'D2 sandbox payout readiness',
  environment: sandbox ? 'sandbox' : 'production_or_custom',
  api_key_present: Boolean(apiKey),
  api_key_kind: apiKey.startsWith('SAND_API_KEY:') ? 'circle_sandbox_key' : apiKey ? 'configured' : 'missing',
  linked_destination: {
    present: Boolean(destinationId),
    type: destinationType,
    id_hash: hashPrefix(destinationId),
    id_tail: idTail(destinationId),
  },
  source_wallet_id_present: Boolean(text(process.env.CIRCLE_SOURCE_WALLET_ID)),
  execution_gate_enabled: executionGate,
  derived_urls: {
    create_payout: createUrl,
    get_payout: statusUrl,
  },
  ready_for: {
    compatibility_evidence: true,
    circle_sandbox_api_execution: sandboxReady,
  },
  blockers,
  next_action: sandboxReady
    ? 'Run a settled transfer through POST /api/transfers/:id/payout-instruction with provider=circle.'
    : 'Set missing backend env values, restart backend, then re-run this script.',
  safety: [
    'This script does not print API keys or raw bank account IDs.',
    'The linked destination must come from Circle bank-account linking; do not use random strings for execution.',
  ],
}, null, 2));
