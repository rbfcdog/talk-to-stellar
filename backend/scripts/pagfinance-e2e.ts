import 'dotenv/config';
import crypto from 'crypto';

const HELP = `
PagFinance cash-in end-to-end tool.

Default flow (against the PagFinance API):
  health -> ensure user (+ KYC override) -> mint JWT -> quote -> intent -> print QR

  npm run pagfinance:e2e -- --pubkey G...            # user identity = Stellar public key
  npm run pagfinance:e2e -- --session-id <id>        # resolve pubkey from a local session
  Options: --amount <brl> (default 5), --name <nome>, --cpf <cpf>,
           --wait-minutes <n> (poll intent status after creation)

Replay mode (exercises webhook verify -> dedupe -> credit end-to-end):
  npm run pagfinance:e2e -- --replay-webhook <intentId> [--backend-url http://localhost:3001]

  Builds a synthetic CASHIN_COMPLETED envelope from the LOCAL operation record,
  signs the compact JSON with PAGFINANCE_WEBHOOK_SECRET and posts it to the
  running backend. Also the production recovery tool for stuck credits.

Sandbox note: sandbox banking runs in dry-run — a cash-in intent never
completes by itself (there is no simulate-payment endpoint for cash-in), so
the paid-path is only observable via --replay-webhook or in production.
`;

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function mask(value: string, keep = 6): string {
  return value.length <= keep ? '***' : `${value.slice(0, keep)}…(${value.length} chars)`;
}

const TEST_NAME = 'Ana Silva';
const TEST_CPF = '52998224725';

async function resolvePubkey(): Promise<string> {
  const direct = argValue('--pubkey');
  if (direct) return direct;
  const sessionId = argValue('--session-id');
  if (!sessionId) {
    throw new Error('Pass --pubkey G... or --session-id <id> (see --help).');
  }
  const { supabase } = await import('../src/config/supabase');
  const { WalletRepository } = await import('../src/api/repository/core/wallet.repository');
  const wallet = await new WalletRepository(supabase).getWalletBySession(sessionId);
  const publicKey = String(wallet?.public_key || '').trim();
  if (!publicKey) throw new Error(`No wallet found for session ${sessionId}.`);
  return publicKey;
}

async function defaultFlow() {
  const { loadPagfinanceConfig, validatePagfinanceConfig, initPagfinanceService } = await import(
    '../src/integrations/pagfinance'
  );
  const config = loadPagfinanceConfig();
  const missing = validatePagfinanceConfig(config);
  if (missing.length > 0) throw new Error(`Missing required env: ${missing.join(', ')}`);

  const service = initPagfinanceService();
  if (!service.enabled) throw new Error('PagFinance integration is disabled (set PAGFINANCE_ENABLED=true).');

  console.log(`[1/5] health check ${config.baseUrl}/healthz`);
  const health: any = await fetch(`${config.baseUrl}/healthz`)
    .then((r) => r.json())
    .catch((e) => ({ ok: false, error: String(e) }));
  console.log(`      ${JSON.stringify(health)}`);
  if (!health?.ok) throw new Error('PagFinance health check failed.');

  const pubkey = await resolvePubkey();
  console.log(`[2/5] ensure user + KYC override for ${pubkey}`);
  await service.ensureUser(pubkey, { name: argValue('--name') || TEST_NAME });

  console.log('[3/5] mint user JWT');
  const jwt = await service.getUserJwt(pubkey);
  console.log(`      token=${mask(jwt)}`);

  const amount = Number(argValue('--amount') || 5);
  console.log(`[4/5] quote R$ ${amount}`);
  try {
    const quote = await service.createQuote(pubkey, { amount });
    console.log(`      pagfinance estimate: ${JSON.stringify(quote?.valuesAndFees ?? quote)}`);
    try {
      const { BrlReferenceRateService } = await import('../src/api/services/brl-reference-rate.service');
      const ours = await BrlReferenceRateService.quoteBrlToUsdc(amount);
      console.log(`      our locked-rate estimate: ${ours.destinationAmount} USDC (brl_per_usdc=${ours.brlPerUsdc})`);
    } catch (e: any) {
      console.log(`      our rate quote unavailable here (${e?.message || e}) — the API applies the fallback policy.`);
    }
  } catch (e: any) {
    console.log(`      quote failed (${e?.message || e}) — continuing, quote is advisory.`);
  }

  console.log('[5/5] create intent');
  const { PagfinanceClient } = await import('../src/integrations/pagfinance');
  const intent = await service.createIntent(
    pubkey,
    {
      amount,
      customer: { name: argValue('--name') || TEST_NAME, taxID: (argValue('--cpf') || TEST_CPF).replace(/\D+/g, '') },
      expiresIn: config.intentExpiresInSeconds,
      comment: 'TalkToStellar E2E',
    },
    PagfinanceClient.idempotencyKey('pgf_e2e'),
  );
  console.log(JSON.stringify({
    intentId: intent.intentId,
    status: intent.status,
    valueCents: intent.valueCents,
    brCode: intent.brCode,
    paymentLinkUrl: intent.paymentLinkUrl ?? null,
    qrCodeImage: intent.qrCodeImage ?? null,
    expiresIn: intent.expiresIn ?? null,
    cryptoEstimate: intent.cryptoEstimate ?? null,
  }, null, 2));

  const waitMinutes = Number(argValue('--wait-minutes') || 0);
  if (waitMinutes > 0) {
    console.log(`Polling intent every 5s for up to ${waitMinutes}min (sandbox Pix is dry-run — expect ACTIVE)…`);
    const deadline = Date.now() + waitMinutes * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5_000));
      const status = await service.getIntent(pubkey, intent.intentId);
      process.stdout.write(`  ${new Date().toISOString()} status=${status.status}\n`);
      if (status.status === 'COMPLETED' || status.status === 'EXPIRED') break;
    }
  }
}

