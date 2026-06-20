/**
 * Payment Watcher — Horizon SSE → WhatsApp
 *
 * Maintains a long-lived SSE connection to Horizon for each active wallet.
 * When a USDC payment arrives, looks up the user's phone number via agent_sessions
 * and sends a WhatsApp notification via EvolutionService.sendText().
 *
 * Start at boot: PaymentWatcherService.start()
 * Subscribe a new wallet: PaymentWatcherService.subscribe(publicKey)
 */

import { Horizon } from '@stellar/stellar-sdk';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

// EvolutionService is huge — import only what we need
const EVOLUTION_BASE_URL = process.env.EVOLUTION_API_URL || 'http://localhost:8080';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || process.env.EVOLUTION_INSTANCE_NAME || '';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const HORIZON_URL = process.env.STELLAR_NETWORK === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
const USDC_ISSUER_MAINNET = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const USDC_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

function getUsdcIssuer() {
  return process.env.STELLAR_NETWORK === 'mainnet' ? USDC_ISSUER_MAINNET : USDC_ISSUER_TESTNET;
}

async function sendWhatsApp(phone: string, text: string): Promise<void> {
  if (!EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) return;
  try {
    const url = `${EVOLUTION_BASE_URL}/message/sendText/${encodeURIComponent(EVOLUTION_INSTANCE)}`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number: phone, text }),
    });
  } catch (e: any) {
    logger.warn(`[payment-watcher] sendWhatsApp failed: ${e.message}`);
  }
}

async function lookupPhone(stellarAddress: string): Promise<string | null> {
  // Check wallets table → agent_sessions join
  const { data } = await supabase
    .from('wallets')
    .select('session_id, agent_sessions(phone_number)')
    .eq('public_key', stellarAddress)
    .maybeSingle();
  if (data?.agent_sessions) {
    const s = data.agent_sessions as any;
    return s.phone_number || null;
  }
  // Also check user_stellar_wallets
  const { data: d2 } = await supabase
    .from('user_stellar_wallets')
    .select('user_id')
    .eq('public_key', stellarAddress)
    .maybeSingle();
  if (d2?.user_id) {
    const { data: d3 } = await supabase
      .from('agent_sessions')
      .select('phone_number')
      .eq('user_id', d2.user_id)
      .not('phone_number', 'is', null)
      .limit(1)
      .maybeSingle();
    return d3?.phone_number || null;
  }
  return null;
}

async function formatPaymentMessage(payment: any, to: string): Promise<string> {
  const amount = parseFloat(payment.amount || '0').toFixed(2);
  const assetCode = payment.asset_code || (payment.asset_type === 'native' ? 'XLM' : 'USDC');
  const from = payment.from ? `${payment.from.slice(0, 8)}...${payment.from.slice(-4)}` : 'alguém';

  // Get current balance
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${to}`);
    const account = await res.json() as any;
    const usdcBalance = account.balances?.find((b: any) =>
      b.asset_code === 'USDC' && b.asset_issuer === getUsdcIssuer()
    )?.balance || '0';
    return `💸 Você recebeu ${amount} ${assetCode}!\n\nSaldo USDC: $${parseFloat(usdcBalance).toFixed(2)}\n\nDe: ${from}\n\nDigite /saldo para ver detalhes.`;
  } catch {
    return `💸 Você recebeu ${amount} ${assetCode}! Digite /saldo para ver seu saldo.`;
  }
}

class PaymentWatcherService {
  private streams = new Map<string, any>();
  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    logger.info('[payment-watcher] Starting — loading active wallets from DB');
    await this.loadAndSubscribeAll();
  }

  private async loadAndSubscribeAll(): Promise<void> {
    try {
      // Load from wallets table
      const { data: wallets } = await supabase
        .from('wallets')
        .select('public_key')
        .not('public_key', 'is', null)
        .limit(500);

      // Load from user_stellar_wallets
      const { data: stellarWallets } = await supabase
        .from('user_stellar_wallets')
        .select('public_key')
        .limit(500);

      const keys = new Set<string>();
      wallets?.forEach((w: any) => { if (w.public_key) keys.add(w.public_key); });
      stellarWallets?.forEach((w: any) => { if (w.public_key) keys.add(w.public_key); });

      logger.info(`[payment-watcher] Subscribing to ${keys.size} wallets`);
      for (const key of keys) {
        this.subscribe(key);
        // Stagger connections to avoid hammering Horizon
        await new Promise(r => setTimeout(r, 50));
      }
    } catch (e: any) {
      logger.warn(`[payment-watcher] loadAndSubscribeAll failed: ${e.message}`);
    }
  }

  subscribe(publicKey: string): void {
    if (this.streams.has(publicKey)) return;

    const server = new Horizon.Server(HORIZON_URL);
    const stream = server
      .payments()
      .forAccount(publicKey)
      .cursor('now')
      .stream({
        onmessage: async (payment: any) => {
          try {
            if (payment.to !== publicKey) return;
            if (payment.type !== 'payment' && payment.type !== 'path_payment_strict_send' && payment.type !== 'path_payment_strict_receive') return;

            // Only notify for USDC (and XLM as fallback)
            const isUsdc = payment.asset_code === 'USDC' && payment.asset_issuer === getUsdcIssuer();
            const isXlm = payment.asset_type === 'native';
            if (!isUsdc && !isXlm) return;

            logger.info(`[payment-watcher] Payment received address=${publicKey.slice(0,8)}... amount=${payment.amount} asset=${payment.asset_code || 'XLM'}`);

            const phone = await lookupPhone(publicKey);
            if (!phone) return;

            const message = await formatPaymentMessage(payment, publicKey);
            await sendWhatsApp(phone, message);
            logger.info(`[payment-watcher] WhatsApp notification sent to ***${phone.slice(-4)}`);
          } catch (e: any) {
            logger.warn(`[payment-watcher] onmessage error: ${e.message}`);
          }
        },
        onerror: (err: any) => {
          logger.warn(`[payment-watcher] SSE error for ${publicKey.slice(0,8)}...: ${err?.message || err}`);
          // Remove and let restart handle reconnection
          this.streams.delete(publicKey);
          // Reconnect after 30s
          setTimeout(() => this.subscribe(publicKey), 30_000);
        },
      });

    this.streams.set(publicKey, stream);
    logger.debug(`[payment-watcher] Subscribed to ${publicKey.slice(0,8)}...`);
  }

  unsubscribe(publicKey: string): void {
    const stream = this.streams.get(publicKey);
    if (stream) {
      try { (stream as any)(); } catch {}
      this.streams.delete(publicKey);
    }
  }

  status(): { watching: number; addresses: string[] } {
    const addresses = [...this.streams.keys()];
    return { watching: addresses.length, addresses };
  }
}

export const paymentWatcher = new PaymentWatcherService();
