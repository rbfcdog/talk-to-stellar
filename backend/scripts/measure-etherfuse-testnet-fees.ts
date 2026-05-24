import dotenv from 'dotenv';
import path from 'path';

import { ETHERFUSE_TESOURO_ISSUER, getAssetIssuer } from '../src/config/assets';
import { EtherfuseClient } from '../src/integrations/regional-starter-pack/anchors/etherfuse';
import type { Quote } from '../src/integrations/regional-starter-pack/anchors/types';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

type Direction = 'onramp' | 'offramp';

interface ParsedArgs {
  onAmount: string;
  offAmount: string;
  customerId?: string;
  stellarAddress?: string;
  baseUrl: string;
  blockchain: string;
  tesouroAsset: string;
  json: boolean;
  debug: boolean;
  createCustomer: boolean;
}

interface FeeProbeResult {
  direction: Direction;
  source_currency: string;
  destination_currency: string;
  source_amount: string;
  destination_before_fee: string;
  destination_after_fee: string;
  provider_fee_amount: string;
  provider_fee_currency_hint: string;
  provider_fee_bps?: string | number;
  provider_fee_percent?: string;
  provider_exchange_rate?: string;
  quote_id: string;
  expires_at?: string;
  empirical_fee_from_destination_delta: string;
  empirical_fee_bps_from_destination_delta?: string;
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];

  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);

  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function coalesce(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return undefined;
}

function required(value: string | undefined, name: string): string {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }
  return normalized;
}

function decimal(value: unknown): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function fixed(value: number, decimals = 8): string {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(decimals).replace(/\.?0+$/, '');
}

function mask(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.length <= 12) return `${value.slice(0, 2)}***${value.slice(-2)}`;
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function parseArgs(): ParsedArgs {
  const tesouroIssuer = coalesce(
    readArg('--tesouro-issuer'),
    process.env.TESOURO_ISSUER,
    getAssetIssuer('TESOURO'),
    ETHERFUSE_TESOURO_ISSUER,
  );

  const tesouroAsset = coalesce(
    readArg('--tesouro-asset'),
    process.env.ETHERFUSE_TESOURO_ASSET,
    tesouroIssuer ? `TESOURO:${tesouroIssuer}` : undefined,
  );

  return {
    onAmount: coalesce(readArg('--on-amount'), process.env.ETHERFUSE_FEE_PROBE_ON_AMOUNT, '100') || '100',
    offAmount: coalesce(readArg('--off-amount'), process.env.ETHERFUSE_FEE_PROBE_OFF_AMOUNT, '100') || '100',
    customerId: coalesce(readArg('--customer-id'), process.env.ETHERFUSE_FEE_PROBE_CUSTOMER_ID),
    stellarAddress: coalesce(
      readArg('--stellar-address'),
      process.env.ETHERFUSE_FEE_PROBE_STELLAR_ADDRESS,
      process.env.STELLAR_PUBLIC_KEY,
    ),
    baseUrl: coalesce(readArg('--base-url'), process.env.ETHERFUSE_BASE_URL, 'https://api.sand.etherfuse.com') || 'https://api.sand.etherfuse.com',
    blockchain: coalesce(readArg('--blockchain'), process.env.ETHERFUSE_BLOCKCHAIN, 'stellar') || 'stellar',
    tesouroAsset: required(tesouroAsset, 'TESOURO asset identifier'),
    json: hasFlag('--json'),
    debug: hasFlag('--debug'),
    createCustomer: hasFlag('--create-customer'),
  };
}

async function withoutClientInfoLogs<T>(debug: boolean, fn: () => Promise<T>): Promise<T> {
  if (debug) return fn();

  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    const first = String(args[0] || '');
    if (first.startsWith('[Etherfuse]')) return;
    originalLog(...args);
  };
  console.error = (...args: unknown[]) => {
    const first = String(args[0] || '');
    if (first.startsWith('[Etherfuse]')) return;
    originalError(...args);
  };

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function summarizeQuote(direction: Direction, quote: Quote): FeeProbeResult {
  const before = coalesce(quote.destinationAmountBeforeFee, quote.toAmount, '0') || '0';
  const after = coalesce(quote.destinationAmountAfterFee, quote.toAmount, '0') || '0';
  const feeFromDelta = Math.max(decimal(before) - decimal(after), 0);
  const beforeNumber = decimal(before);
  const providerFeeBps = quote.feeBps;
  const providerFeeBpsNumber = decimal(providerFeeBps);

  return {
    direction,
    source_currency: quote.fromCurrency,
    destination_currency: quote.toCurrency,
    source_amount: quote.fromAmount,
    destination_before_fee: before,
    destination_after_fee: after,
    provider_fee_amount: coalesce(quote.feeAmount, quote.fee, '0') || '0',
    provider_fee_currency_hint: 'BRL',
    provider_fee_bps: providerFeeBps,
    provider_fee_percent: providerFeeBpsNumber > 0 ? fixed(providerFeeBpsNumber / 100, 4) : undefined,
    provider_exchange_rate: quote.exchangeRate,
    quote_id: quote.id,
    expires_at: quote.expiresAt,
    empirical_fee_from_destination_delta: fixed(feeFromDelta),
    empirical_fee_bps_from_destination_delta: beforeNumber > 0
      ? fixed((feeFromDelta / beforeNumber) * 10000, 4)
      : undefined,
  };
}