async function replayFlow(intentId: string) {
  const secret = String(process.env.PAGFINANCE_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('PAGFINANCE_WEBHOOK_SECRET is required for --replay-webhook.');
  const backendUrl = String(argValue('--backend-url') || 'http://localhost:3001').replace(/\/$/, '');

  const { findOperationByPagfinanceIntentId } = await import('../src/integrations/pagfinance/settlement');
  const operation = await findOperationByPagfinanceIntentId(intentId);
  if (!operation) throw new Error(`No local operation found for intent ${intentId}.`);
  const context = JSON.parse(String(operation.context || '{}'));
  console.log(`operation ${operation.id} status=${operation.status} value_cents=${context.value_cents}`);

  const destination = String(operation.source_public_key || '');
  const { server } = await import('../src/config/stellar');
  const { resolveConfiguredAsset } = await import('../src/config/assets');
  const usdc = resolveConfiguredAsset('USDC');
  const usdcBalance = async () => {
    try {
      const account = await server.loadAccount(destination);
      const line = account.balances.find(
        (b: any) => b.asset_code === usdc.code && b.asset_issuer === usdc.issuer,
      );
      return line ? Number((line as any).balance) : 0;
    } catch {
      return null;
    }
  };
  const balanceBefore = await usdcBalance();

  const envelope = {
    event: 'CASHIN_COMPLETED',
    intentId,
    status: 'COMPLETED',
    timestamp: new Date().toISOString(),
    data: {
      intentId,
      correlationID: context.correlation_id ?? intentId,
      walletAddress: destination,
      valueCents: context.value_cents ?? Math.round(Number(operation.amount || 0) * 100),
      transactionID: `replay_${Date.now().toString(36)}`,
      completedAt: new Date().toISOString(),
    },
  };
  const rawBody = JSON.stringify(envelope);
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

  console.log(`POST ${backendUrl}/webhook/pagfinance`);
  const response = await fetch(`${backendUrl}/webhook/pagfinance`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Signature': signature,
      'X-App-Event': 'CASHIN_COMPLETED',
    },
    body: rawBody,
  });
  console.log(`  ${response.status} ${JSON.stringify(await response.json().catch(() => null))}`);

  console.log('Polling operation status (up to 90s)…');
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000));
    const current = await findOperationByPagfinanceIntentId(intentId);
    const status = String(current?.status || '?');
    process.stdout.write(`  status=${status}\n`);
    if (status === 'COMPLETED' || status === 'FAILED') {
      const finalContext = JSON.parse(String(current?.context || '{}'));
      console.log(JSON.stringify({
        status,
        stellar_transaction_hash: current?.stellar_transaction_hash ?? null,
        credited_usdc: finalContext.credited_usdc ?? null,
        credit_error: finalContext.credit_error ?? null,
      }, null, 2));
      break;
    }
  }

  const balanceAfter = await usdcBalance();
  if (balanceBefore != null && balanceAfter != null) {
    console.log(`USDC balance ${destination}: ${balanceBefore} -> ${balanceAfter} (delta ${(balanceAfter - balanceBefore).toFixed(7)})`);
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(HELP.trim());
    return;
  }
  const replayIntent = argValue('--replay-webhook');
  if (replayIntent) return replayFlow(replayIntent);
  return defaultFlow();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