function printHuman(results: FeeProbeResult[], args: ParsedArgs): void {
  console.log('Etherfuse testnet/sandbox fee probe');
  console.log(`- base URL: ${args.baseUrl}`);
  console.log(`- blockchain: ${args.blockchain}`);
  console.log(`- customer: ${mask(args.customerId)}`);
  console.log(`- wallet: ${mask(args.stellarAddress)}`);
  console.log(`- TESOURO asset: ${args.tesouroAsset}`);
  console.log('');

  for (const result of results) {
    const label = result.direction === 'onramp'
      ? 'ON-RAMP BRL -> TESOURO'
      : 'OFF-RAMP TESOURO -> BRL';

    console.log(label);
    console.log(`- quote_id: ${result.quote_id}`);
    console.log(`- source: ${result.source_amount} ${result.source_currency}`);
    console.log(`- destination before fee: ${result.destination_before_fee} ${result.destination_currency}`);
    console.log(`- destination after fee: ${result.destination_after_fee} ${result.destination_currency}`);
    console.log(`- provider feeAmount: ${result.provider_fee_amount} ${result.provider_fee_currency_hint}`);
    console.log(`- provider feeBps: ${result.provider_fee_bps ?? '(not returned)'}`);
    console.log(`- provider feePercent: ${result.provider_fee_percent ? `${result.provider_fee_percent}%` : '(not returned)'}`);
    console.log(`- empirical fee from before/after delta: ${result.empirical_fee_from_destination_delta} ${result.destination_currency}`);
    console.log(`- empirical fee bps from destination delta: ${result.empirical_fee_bps_from_destination_delta ?? '(not calculable)'}`);
    console.log(`- exchangeRate: ${result.provider_exchange_rate ?? '(not returned)'}`);
    console.log(`- expiresAt: ${result.expires_at ?? '(not returned)'}`);
    console.log('');
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const apiKey = required(
    coalesce(process.env.ETHERFUSE_API_KEY, process.env.ETHERFUSE_SANDBOX_API_KEY),
    'ETHERFUSE_API_KEY or ETHERFUSE_SANDBOX_API_KEY',
  );
  const stellarAddress = required(args.stellarAddress, 'ETHERFUSE_FEE_PROBE_STELLAR_ADDRESS or --stellar-address');

  const client = new EtherfuseClient({
    apiKey,
    baseUrl: args.baseUrl.replace(/\/$/, ''),
    defaultBlockchain: args.blockchain,
  });

  let customerId = args.customerId;
  if (!customerId && args.createCustomer) {
    const customer = await withoutClientInfoLogs(args.debug, () => client.createCustomer({
      publicKey: stellarAddress,
      email: coalesce(process.env.ETHERFUSE_FEE_PROBE_EMAIL, 'fee-probe@talktostellar.local'),
      country: 'BR',
    }));
    customerId = customer.id;
  }

  customerId = required(customerId, 'ETHERFUSE_FEE_PROBE_CUSTOMER_ID, --customer-id, or --create-customer');

  const [onRampQuote, offRampQuote] = await withoutClientInfoLogs(args.debug, async () => Promise.all([
    client.getQuote({
      customerId,
      stellarAddress,
      fromCurrency: 'BRL',
      toCurrency: args.tesouroAsset,
      fromAmount: args.onAmount,
    }),
    client.getQuote({
      customerId,
      stellarAddress,
      fromCurrency: args.tesouroAsset,
      toCurrency: 'BRL',
      fromAmount: args.offAmount,
    }),
  ]));

  const results = [
    summarizeQuote('onramp', onRampQuote),
    summarizeQuote('offramp', offRampQuote),
  ];

  if (args.json) {
    console.log(JSON.stringify({
      success: true,
      measured_at: new Date().toISOString(),
      provider: 'etherfuse',
      environment: args.baseUrl,
      blockchain: args.blockchain,
      customer_id_tail: customerId.slice(-8),
      wallet_tail: stellarAddress.slice(-8),
      results,
    }, null, 2));
    return;
  }

  printHuman(results, { ...args, customerId, stellarAddress });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
