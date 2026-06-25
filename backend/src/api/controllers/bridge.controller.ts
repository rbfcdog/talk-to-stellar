import type { Request, Response } from "express";
import { getBridgeService } from "../../integrations/bridge";
import { logger } from "../../utils/logger";
import { assertBridgeAmountInRange } from "../middlewares/bridge-mainnet.middleware";
import { mainnetServer } from "../../config/stellar";
import { PUBLIC_USDC_ISSUER } from "../../config/assets";
import { supabase } from "../../config/supabase";
import { Asset, Keypair, Operation, TransactionBuilder, Networks } from "@stellar/stellar-sdk";
import { VaultService } from "../services/core/vault.service";
import { DefindexYieldService } from "../services/defindex-yield.service";
import { DEFINDEX_USDC_VAULT_MAINNET } from "../../integrations/defindex/config";
import { BlendService } from "../../integrations/blend/service";

function readText(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
}

function looksLikeEmail(value: unknown): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function emailFromUrl(rawUrl: unknown): string {
  try {
    const url = new URL(String(rawUrl || ""));
    const value =
      url.searchParams.get("email") ||
      url.searchParams.get("user_id") ||
      url.searchParams.get("userId") ||
      "";
    return looksLikeEmail(value) ? value.trim().toLowerCase() : "";
  } catch {
    return "";
  }
}

function sessionIdFromUrl(rawUrl: unknown): string {
  try {
    const url = new URL(String(rawUrl || ""));
    return String(url.searchParams.get("session_id") || url.searchParams.get("sessionId") || "").trim();
  } catch {
    return "";
  }
}

function statusFromError(error: unknown): number {
  const e = error as Record<string, unknown>;
  if (e?.status && typeof e.status === 'number') return e.status >= 400 && e.status < 600 ? e.status : 500;
  const message = String(e?.message || error || "").toLowerCase();
  if (message.includes("not found")) return 404;
  if (message.includes("unauthorized") || message.includes("auth")) return 401;
  if (message.includes("invalid") || message.includes("required") || message.includes("missing") || message.includes("below") || message.includes("exceeds")) return 400;
  if (message.includes("kyc") || message.includes("endorsement")) return 403;
  return 500;
}

function bridgeError(error: unknown, fallback: string) {
  const e = error as Record<string, unknown>;
  return {
    success: false,
    message: String(e?.message || e?.error || fallback),
    bridge_code: e?.code || null,
    bridge_source: e?.source || null,
    bridge_details: e?.response || null,
  };
}

type VirtualAccountBalanceSource = "virtual_account" | "bridge_wallet" | "activity";

type VirtualAccountBalanceSummary = {
  amount: string;
  currency: string;
  source: VirtualAccountBalanceSource;
  label: string;
  wallet_id?: string;
  event_count?: number;
};

function readAmount(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const amount = typeof value === "number" ? String(value) : String(value).trim();
  if (!amount) return null;
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? amount : null;
}

function readCurrency(value: unknown, fallback = "usd"): string {
  const currency = String(value || fallback || "usd").trim();
  return currency ? currency.toUpperCase() : "USD";
}

function addBalance(
  balances: VirtualAccountBalanceSummary[],
  amount: unknown,
  currency: unknown,
  source: VirtualAccountBalanceSource,
  label: string,
  extras: Partial<VirtualAccountBalanceSummary> = {},
): void {
  const normalizedAmount = readAmount(amount);
  if (!normalizedAmount) return;
  balances.push({
    amount: normalizedAmount,
    currency: readCurrency(currency),
    source,
    label,
    ...extras,
  });
}

function collectBalanceValue(
  balances: VirtualAccountBalanceSummary[],
  value: unknown,
  fallbackCurrency: string,
  source: VirtualAccountBalanceSource,
  label: string,
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectBalanceValue(balances, item, fallbackCurrency, source, label);
    }
    return;
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    addBalance(
      balances,
      record.amount ?? record.balance ?? record.available ?? record.total,
      record.currency ?? record.asset ?? record.asset_code ?? fallbackCurrency,
      source,
      label,
    );
    return;
  }

  addBalance(balances, value, fallbackCurrency, source, label);
}

function virtualAccountCurrency(account: Record<string, unknown> | null): string {
  if (!account) return "USD";
  const destination = account.destination as Record<string, unknown> | undefined;
  const source = account.source as Record<string, unknown> | undefined;
  const instructions = account.source_deposit_instructions as Record<string, unknown> | undefined;
  return readCurrency(
    account.source_currency ??
      account.currency ??
      source?.currency ??
      instructions?.currency ??
      destination?.currency,
  );
}

function isUsdVirtualAccount(account: Record<string, unknown>): boolean {
  const currency = virtualAccountCurrency(account).toLowerCase();
  return currency === "usd" || !currency;
}

function normalizeCachedVirtualAccount(row: Record<string, unknown>): Record<string, unknown> {
  const sourceCurrency = row.source_currency || (row.source_deposit_instructions as any)?.currency || "usd";
  return {
    id: row.id,
    status: row.status,
    source_currency: sourceCurrency,
    currency: sourceCurrency,
    destination: row.destination || {},
    source_deposit_instructions: row.source_deposit_instructions || null,
    developer_fee_percent: row.developer_fee_percent || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    synced_at: row.synced_at || null,
    account_source: "db_cache",
  };
}

async function loadCachedVirtualAccounts(customerId: string): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase
    .from("bridge_va_cache")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    logger.warn(`[bridge] cached VA lookup failed: ${error.message}`);
    return [];
  }

  return (Array.isArray(data) ? data : []).map((row: any) => normalizeCachedVirtualAccount(row));
}

function collectVirtualAccountBalances(account: Record<string, unknown> | null): VirtualAccountBalanceSummary[] {
  if (!account) return [];
  const balances: VirtualAccountBalanceSummary[] = [];
  const fallbackCurrency = virtualAccountCurrency(account);
  collectBalanceValue(balances, account.available_balance, fallbackCurrency, "virtual_account", "Available balance");
  collectBalanceValue(balances, account.current_balance, fallbackCurrency, "virtual_account", "Current balance");
  collectBalanceValue(balances, account.balance, fallbackCurrency, "virtual_account", "Virtual account balance");
  collectBalanceValue(balances, account.balances, fallbackCurrency, "virtual_account", "Virtual account balance");
  return balances;
}

function collectDestinationHints(account: Record<string, unknown> | null): string[] {
  if (!account) return [];
  const destination = (account.destination ?? {}) as Record<string, unknown>;
  const hints = [
    destination.bridge_wallet_id,
    destination.wallet_id,
    destination.id,
    destination.address,
    destination.to_address,
    account.destination_wallet_id,
    account.destination_address,
  ];
  return Array.from(
    new Set(
      hints
        .map((hint) => String(hint || "").trim())
        .filter(Boolean),
    ),
  );
}

function collectBridgeWalletBalances(
  account: Record<string, unknown> | null,
  bridgeBalances: Array<Record<string, unknown>>,
): VirtualAccountBalanceSummary[] {
  const hints = collectDestinationHints(account).map((hint) => hint.toLowerCase());
  if (!hints.length) return [];
  const balances: VirtualAccountBalanceSummary[] = [];
  for (const balance of bridgeBalances) {
    const walletId = String(balance.wallet_id || "").trim();
    if (!walletId || !hints.includes(walletId.toLowerCase())) continue;
    addBalance(
      balances,
      balance.amount,
      balance.currency,
      "bridge_wallet",
      "Destination wallet balance",
      { wallet_id: walletId },
    );
  }
  return balances;
}

function normalizeDestinationChain(account: Record<string, unknown>): string {
  const destination = (account.destination ?? {}) as Record<string, unknown>;
  return readText(
    account.destination_chain ||
      destination.payment_rail ||
      destination.chain ||
      destination.network,
  ).toLowerCase();
}

function normalizeDestinationAddress(account: Record<string, unknown>): string {
  const destination = (account.destination ?? {}) as Record<string, unknown>;
  return readText(
    account.destination_address ||
      destination.address ||
      destination.to_address ||
      destination.wallet_address,
  );
}

function normalizeBridgeWalletId(account: Record<string, unknown>): string {
  const destination = (account.destination ?? {}) as Record<string, unknown>;
  return readText(
    destination.bridge_wallet_id ||
      destination.wallet_id ||
      account.destination_wallet_id,
  );
}

function walletMatchesHints(wallet: Record<string, unknown>, hints: string[]): boolean {
  const normalizedHints = hints.map((hint) => hint.toLowerCase()).filter(Boolean);
  if (!normalizedHints.length) return false;
  const walletCandidates = [
    wallet.id,
    wallet.wallet_id,
    wallet.address,
  ].map((value) => readText(value).toLowerCase()).filter(Boolean);
  return walletCandidates.some((candidate) => normalizedHints.includes(candidate));
}

function balanceMatchesWallet(balance: Record<string, unknown>, wallet: Record<string, unknown> | null): boolean {
  if (!wallet) return false;
  const balanceWalletId = readText(balance.wallet_id).toLowerCase();
  if (!balanceWalletId) return false;
  const walletIds = [
    wallet.id,
    wallet.wallet_id,
    wallet.address,
  ].map((value) => readText(value).toLowerCase()).filter(Boolean);
  return walletIds.includes(balanceWalletId);
}

function activityCreditPriority(type: string): number {
  const normalized = type.toLowerCase();
  if (/(failed|reversed|returned|cancelled|canceled|fee|debit|withdraw)/.test(normalized)) {
    return 0;
  }
  if (normalized.includes("funds_received")) return 4;
  if (normalized.includes("payment_processed")) return 3;
  if (/(deposit|received|credit|wire|ach|sepa|pix)/.test(normalized)) return 2;
  return 0;
}

function collectActivityBalances(events: Array<Record<string, unknown>>): VirtualAccountBalanceSummary[] {
  const deposits = new Map<string, { event: Record<string, unknown>; priority: number }>();
  let anonymousIndex = 0;

  for (const event of events) {
    const priority = activityCreditPriority(String(event.type || ""));
    if (!priority) continue;
    const amount = Number(readAmount(event.amount));
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const depositKey = String(event.deposit_id || event.id || `event-${anonymousIndex++}`);
    const current = deposits.get(depositKey);
    if (!current || priority > current.priority) {
      deposits.set(depositKey, { event, priority });
    }
  }

  const totals = new Map<string, { amount: number; event_count: number }>();
  for (const { event } of deposits.values()) {
    const amount = Number(readAmount(event.amount));
    const currency = readCurrency(event.currency);
    const current = totals.get(currency) ?? { amount: 0, event_count: 0 };
    current.amount += amount;
    current.event_count += 1;
    totals.set(currency, current);
  }

  return Array.from(totals.entries()).map(([currency, total]) => ({
    amount: total.amount.toFixed(2),
    currency,
    source: "activity" as const,
    label: "Received via activity",
    event_count: total.event_count,
  }));
}

const MAINNET_PASSPHRASE = Networks.PUBLIC;
const FUNDING_XLM = '5'; // Enough for base reserve + trustline reserve + fees

/**
 * Resolve the funded mainnet sponsor/treasury key used to create new accounts.
 * Falls back across the keys that may carry XLM on a given deployment so a
 * missing primary var doesn't block wallet creation. Fund ONE of these
 * addresses with XLM and the platform sponsors every user wallet's reserves.
 */
function resolveSponsorSecret(): string {
  return (
    process.env.STELLAR_SPONSOR_SECRET ||
    process.env.STELLAR_WALLET_SPONSOR_SECRET ||
    process.env.STELLAR_MAINNET_SPONSOR_SECRET ||
    process.env.STELLAR_SECRET_KEY ||
    process.env.TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY ||
    ''
  ).trim();
}

const vaultSecretService = new VaultService(supabase);

/** Does this account already trust mainnet USDC? */
function hasUsdcTrustline(account: Awaited<ReturnType<typeof mainnetServer.loadAccount>>): boolean {
  return account.balances.some(
    (b: any) =>
      b.asset_type === 'credit_alphanum4' &&
      b.asset_code === 'USDC' &&
      b.asset_issuer === PUBLIC_USDC_ISSUER,
  );
}

/**
 * Add the mainnet USDC trustline to a custodial wallet so it can receive USDC.
 * The trustline must be signed by the wallet's own key, which lives in the
 * secret vault keyed by the wallets.vault_secret_id column.
 */
async function ensureUsdcTrustline(address: string): Promise<{ ok: boolean; reason?: string }> {
  let account: Awaited<ReturnType<typeof mainnetServer.loadAccount>>;
  try {
    account = await mainnetServer.loadAccount(address);
  } catch {
    return { ok: true }; // Can't read it — let Bridge surface any downstream error
  }
  if (hasUsdcTrustline(account)) return { ok: true };

  // Look up the custodial wallet's vaulted secret by public key — check both the
  // session wallets table and the email-keyed bridge destination wallets.
  let vaultSecretId: string | null = null;
  const { data: walletRow } = await supabase
    .from('wallets')
    .select('vault_secret_id')
    .eq('public_key', address)
    .maybeSingle();
  vaultSecretId = walletRow?.vault_secret_id ?? null;

  if (!vaultSecretId) {
    const { data: bridgeWalletRow } = await supabase
      .from('bridge_stellar_wallets')
      .select('vault_secret_id')
      .eq('public_key', address)
      .maybeSingle();
    vaultSecretId = bridgeWalletRow?.vault_secret_id ?? null;
  }

  if (!vaultSecretId) {
    return { ok: false, reason: `Stellar wallet ${address} needs a USDC trustline but its signing key is not available.` };
  }

  let secret = '';
  try {
    secret = await vaultSecretService.getSecret(String(vaultSecretId));
  } catch (e: any) {
    return { ok: false, reason: `Could not load signing key for ${address}: ${e?.message || e}` };
  }
  if (!secret) return { ok: false, reason: `Empty signing key for ${address}.` };

  try {
    const walletKeypair = Keypair.fromSecret(secret);
    // If a sponsor is configured, sponsor the trustline reserve so the user
    // wallet still doesn't need its own XLM. Otherwise the wallet pays from its
    // own (manually funded) XLM.
    const sponsorSecret = resolveSponsorSecret();
    let trustTx;
    if (sponsorSecret) {
      const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
      const sponsorAccount = await mainnetServer.loadAccount(sponsorKeypair.publicKey());
      trustTx = new TransactionBuilder(sponsorAccount, {
        fee: '1000',
        networkPassphrase: MAINNET_PASSPHRASE,
      })
        .addOperation(Operation.beginSponsoringFutureReserves({ sponsoredId: address, source: sponsorKeypair.publicKey() }))
        .addOperation(Operation.changeTrust({ asset: new Asset('USDC', PUBLIC_USDC_ISSUER), source: address }))
        .addOperation(Operation.endSponsoringFutureReserves({ source: address }))
        .setTimeout(120)
        .build();
      trustTx.sign(sponsorKeypair, walletKeypair);
    } else {
      trustTx = new TransactionBuilder(account, {
        fee: '100',
        networkPassphrase: MAINNET_PASSPHRASE,
      })
        .addOperation(Operation.changeTrust({ asset: new Asset('USDC', PUBLIC_USDC_ISSUER) }))
        .setTimeout(60)
        .build();
      trustTx.sign(walletKeypair);
    }
    await mainnetServer.submitTransaction(trustTx);
    logger.info(`[bridge] Added USDC trustline to mainnet wallet ${address}`);
    return { ok: true };
  } catch (e: any) {
    const msg = e?.response?.data?.extras?.result_codes
      ? JSON.stringify(e.response.data.extras.result_codes)
      : String(e?.message || e);
    return { ok: false, reason: `Failed to add USDC trustline to ${address}: ${msg}` };
  }
}

/**
 * Ensure a Stellar address exists on mainnet AND can receive USDC.
 * Creates (funds) the account if it doesn't exist, then adds the USDC
 * trustline — both are required before Bridge can deliver USDC to it.
 */
async function ensureMainnetAccount(address: string): Promise<{ ok: boolean; reason?: string }> {
  if (!address) return { ok: false, reason: "Stellar destination address is required." };

  // Check if account already exists
  let exists = false;
  try {
    await mainnetServer.loadAccount(address);
    exists = true;
  } catch (e: any) {
    const status = e?.response?.status ?? e?.status;
    if (status !== 404) {
      logger.warn(`[bridge] Mainnet Horizon check failed for ${address}: ${e?.message}`);
      return { ok: true }; // Non-404 error — let Bridge handle it
    }
  }

  if (!exists) {
    // Account doesn't exist — create + fund it
    const sponsorSecret = resolveSponsorSecret();
    if (!sponsorSecret) {
      return { ok: false, reason: `Stellar address ${address} does not exist on mainnet and no funded sponsor key (STELLAR_WALLET_SPONSOR_SECRET) is configured.` };
    }

    try {
      const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
      const sponsorAccount = await mainnetServer.loadAccount(sponsorKeypair.publicKey());

      const createTx = new TransactionBuilder(sponsorAccount, {
        fee: '100',
        networkPassphrase: MAINNET_PASSPHRASE,
      })
        .addOperation(Operation.createAccount({ destination: address, startingBalance: FUNDING_XLM }))
        .setTimeout(60)
        .build();

      createTx.sign(sponsorKeypair);
      const result = await mainnetServer.submitTransaction(createTx);

      if (!result.successful) {
        return { ok: false, reason: `Failed to create mainnet account ${address}: transaction failed.` };
      }

      // Wait for account to appear
      for (let i = 0; i < 10; i++) {
        try { await mainnetServer.loadAccount(address); break; } catch { await new Promise(r => setTimeout(r, 500)); }
      }

      logger.info(`[bridge] Auto-funded mainnet account ${address} with ${FUNDING_XLM} XLM`);
    } catch (e: any) {
      const msg = e?.response?.data?.extras?.result_codes
        ? JSON.stringify(e.response.data.extras.result_codes)
        : String(e?.message || e);
      return { ok: false, reason: `Failed to fund mainnet account ${address}: ${msg}` };
    }
  }

  // Account now exists — make sure it can actually hold USDC
  return ensureUsdcTrustline(address);
}

/** Verify a Stellar address exists on mainnet and can receive USDC (auto-create if needed). */
async function validateStellarDestination(address: string): Promise<{ ok: boolean; reason?: string }> {
  if (!address) return { ok: false, reason: "Stellar destination address is required." };
  return ensureMainnetAccount(address);
}

/**
 * Generate a brand-new custodial Stellar wallet using SPONSORED RESERVES.
 *
 * The keypair is always created and its secret stored encrypted in the vault.
 * If a platform sponsor/treasury key is configured, a single atomic transaction
 * sponsors the account's reserves so:
 *   - the user wallet holds 0 XLM (the ~1.5 XLM reserve is locked on the sponsor)
 *   - the USDC trustline is created in the same sponsored sandwich
 *   - the account is immediately ready to receive USDC from Bridge
 *
 * The locked XLM is reclaimable by the sponsor when the wallet is later merged.
 * If no sponsor key is configured, the keypair is still returned (unfunded) so
 * the address can be funded manually.
 */
async function createAndFundMainnetWallet(label: string): Promise<{
  ok: boolean;
  reason?: string;
  public_key: string;
  vault_secret_id: string;
  funded: boolean;
  trustline: boolean;
  sponsored: boolean;
}> {
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secret = keypair.secret();

  // Always store the signing key first — the keypair must never be lost.
  const vaultSecretId = await vaultSecretService.storeSecret(
    secret,
    `bridge_stellar_${publicKey}`,
    `Bridge destination wallet ${label}`.slice(0, 120),
  );

  const sponsorSecret = resolveSponsorSecret();
  if (!sponsorSecret) {
    logger.info(`[bridge] Generated mainnet keypair ${publicKey} (no sponsor — awaiting manual funding)`);
    return {
      ok: true,
      public_key: publicKey,
      vault_secret_id: vaultSecretId,
      funded: false,
      trustline: false,
      sponsored: false,
      reason: "Wallet created. Send XLM to this address to activate it, then it can receive USDC.",
    };
  }

  try {
    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const sponsorAccount = await mainnetServer.loadAccount(sponsorKeypair.publicKey());

    // One atomic sponsored-reserves sandwich:
    //   begin(sponsor) → createAccount(balance 0) → changeTrust(USDC) → end(new account)
    // Sponsor pays both reserves; the new account ends up holding 0 XLM but
    // USDC-ready. Signed by BOTH the sponsor and the new account.
    const tx = new TransactionBuilder(sponsorAccount, {
      fee: '1000',
      networkPassphrase: MAINNET_PASSPHRASE,
    })
      .addOperation(Operation.beginSponsoringFutureReserves({
        sponsoredId: publicKey,
        source: sponsorKeypair.publicKey(),
      }))
      .addOperation(Operation.createAccount({
        destination: publicKey,
        startingBalance: '0',
        source: sponsorKeypair.publicKey(),
      }))
      .addOperation(Operation.changeTrust({
        asset: new Asset('USDC', PUBLIC_USDC_ISSUER),
        source: publicKey,
      }))
      .addOperation(Operation.endSponsoringFutureReserves({
        source: publicKey,
      }))
      .setTimeout(120)
      .build();

    tx.sign(sponsorKeypair, keypair);
    await mainnetServer.submitTransaction(tx);

    logger.info(`[bridge] Sponsored mainnet wallet ${publicKey} (0 XLM held, USDC-ready)`);
    return {
      ok: true,
      public_key: publicKey,
      vault_secret_id: vaultSecretId,
      funded: true,
      trustline: true,
      sponsored: true,
    };
  } catch (e: any) {
    const msg = e?.response?.data?.extras?.result_codes
      ? JSON.stringify(e.response.data.extras.result_codes)
      : String(e?.message || e);
    // Keypair is saved — return it so the address can be funded manually.
    logger.warn(`[bridge] Sponsored creation failed for ${publicKey}, returning unfunded: ${msg}`);
    return {
      ok: true,
      public_key: publicKey,
      vault_secret_id: vaultSecretId,
      funded: false,
      trustline: false,
      sponsored: false,
      reason: `Wallet created. Sponsored funding unavailable (${msg}). Send XLM to this address to activate it.`,
    };
  }
}

/**
 * Ensure a custodial wallet holds enough mainnet XLM to pay Soroban fees.
 * Sponsored wallets hold 0 XLM, so top them up from the sponsor before a
 * contract call (e.g. a DeFindex deposit). One top-up covers many txs.
 */
async function ensureWalletGasMainnet(address: string, minXlm = 1): Promise<void> {
  const sponsorSecret = resolveSponsorSecret();
  if (!sponsorSecret) throw new Error("No sponsor key configured to fund transaction fees.");
  let xlm = 0;
  try {
    const account = await mainnetServer.loadAccount(address);
    xlm = Number(account.balances.find((b: any) => b.asset_type === "native")?.balance ?? "0");
  } catch {
    throw new Error(`Wallet ${address} does not exist on mainnet.`);
  }
  if (xlm >= minXlm) return;

  const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
  const sponsorAccount = await mainnetServer.loadAccount(sponsorKeypair.publicKey());
  const tx = new TransactionBuilder(sponsorAccount, { fee: "1000", networkPassphrase: MAINNET_PASSPHRASE })
    .addOperation(Operation.payment({ destination: address, asset: Asset.native(), amount: String(minXlm) }))
    .setTimeout(60)
    .build();
  tx.sign(sponsorKeypair);
  await mainnetServer.submitTransaction(tx);
  for (let i = 0; i < 10; i++) {
    try {
      const a = await mainnetServer.loadAccount(address);
      if (Number(a.balances.find((b: any) => b.asset_type === "native")?.balance ?? "0") >= minXlm) break;
    } catch { /* keep waiting */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  logger.info(`[bridge] Topped up ${address} with ${minXlm} XLM for Soroban fees`);
}

/**
 * Activate an already-generated wallet via sponsored reserves. Brings the
 * account on-ledger (createAccount, balance 0) and/or adds the USDC trustline,
 * whatever is missing — all paid by the platform sponsor so the wallet holds
 * 0 XLM. Signed by the sponsor + the wallet's own (vaulted) key.
 */
async function sponsorExistingWallet(publicKey: string, vaultSecretId: string): Promise<{
  ok: boolean;
  reason?: string;
  funded: boolean;
  trustline: boolean;
}> {
  const sponsorSecret = resolveSponsorSecret();
  if (!sponsorSecret) {
    return { ok: false, funded: false, trustline: false, reason: "No sponsor key is configured on the server." };
  }

  let secret = '';
  try {
    secret = await vaultSecretService.getSecret(vaultSecretId);
  } catch (e: any) {
    return { ok: false, funded: false, trustline: false, reason: `Could not load wallet key: ${e?.message || e}` };
  }
  if (!secret) return { ok: false, funded: false, trustline: false, reason: "Wallet signing key is unavailable." };

  const walletKeypair = Keypair.fromSecret(secret);

  // Inspect current on-chain state
  let exists = false;
  let hasTrust = false;
  try {
    const account = await mainnetServer.loadAccount(publicKey);
    exists = true;
    hasTrust = hasUsdcTrustline(account);
  } catch (e: any) {
    const status = e?.response?.status ?? e?.status;
    if (status !== 404) {
      return { ok: false, funded: false, trustline: false, reason: `Could not read account state: ${e?.message || e}` };
    }
  }

  if (exists && hasTrust) {
    return { ok: true, funded: true, trustline: true };
  }

  try {
    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const sponsorAccount = await mainnetServer.loadAccount(sponsorKeypair.publicKey());

    const builder = new TransactionBuilder(sponsorAccount, {
      fee: '1000',
      networkPassphrase: MAINNET_PASSPHRASE,
    }).addOperation(Operation.beginSponsoringFutureReserves({
      sponsoredId: publicKey,
      source: sponsorKeypair.publicKey(),
    }));

    if (!exists) {
      builder.addOperation(Operation.createAccount({
        destination: publicKey,
        startingBalance: '0',
        source: sponsorKeypair.publicKey(),
      }));
    }
    if (!hasTrust) {
      builder.addOperation(Operation.changeTrust({
        asset: new Asset('USDC', PUBLIC_USDC_ISSUER),
        source: publicKey,
      }));
    }
    builder.addOperation(Operation.endSponsoringFutureReserves({ source: publicKey }));

    const tx = builder.setTimeout(120).build();
    tx.sign(sponsorKeypair, walletKeypair);
    await mainnetServer.submitTransaction(tx);

    logger.info(`[bridge] Activated (sponsored) wallet ${publicKey}`);
    return { ok: true, funded: true, trustline: true };
  } catch (e: any) {
    const msg = e?.response?.data?.extras?.result_codes
      ? JSON.stringify(e.response.data.extras.result_codes)
      : String(e?.message || e);
    return { ok: false, funded: exists, trustline: hasTrust, reason: `Sponsored activation failed: ${msg}` };
  }
}

export class BridgeController {
  // ── Session-based helpers ──────────────────────────────────────

  static async getSessionUsdAccount(req: Request, res: Response): Promise<void> {
    try {
      let sessionId = String(req.query.session_id || req.headers['x-session-id'] || '').trim();
      let emailParam = String(req.query.email || '').trim().toLowerCase();
      const shortLinkCode = String(req.query.short_link_code || req.query.shortLinkCode || '').trim();

      let email: string | undefined;
      let lookupSource = sessionId ? "session" : emailParam ? "email" : "";

      if (!sessionId && !emailParam && shortLinkCode) {
        const { data: shortLink } = await supabase
          .from("short_links")
          .select("url, session_id, user_id")
          .eq("code", shortLinkCode)
          .maybeSingle();

        sessionId = String(shortLink?.session_id || sessionIdFromUrl(shortLink?.url) || "").trim();
        const linkEmail =
          emailFromUrl(shortLink?.url) ||
          (looksLikeEmail(shortLink?.user_id) ? String(shortLink?.user_id).trim().toLowerCase() : "");
        emailParam = linkEmail || emailParam;
        if (sessionId || emailParam) lookupSource = "short_link";
      }

      if (sessionId) {
        const { data: session } = await supabase
          .from('agent_sessions')
          .select('email, user_id')
          .eq('session_id', sessionId)
          .maybeSingle();
        email = session?.email || (looksLikeEmail(session?.user_id) ? String(session?.user_id).trim().toLowerCase() : undefined);
        if (!email) {
          res.status(404).json({ success: false, message: 'Session not found or has no email.' });
          return;
        }
      } else if (emailParam) {
        email = emailParam;
      } else {
        res.status(400).json({ success: false, message: 'session_id, email, or short_link_code required' });
        return;
      }

      let bridgeCustomerId: string | null = null;
      let bridgeKycStatus: string | null = null;
      let bridgeStatus: string | null = null;

      // Fast path: DB cache
      const { data: bridgeRow } = await supabase
        .from('bridge_customers')
        .select('bridge_customer_id, kyc_status, status')
        .eq('email', email)
        .maybeSingle();

      if (bridgeRow?.bridge_customer_id) {
        bridgeCustomerId = bridgeRow.bridge_customer_id;
        bridgeKycStatus = bridgeRow.kyc_status;
        bridgeStatus = bridgeRow.status;
      } else {
        // Slow path: search Bridge API directly (customer created before DB cache existed)
        try {
          const service = getBridgeService();
          let startingAfter: string | undefined;
          for (let page = 0; page < 20 && !bridgeCustomerId; page++) {
            const batch: any[] = await service.listCustomers({ starting_after: startingAfter, limit: 100 }).catch(() => []);
            if (!batch.length) break;
            const found = batch.find((c: any) => (c.email || '').toLowerCase() === email);
            if (found) {
              bridgeCustomerId = found.id;
              bridgeKycStatus = found.kyc_status ?? null;
              bridgeStatus = found.status ?? null;
              // Backfill DB cache so next lookup is instant
              await supabase.from('bridge_customers').upsert({
                bridge_customer_id: found.id,
                email,
                status: found.status ?? null,
                kyc_status: found.kyc_status ?? null,
                has_accepted_tos: found.has_accepted_tos ?? false,
                raw_bridge_data: found,
                last_synced_at: new Date().toISOString(),
              }, { onConflict: 'bridge_customer_id' });
            }
            startingAfter = batch[batch.length - 1]?.id;
            if (batch.length < 100) break;
          }
        } catch {
          // Bridge unreachable — fall through to no_account
        }
      }

      if (!bridgeCustomerId) {
        res.json({ success: true, has_account: false, kyc_status: null, virtual_accounts: [], email });
        return;
      }

      const service = getBridgeService();
      let virtualAccounts: any[] = [];
      let virtualAccountSource = "bridge_api";
      try {
        const accounts = await service.listVirtualAccounts(bridgeCustomerId);
        let usdAccounts: any[] = (Array.isArray(accounts) ? accounts : [])
          .filter((va: any) => isUsdVirtualAccount(va as Record<string, unknown>));
        if (!usdAccounts.length) {
          const cached = await loadCachedVirtualAccounts(bridgeCustomerId);
          usdAccounts = cached.filter((va: any) => isUsdVirtualAccount(va as Record<string, unknown>));
          if (usdAccounts.length) virtualAccountSource = "db_cache";
        }
        // Enrich each VA with total funds received from activity history
        virtualAccounts = await Promise.all(
          usdAccounts.map(async (va: any) => {
            let events: any[] = [];
            try {
              events = await service.getVirtualAccountActivity(
                bridgeCustomerId!,
                va.id,
                { limit: 100 },
              );
            } catch {
              events = [];
            }

            const directBalances = collectVirtualAccountBalances(va as Record<string, unknown>)
              .filter((b) => b.currency.toLowerCase() === "usd");
            const activityBalances = collectActivityBalances(Array.isArray(events) ? events : [])
              .filter((b) => b.currency.toLowerCase() === "usd");
            const positiveDirect = directBalances.filter((b) => Number(b.amount) > 0);
            const visibleBalances = positiveDirect.length ? positiveDirect : activityBalances;
            const received = visibleBalances.reduce((sum: number, b) => sum + Number(b.amount || 0), 0);
            const bridgeWalletId = normalizeBridgeWalletId(va as Record<string, unknown>);
            const destinationChain = normalizeDestinationChain(va as Record<string, unknown>);
            const destinationAddress = normalizeDestinationAddress(va as Record<string, unknown>);
            return {
              ...va,
              currency: virtualAccountCurrency(va as Record<string, unknown>),
              total_received_usd: Number.isFinite(received) ? received : 0,
              balance_summaries: visibleBalances,
              activity_count: Array.isArray(events) ? events.length : 0,
              bridge_wallet_id: bridgeWalletId || null,
              destination_chain: destinationChain || null,
              destination_address: destinationAddress || null,
            };
          }),
        );
      } catch {
        const cached = await loadCachedVirtualAccounts(bridgeCustomerId);
        virtualAccountSource = cached.length ? "db_cache" : "bridge_api";
        virtualAccounts = cached.filter((va: any) => isUsdVirtualAccount(va as Record<string, unknown>));
      }

      // Look up the Stellar wallet linked to this email via agent_sessions → wallets
      let stellarWallet: { public_key: string; usdc_balance: string | null } | null = null;
      try {
        const { data: sessionRow } = await supabase
          .from('agent_sessions')
          .select('session_id')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sessionRow?.session_id) {
          const { data: walletRow } = await supabase
            .from('wallets')
            .select('public_key')
            .eq('session_id', sessionRow.session_id)
            .maybeSingle();
          if (walletRow?.public_key) {
            // Fetch live USDC balance from mainnet Horizon (Bridge wallets live on mainnet)
            let usdcBalance: string | null = null;
            try {
              const account = await mainnetServer.loadAccount(walletRow.public_key);
              const usdcEntry = account.balances.find(
                (b: any) => b.asset_type === 'credit_alphanum4' && b.asset_code === 'USDC' && b.asset_issuer === PUBLIC_USDC_ISSUER,
              );
              usdcBalance = usdcEntry?.balance ?? '0';
            } catch {
              // Horizon unavailable — still return the address
            }
            stellarWallet = { public_key: walletRow.public_key, usdc_balance: usdcBalance };
          }
        }
      } catch {
        // non-fatal
      }

      // Fetch Bridge custodial wallets so frontend can trigger manual sweeps
      let bridgeWallets: any[] = [];
      try {
        // Try Bridge API first
        let liveWallets: any[] = [];
        try {
          const wallets = await service.listWallets(bridgeCustomerId);
          liveWallets = Array.isArray(wallets) ? wallets : [];
        } catch (walletErr: any) {
          logger.warn(`[bridge] listWallets failed for getSessionUsdAccount: ${walletErr.message}`);
        }
        // Fallback to DB cache if Bridge API returned nothing
        if (!liveWallets.length) {
          const { data: dbWallets } = await supabase
            .from('bridge_custodial_wallets')
            .select('*')
            .eq('customer_id', bridgeCustomerId)
            .order('created_at', { ascending: false });
          if (Array.isArray(dbWallets) && dbWallets.length) {
            liveWallets = dbWallets.map((row: any) => ({
              id: row.id,
              chain: row.chain,
              address: row.address,
            }));
          }
        }
        let walletBalances: any[] = [];
        try {
          walletBalances = await service.getWalletBalances();
        } catch {
          // balances unavailable — still return wallet list
        }
        const balanceArr = Array.isArray(walletBalances) ? walletBalances : [];
        bridgeWallets = liveWallets.map((w: any) => {
          const walletBal = balanceArr.filter(
            (b: any) => String(b.wallet_id || '').toLowerCase() === String(w.id || '').toLowerCase()
          );
          return {
            id: w.id,
            chain: w.chain ?? null,
            address: w.address ?? null,
            balances: walletBal.map((b: any) => ({
              currency: (b.currency || 'USDC').toUpperCase(),
              amount: String(b.amount ?? '0'),
            })),
          };
        });
      } catch {
        // non-fatal — page works without wallet list
      }

      // Fetch mainnet Stellar wallets linked to this email's session (for Bridge routing)
      let mainnetWallets: any[] = [];
      try {
        // Find the session for this email
        const { data: sessionForMainnet } = await supabase
          .from('agent_sessions')
          .select('session_id, user_id')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sessionForMainnet?.session_id) {
          const { data: wallets } = await supabase
            .from('stellar_mainnet_wallets')
            .select('*')
            .eq('session_id', sessionForMainnet.session_id)
            .order('created_at', { ascending: false });
          mainnetWallets = (Array.isArray(wallets) ? wallets : []).map((w: any) => ({
            id: w.id,
            public_key: w.public_key,
            label: w.label ?? 'Mainnet wallet',
            is_primary: w.is_primary ?? false,
            last_balance: w.last_balance ?? [],
          }));
        }
      } catch {
        // non-fatal
      }

      res.json({
        success: true,
        has_account: true,
        kyc_status: bridgeKycStatus,
        customer_status: bridgeStatus,
        customer_id: bridgeCustomerId,
        email,
        lookup_source: lookupSource || null,
        virtual_account_source: virtualAccountSource,
        virtual_accounts: virtualAccounts,
        stellar_wallet: stellarWallet,
        bridge_wallets: bridgeWallets,
        mainnet_wallets: mainnetWallets,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || 'Failed to load account.' });
    }
  }

  // ── Customers ─────────────────────────────────────────────────

  static async createCustomer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const email = readText(req.body?.email).toLowerCase();
      const customer = await service.createCustomer({
        first_name: readText(req.body?.first_name || req.body?.firstName),
        last_name: readText(req.body?.last_name || req.body?.lastName),
        email,
        type: "individual",
      });
      // Persist to local DB so by-email lookup is instant and doesn't depend on Bridge pagination
      if (customer?.id && email) {
        await supabase.from('bridge_customers').upsert({
          bridge_customer_id: customer.id,
          email,
          status: customer.status ?? null,
          kyc_status: customer.kyc_status ?? null,
          has_accepted_tos: customer.has_accepted_tos ?? false,
          raw_bridge_data: customer,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'bridge_customer_id' }).throwOnError();
      }
      res.status(201).json({ success: true, customer });
    } catch (error: any) {
      logger.error(`[bridge] createCustomer failed: ${error.message}`);
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to create Bridge customer."),
        bridge_code: error?.code || null,
        bridge_source: error?.source || null,
      });
    }
  }

  static async getCustomer(req: Request, res: Response): Promise<void> {
    try {
      const customer = await getBridgeService().getCustomer(
        String(req.params.id),
      );
      res.json({ success: true, customer });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Customer not found."),
      });
    }
  }

  static async findCustomerByEmail(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const service = getBridgeService();
      const email = String(req.query.email || req.body?.email || "").trim().toLowerCase();
      if (!email) {
        res.status(400).json({ success: false, message: "Email is required." });
        return;
      }
      let found: any = null;

      // 1. Fast path: local Supabase cache (populated on createCustomer)
      const { data: dbRow } = await supabase
        .from('bridge_customers')
        .select('bridge_customer_id, email, status, kyc_status, raw_bridge_data')
        .eq('email', email)
        .maybeSingle();

      if (dbRow?.bridge_customer_id) {
        // Re-fetch from Bridge to get fresh data
        try {
          found = await service.getCustomer(dbRow.bridge_customer_id);
        } catch {
          // Bridge fetch failed — return cached data so UI still loads
          found = dbRow.raw_bridge_data ?? { id: dbRow.bridge_customer_id, email: dbRow.email };
        }
      }

      // 2. Slow path: paginate through Bridge API (covers accounts created before DB cache existed)
      if (!found) {
        let startingAfter: string | undefined;
        for (let page = 0; page < 20 && !found; page++) {
          let batch: any[] = [];
          try {
            batch = await service.listCustomers({ starting_after: startingAfter, limit: 100 });
          } catch { break; }
          if (!batch.length) break;
          found = batch.find((c: any) => (c.email || "").toLowerCase() === email);
          if (found) {
            // Backfill into DB so next lookup is fast
            await supabase.from('bridge_customers').upsert({
              bridge_customer_id: found.id,
              email: (found.email || "").toLowerCase(),
              status: found.status ?? null,
              kyc_status: found.kyc_status ?? null,
              has_accepted_tos: found.has_accepted_tos ?? false,
              raw_bridge_data: found,
              last_synced_at: new Date().toISOString(),
            }, { onConflict: 'bridge_customer_id' });
          }
          startingAfter = batch[batch.length - 1]?.id;
          if (batch.length < 100) break;
        }
      }

      if (!found) {
        res.status(404).json({ success: false, message: "No customer found with that email." });
        return;
      }
      res.json({ success: true, customer: found });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to search customers."),
      });
    }
  }

  static async syncCustomer(req: Request, res: Response): Promise<void> {
    try {
      const customer = await getBridgeService().getCustomer(
        String(req.params.id),
      );
      res.json({ success: true, customer });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to sync customer."),
      });
    }
  }

  static async getKycLink(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);

      let kycLink: any;
      try {
        kycLink = await service.createKycLink(customerId);
      } catch (firstError: any) {
        if (String(firstError?.message || '').includes('Unauthorized')) {
          const customer = await service.getCustomer(customerId);
          kycLink = await service.createStandaloneKycLink(
            customer.email || '',
            customer.type || 'individual',
          );
        } else {
          throw firstError;
        }
      }

      res.json({ success: true, kyc_link: kycLink });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to create KYC link."),
      });
    }
  }

  static async getPixKycLink(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      const customer = await service.getCustomer(customerId);
      const link = await service.createStandaloneKycLink(
        customer.email || '',
        customer.type || 'individual',
        'pix',
      );
      res.json({ success: true, kyc_link: link });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || 'Failed to create PIX KYC link.' });
    }
  }

  static async getCustomerReadiness(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const customer = await getBridgeService().getCustomer(customerId);

      const endorsements: string[] = [];
      if (customer.endorsements?.length) {
        endorsements.push(
          ...customer.endorsements.map(
            (e) => `${e.name || "unknown"}:${e.status || "unknown"}`,
          ),
        );
      }

      const kycStatus = customer.kyc_status || customer.status || "not_started";
      const hasPixEndorsement = endorsements.some(
        (e) => e.startsWith("pix:") && (e.endsWith(":approved") || e.endsWith(":complete")),
      );

      let readiness = "ready";
      if (kycStatus === "not_started" || kycStatus === "update_required") {
        readiness = "needs_kyc";
      } else if (kycStatus === "pending") {
        readiness = "under_review";
      } else if (kycStatus === "rejected") {
        readiness = "rejected";
      } else if (!hasPixEndorsement) {
        readiness = "needs_pix_endorsement";
      }

      res.json({
        success: true,
        readiness: {
          status: readiness,
          kyc_status: kycStatus,
          endorsements,
          pix_ready: hasPixEndorsement,
        },
      });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to check customer readiness.",
      });
    }
  }

  // ── External Accounts ─────────────────────────────────────────

  static async createPixKeyExternalAccount(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const service = getBridgeService();
      const pixKey = readText(req.body?.pix_key || req.body?.pixKey);
      const ownerName = readText(
        req.body?.account_owner_name ||
          req.body?.accountOwnerName ||
          req.body?.name ||
          "",
      );

      const account = await service.addPixKey(customerId, pixKey, ownerName);

      logger.info(
        `[bridge] pix external account created for customer ${customerId}`,
      );
      res.status(201).json({ success: true, external_account: account });
    } catch (error: any) {
      logger.error(
        `[bridge] createPixKeyExternalAccount failed: ${error.message}`,
      );
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to create Pix external account.",
      });
    }
  }

  static async listExternalAccounts(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const accounts = await getBridgeService().listExternalAccounts(
        customerId,
      );
      res.json({ success: true, external_accounts: accounts });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to list external accounts.",
      });
    }
  }

  static async getExternalAccount(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const account = await getBridgeService().getExternalAccount(
        String(req.params.externalAccountId),
      );
      res.json({ success: true, external_account: account });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "External account not found.",
      });
    }
  }

  static async deleteExternalAccount(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      await getBridgeService().deleteExternalAccount(
        String(req.params.externalAccountId),
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to delete external account.",
      });
    }
  }

  // ── Liquidation Addresses ─────────────────────────────────────

  static async createPixLiquidationAddress(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const service = getBridgeService();
      const externalAccountId = readText(
        req.body?.external_account_id || req.body?.externalAccountId || "",
      );
      const feePercent = readText(
        req.body?.developer_fee_percent ||
          req.body?.developerFeePercent ||
          service.config.developerFeePercent,
      );

      const address = await service.createLiquidationAddress(customerId, {
        currency: "usdc",
        chain: "base",
        destination_payment_rail: "pix",
        destination_currency: "brl",
        external_account_id: externalAccountId || undefined,
        custom_developer_fee_percent: feePercent || undefined,
      });

      logger.info(
        `[bridge] liquidation address created for customer ${customerId}`,
      );
      res
        .status(201)
        .json({ success: true, liquidation_address: address });
    } catch (error: any) {
      logger.error(
        `[bridge] createPixLiquidationAddress failed: ${error.message}`,
      );
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to create liquidation address.",
      });
    }
  }

  static async listLiquidationAddresses(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const addresses = await getBridgeService().listLiquidationAddresses(
        String(req.params.id),
      );
      res.json({ success: true, liquidation_addresses: addresses });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to list liquidation addresses.",
      });
    }
  }

  static async getLiquidationAddress(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const address = await getBridgeService().getLiquidationAddress(
        String(req.params.id),
        String(req.params.liquidationAddressId),
      );
      res.json({ success: true, liquidation_address: address });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Liquidation address not found.",
      });
    }
  }

  // ── Transfers ─────────────────────────────────────────────────

  static async createCryptoToPixTransfer(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = readText(
        req.body?.on_behalf_of ||
          req.body?.onBehalfOf ||
          req.body?.customer_id ||
          req.body?.customerId ||
          "",
      );
      const amount = readText(req.body?.amount || req.body?.amount_brl || "0");
      const externalAccountId = readText(
        req.body?.external_account_id ||
          req.body?.externalAccountId ||
          "",
      );
      const stellarAddress = readText(
        req.body?.from_address || req.body?.fromAddress || "",
      );
      const sourceChain = readText(
        req.body?.source_chain || req.body?.sourceChain,
        service.config.defaultSourceChain,
      );

      assertBridgeAmountInRange(
        amount,
        service.config.minBrlAmount,
        service.config.maxBrlAmount,
        "BRL",
      );

      const transfer = await service.createTransfer({
        on_behalf_of: customerId,
        developer_fee_percent:
          readText(
            req.body?.developer_fee_percent ||
              req.body?.developerFeePercent ||
              "",
          ) || undefined,
        source: {
          payment_rail: sourceChain as any,
          currency: "usdc",
          from_address: stellarAddress || undefined,
        },
        destination: {
          amount,
          payment_rail: "pix",
          currency: "brl",
          external_account_id: externalAccountId || undefined,
        },
      });

      logger.info(`[bridge] crypto-to-pix transfer created: ${transfer.id}`);
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      logger.error(
        `[bridge] createCryptoToPixTransfer failed: ${error.message}`,
      );
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to create transfer."),
      });
    }
  }

  static async getTransfer(req: Request, res: Response): Promise<void> {
    try {
      const transfer = await getBridgeService().getTransfer(
        String(req.params.transferId),
      );
      res.json({ success: true, transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Transfer not found."),
      });
    }
  }

  static async syncTransfer(req: Request, res: Response): Promise<void> {
    try {
      const transfer = await getBridgeService().getTransfer(
        String(req.params.transferId),
      );
      res.json({ success: true, transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: (error?.message || "Failed to sync transfer."),
      });
    }
  }

  // ── Exchange Rates ────────────────────────────────────────────

  static async getExchangeRate(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const from = readText(req.query.from, "usd");
      const to = readText(req.query.to, "brl");
      const rate = await getBridgeService().getExchangeRate(from, to);
      res.json({ success: true, exchange_rate: rate });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to get exchange rate.",
      });
    }
  }

  static async estimatePayout(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const amount = readText(req.body?.amount || "0");
      const from = readText(
        req.body?.source_currency || req.body?.from,
        service.config.defaultSourceCurrency,
      );
      const to = readText(
        req.body?.destination_currency || req.body?.to,
        service.config.defaultDestinationCurrency,
      );

      const rate = await service.getExchangeRate(from, to);
      const rateValue = parseFloat(
        (rate as Record<string, unknown>)?.rate?.toString() || "0",
      );
      const estimated = (parseFloat(amount) * rateValue).toFixed(2);

      res.json({
        success: true,
        estimate: {
          source_amount: amount,
          source_currency: from,
          destination_amount: estimated,
          destination_currency: to,
          rate,
          is_estimate: true,
        },
      });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to estimate payout.",
      });
    }
  }

  // ── Virtual Accounts ──────────────────────────────────────────

  private static async upsertVirtualAccount(va: any, customerId: string): Promise<void> {
    try {
      const dest = va.destination ?? {};
      await supabase.from('bridge_va_cache').upsert({
        id: va.id,
        customer_id: customerId,
        status: va.status,
        source_currency: va.source_currency,
        destination_chain: dest.payment_rail ?? dest.chain ?? null,
        destination_address: dest.to_address ?? null,
        source_deposit_instructions: va.source_deposit_instructions ?? null,
        destination: dest ?? null,
        developer_fee_percent: va.developer_fee_percent ?? null,
        created_at: va.created_at ?? null,
        updated_at: va.updated_at ?? null,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    } catch (dbErr: any) {
      logger.warn(`[bridge] VA upsert failed: ${dbErr.message}`);
    }
  }

  static async listVirtualAccounts(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const accounts = await getBridgeService().listVirtualAccounts(customerId);
      const safeAccounts = Array.isArray(accounts) ? accounts : [];
      // Sync to DB (non-blocking, errors caught inside upsertVirtualAccount)
      void Promise.all(safeAccounts.map((va) => BridgeController.upsertVirtualAccount(va, customerId)));
      res.json({ success: true, virtual_accounts: safeAccounts });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Failed to list virtual accounts.",
      });
    }
  }

  static async listVirtualAccountsFromDb(req: Request, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const { data, error } = await supabase
        .from('bridge_va_cache')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, virtual_accounts: data || [] });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Failed to load virtual accounts from DB." });
    }
  }

  static async getVirtualAccount(
    req: Request,
    res: Response,
  ): Promise<void> {
    try {
      const account = await getBridgeService().getVirtualAccount(
        String(req.params.virtualAccountId),
      );
      res.json({ success: true, virtual_account: account });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.message || "Virtual account not found.",
      });
    }
  }

  static async deactivateVirtualAccount(req: Request, res: Response): Promise<void> {
    try {
      await getBridgeService().deactivateVirtualAccount(String(req.params.virtualAccountId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to deactivate virtual account." });
    }
  }

  static async reactivateVirtualAccount(req: Request, res: Response): Promise<void> {
    try {
      await getBridgeService().reactivateVirtualAccount(String(req.params.virtualAccountId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to reactivate virtual account." });
    }
  }

  static async getVirtualAccountActivity(req: Request, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const virtualAccountId = String(req.params.virtualAccountId);
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const startingAfter = req.query.starting_after as string | undefined;
      const events = await getBridgeService().getVirtualAccountActivity(customerId, virtualAccountId, { limit, starting_after: startingAfter });
      res.json({ success: true, events });
    } catch (error: any) {
      logger.error(`[bridge] getVirtualAccountActivity failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || 'Failed to get activity.' });
    }
  }

  static async getVirtualAccountBalance(req: Request, res: Response): Promise<void> {
    const customerId = String(req.params.id);
    const virtualAccountId = String(req.params.virtualAccountId);
    const service = getBridgeService();
    const warnings: string[] = [];
    let account: Record<string, unknown> | null = null;
    let events: Array<Record<string, unknown>> = [];
    let bridgeBalances: Array<Record<string, unknown>> = [];

    try {
      account = await service.getVirtualAccount(customerId, virtualAccountId) as unknown as Record<string, unknown>;
      if (account?.id) {
        void BridgeController.upsertVirtualAccount(account, customerId);
      }
    } catch (error: any) {
      warnings.push(`virtual_account: ${error?.message || "unavailable"}`);
    }

    try {
      events = await service.getVirtualAccountActivity(customerId, virtualAccountId, { limit: 100 }) as unknown as Array<Record<string, unknown>>;
    } catch (error: any) {
      warnings.push(`activity: ${error?.message || "unavailable"}`);
    }

    try {
      bridgeBalances = await service.getWalletBalances() as unknown as Array<Record<string, unknown>>;
    } catch (error: any) {
      warnings.push(`wallet_balances: ${error?.message || "unavailable"}`);
    }

    if (!account && !events.length && !bridgeBalances.length) {
      res.status(502).json({
        success: false,
        message: "Bridge virtual account balance could not be loaded.",
        warnings,
      });
      return;
    }

    const directBalances = collectVirtualAccountBalances(account);
    const walletBalances = collectBridgeWalletBalances(account, bridgeBalances);
    const activityBalances = collectActivityBalances(events);
    const liveBalances = [...directBalances, ...walletBalances];
    const nonZeroLiveBalances = liveBalances.filter((balance) => Number(balance.amount) > 0);
    const balances = nonZeroLiveBalances.length
      ? nonZeroLiveBalances
      : activityBalances.length
        ? activityBalances
        : liveBalances;

    res.json({
      success: true,
      virtual_account: account,
      balances,
      activity_totals: activityBalances,
      event_count: events.length,
      destination_hints: collectDestinationHints(account),
      warnings,
      refreshed_at: new Date().toISOString(),
    });
  }

  static async getVirtualAccountConnections(req: Request, res: Response): Promise<void> {
    const customerId = String(req.params.id);
    const stellarAddress = readText(req.query.stellar_address || req.query.stellarAddress);
    const service = getBridgeService();
    const warnings: string[] = [];
    let accounts: Array<Record<string, unknown>> = [];
    let wallets: Array<Record<string, unknown>> = [];
    let bridgeBalances: Array<Record<string, unknown>> = [];

    try {
      const liveAccounts = await service.listVirtualAccounts(customerId) as unknown as Array<Record<string, unknown>>;
      accounts = Array.isArray(liveAccounts) ? liveAccounts : [];
      void Promise.all(accounts.map((account) => BridgeController.upsertVirtualAccount(account, customerId)));
    } catch (error: any) {
      warnings.push(`virtual_accounts: ${error?.message || "unavailable"}`);
      accounts = await loadCachedVirtualAccounts(customerId);
    }

    try {
      const liveWallets = await service.listWallets(customerId) as unknown as Array<Record<string, unknown>>;
      wallets = Array.isArray(liveWallets) ? liveWallets : [];
    } catch (error: any) {
      warnings.push(`wallets: ${error?.message || "unavailable"}`);
      const { data } = await supabase
        .from("bridge_custodial_wallets")
        .select("*")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      wallets = Array.isArray(data) ? data : [];
    }

    try {
      const balances = await service.getWalletBalances() as unknown as Array<Record<string, unknown>>;
      bridgeBalances = Array.isArray(balances) ? balances : [];
    } catch (error: any) {
      warnings.push(`wallet_balances: ${error?.message || "unavailable"}`);
    }

    const connections = accounts.map((account) => {
      const hints = collectDestinationHints(account);
      const bridgeWalletId = normalizeBridgeWalletId(account);
      const destinationChain = normalizeDestinationChain(account);
      const destinationAddress = normalizeDestinationAddress(account);
      const matchedWallet =
        wallets.find((wallet) => walletMatchesHints(wallet, hints)) ||
        (bridgeWalletId
          ? wallets.find((wallet) => readText(wallet.id || wallet.wallet_id).toLowerCase() === bridgeWalletId.toLowerCase())
          : null) ||
        null;
      const walletBalances = bridgeBalances.filter((balance) => balanceMatchesWallet(balance, matchedWallet));
      const isDirectStellar = destinationChain === "stellar";

      return {
        virtual_account: account,
        destination: {
          chain: destinationChain || null,
          address: destinationAddress || null,
          bridge_wallet_id: bridgeWalletId || null,
          hints,
        },
        bridge_wallet: matchedWallet,
        bridge_wallet_balances: walletBalances,
        stellar_wallet: stellarAddress
          ? {
              address: stellarAddress,
              direct_destination: isDirectStellar && destinationAddress.toLowerCase() === stellarAddress.toLowerCase(),
              connectable_from_bridge_wallet: Boolean(matchedWallet && walletBalances.length),
            }
          : null,
      };
    });

    res.json({
      success: true,
      customer_id: customerId,
      stellar_address: stellarAddress || null,
      virtual_accounts: accounts,
      bridge_wallets: wallets,
      bridge_wallet_balances: bridgeBalances,
      connections,
      warnings,
      refreshed_at: new Date().toISOString(),
    });
  }

  // ── Additional Virtual Account On-Ramps ───────────────────────

  static async createUsdVirtualAccount(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      const destinationWallet = readText(req.body?.destination_wallet || req.body?.destinationWallet);
      const destinationChain = readText(req.body?.destination_chain || req.body?.destinationChain, service.config.defaultSourceChain);
      const blockchainMemo = readText(req.body?.blockchain_memo || req.body?.blockchainMemo) || undefined;
      if (destinationChain === 'stellar') {
        const check = await validateStellarDestination(destinationWallet);
        if (!check.ok) { res.status(400).json({ success: false, message: check.reason }); return; }
      }
      logger.info(`[bridge] Creating USD VA for customer ${customerId} → ${destinationChain}:${destinationWallet}`);
      const account = await service.createUsdVirtualAccount(customerId, destinationWallet, destinationChain, blockchainMemo);
      logger.info(`[bridge] USD virtual account created for customer ${customerId}`);
      await BridgeController.upsertVirtualAccount(account, customerId);
      res.status(201).json({ success: true, virtual_account: account });
    } catch (error: any) {
      logger.error(`[bridge] createUsdVirtualAccount failed: ${error.message} | bridge_response: ${JSON.stringify(error?.response)}`);
      res.status(statusFromError(error)).json(bridgeError(error, "Failed to create USD virtual account."));
    }
  }

  static async createEurVirtualAccount(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      const destinationWallet = readText(req.body?.destination_wallet || req.body?.destinationWallet);
      const destinationChain = readText(req.body?.destination_chain || req.body?.destinationChain, service.config.defaultSourceChain);
      const blockchainMemo = readText(req.body?.blockchain_memo || req.body?.blockchainMemo) || undefined;
      if (destinationChain === 'stellar') {
        const check = await validateStellarDestination(destinationWallet);
        if (!check.ok) { res.status(400).json({ success: false, message: check.reason }); return; }
      }
      logger.info(`[bridge] Creating EUR VA for customer ${customerId} → ${destinationChain}:${destinationWallet}`);
      const account = await service.createEurVirtualAccount(customerId, destinationWallet, destinationChain, blockchainMemo);
      logger.info(`[bridge] EUR virtual account created for customer ${customerId}`);
      await BridgeController.upsertVirtualAccount(account, customerId);
      res.status(201).json({ success: true, virtual_account: account });
    } catch (error: any) {
      logger.error(`[bridge] createEurVirtualAccount failed: ${error.message} | bridge_response: ${JSON.stringify(error?.response)}`);
      res.status(statusFromError(error)).json(bridgeError(error, "Failed to create EUR virtual account."));
    }
  }

  static async createMxnVirtualAccount(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      const destinationWallet = readText(req.body?.destination_wallet || req.body?.destinationWallet);
      const destinationChain = readText(req.body?.destination_chain || req.body?.destinationChain, service.config.defaultSourceChain);
      const blockchainMemo = readText(req.body?.blockchain_memo || req.body?.blockchainMemo) || undefined;
      if (destinationChain === 'stellar') {
        const check = await validateStellarDestination(destinationWallet);
        if (!check.ok) { res.status(400).json({ success: false, message: check.reason }); return; }
      }
      logger.info(`[bridge] Creating MXN VA for customer ${customerId} → ${destinationChain}:${destinationWallet}`);
      const account = await service.createMxnVirtualAccount(customerId, destinationWallet, destinationChain, blockchainMemo);
      logger.info(`[bridge] MXN virtual account created for customer ${customerId}`);
      await BridgeController.upsertVirtualAccount(account, customerId);
      res.status(201).json({ success: true, virtual_account: account });
    } catch (error: any) {
      logger.error(`[bridge] createMxnVirtualAccount failed: ${error.message} | bridge_response: ${JSON.stringify(error?.response)}`);
      res.status(statusFromError(error)).json(bridgeError(error, "Failed to create MXN virtual account."));
    }
  }

  static async createBrlVirtualAccount(req: Request, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const service = getBridgeService();
      const destinationWallet = readText(req.body?.destination_wallet || req.body?.destinationWallet);
      const destinationChain = readText(req.body?.destination_chain || req.body?.destinationChain, service.config.defaultSourceChain);
      const blockchainMemo = readText(req.body?.blockchain_memo || req.body?.blockchainMemo) || undefined;
      if (destinationChain === 'stellar') {
        const check = await validateStellarDestination(destinationWallet);
        if (!check.ok) { res.status(400).json({ success: false, message: check.reason }); return; }
      }
      logger.info(`[bridge] Creating BRL VA for customer ${customerId} → ${destinationChain}:${destinationWallet}`);
      const virtualAccount = await service.createBrlVirtualAccount(customerId, destinationWallet, destinationChain, blockchainMemo);
      logger.info(`[bridge] BRL virtual account created for customer ${customerId}`);
      await BridgeController.upsertVirtualAccount(virtualAccount, customerId);
      res.status(201).json({ success: true, virtual_account: virtualAccount });
    } catch (error: any) {
      logger.error(`[bridge] createBrlVirtualAccount failed: ${error.message} | bridge_response: ${JSON.stringify(error?.response)}`);
      res.status(statusFromError(error)).json(bridgeError(error, "Failed to create virtual account."));
    }
  }

  static async createGbpVirtualAccount(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      const destinationWallet = readText(req.body?.destination_wallet || req.body?.destinationWallet);
      const destinationChain = readText(req.body?.destination_chain || req.body?.destinationChain, service.config.defaultSourceChain);
      const blockchainMemo = readText(req.body?.blockchain_memo || req.body?.blockchainMemo) || undefined;
      if (destinationChain === 'stellar') {
        const check = await validateStellarDestination(destinationWallet);
        if (!check.ok) { res.status(400).json({ success: false, message: check.reason }); return; }
      }
      logger.info(`[bridge] Creating GBP VA for customer ${customerId} → ${destinationChain}:${destinationWallet}`);
      const account = await service.createGbpVirtualAccount(customerId, destinationWallet, destinationChain, blockchainMemo);
      logger.info(`[bridge] GBP virtual account created for customer ${customerId}`);
      await BridgeController.upsertVirtualAccount(account, customerId);
      res.status(201).json({ success: true, virtual_account: account });
    } catch (error: any) {
      logger.error(`[bridge] createGbpVirtualAccount failed: ${error.message} | bridge_response: ${JSON.stringify(error?.response)}`);
      res.status(statusFromError(error)).json(bridgeError(error, "Failed to create GBP virtual account."));
    }
  }

  static async createCopVirtualAccount(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      const destinationWallet = readText(req.body?.destination_wallet || req.body?.destinationWallet);
      const destinationChain = readText(req.body?.destination_chain || req.body?.destinationChain, service.config.defaultSourceChain);
      const blockchainMemo = readText(req.body?.blockchain_memo || req.body?.blockchainMemo) || undefined;
      if (destinationChain === 'stellar') {
        const check = await validateStellarDestination(destinationWallet);
        if (!check.ok) { res.status(400).json({ success: false, message: check.reason }); return; }
      }
      logger.info(`[bridge] Creating COP VA for customer ${customerId} → ${destinationChain}:${destinationWallet}`);
      const account = await service.createCopVirtualAccount(customerId, destinationWallet, destinationChain, blockchainMemo);
      logger.info(`[bridge] COP virtual account created for customer ${customerId}`);
      await BridgeController.upsertVirtualAccount(account, customerId);
      res.status(201).json({ success: true, virtual_account: account });
    } catch (error: any) {
      logger.error(`[bridge] createCopVirtualAccount failed: ${error.message} | bridge_response: ${JSON.stringify(error?.response)}`);
      res.status(statusFromError(error)).json(bridgeError(error, "Failed to create COP virtual account."));
    }
  }

  // ── Additional External Account Types ─────────────────────────

  static async createUsBankExternalAccount(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      const account = await service.addUsBankAccount(customerId, {
        firstName: readText(req.body?.first_name || req.body?.firstName),
        lastName: readText(req.body?.last_name || req.body?.lastName),
        routingNumber: readText(req.body?.routing_number || req.body?.routingNumber),
        accountNumber: readText(req.body?.account_number || req.body?.accountNumber),
        accountType: (req.body?.account_type_bank || req.body?.checking_or_savings || "checking") as any,
        streetLine1: readText(req.body?.street_line_1 || req.body?.streetLine1 || req.body?.address?.street_line_1),
        city: readText(req.body?.city || req.body?.address?.city),
        state: readText(req.body?.state || req.body?.address?.state),
        postalCode: readText(req.body?.postal_code || req.body?.postalCode || req.body?.address?.postal_code),
      });
      logger.info(`[bridge] US bank external account created for customer ${customerId}`);
      res.status(201).json({ success: true, external_account: account });
    } catch (error: any) {
      logger.error(`[bridge] createUsBankExternalAccount failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create US bank account." });
    }
  }

  static async createIbanExternalAccount(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      const account = await service.addIbanAccount(customerId, {
        firstName: readText(req.body?.first_name || req.body?.firstName),
        lastName: readText(req.body?.last_name || req.body?.lastName),
        iban: readText(req.body?.iban),
        bic: readText(req.body?.bic || req.body?.swift) || undefined,
        bankName: readText(req.body?.bank_name || req.body?.bankName) || undefined,
        currency: readText(req.body?.currency) || undefined,
      });
      logger.info(`[bridge] IBAN external account created for customer ${customerId}`);
      res.status(201).json({ success: true, external_account: account });
    } catch (error: any) {
      logger.error(`[bridge] createIbanExternalAccount failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create IBAN account." });
    }
  }

  static async createClabeExternalAccount(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      const account = await service.addClabeAccount(customerId, {
        firstName: readText(req.body?.first_name || req.body?.firstName),
        lastName: readText(req.body?.last_name || req.body?.lastName),
        clabe: readText(req.body?.clabe),
        bankName: readText(req.body?.bank_name || req.body?.bankName) || undefined,
      });
      logger.info(`[bridge] CLABE external account created for customer ${customerId}`);
      res.status(201).json({ success: true, external_account: account });
    } catch (error: any) {
      logger.error(`[bridge] createClabeExternalAccount failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create CLABE account." });
    }
  }

  static async deactivateExternalAccount(req: Request, res: Response): Promise<void> {
    try {
      await getBridgeService().deactivateExternalAccount(String(req.params.externalAccountId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to deactivate external account." });
    }
  }

  // ── Generic Liquidation Address ───────────────────────────────

  static async createLiquidationAddress(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = String(req.params.id);
      // destination_payment_rail: pix | ach | wire | sepa | spei | faster_payments | bre_b
      const destinationRail = readText(req.body?.destination_payment_rail || req.body?.payment_rail, "ach");
      // currency = source crypto (usdc, usdt, etc.) — NOT the fiat
      const sourceCrypto = readText(req.body?.currency || req.body?.source_currency, "usdc");
      const chain = readText(req.body?.chain || req.body?.source_chain, service.config.defaultSourceChain);
      const externalAccountId = readText(req.body?.external_account_id || req.body?.externalAccountId) || undefined;
      const feePercent = readText(req.body?.developer_fee_percent || req.body?.developerFeePercent, service.config.developerFeePercent);

      // Derive destination fiat currency from rail if not explicitly provided
      const RAIL_TO_FIAT: Record<string, string> = {
        pix: "brl", ach: "usd", wire: "usd", sepa: "eur",
        spei: "mxn", faster_payments: "gbp", bre_b: "cop",
      };
      const destinationCurrency = readText(req.body?.destination_currency) || RAIL_TO_FIAT[destinationRail] || "usd";

      const payload = {
        currency: sourceCrypto,
        chain,
        destination_payment_rail: destinationRail,
        destination_currency: destinationCurrency,
        external_account_id: externalAccountId,
        custom_developer_fee_percent: feePercent || undefined,
      };
      logger.info(`[bridge] createLiquidationAddress payload: ${JSON.stringify(payload)}`);
      const address = await service.createLiquidationAddress(customerId, payload);

      logger.info(`[bridge] liquidation address (${destinationRail}) created for customer ${customerId}`);
      res.status(201).json({ success: true, liquidation_address: address });
    } catch (error: any) {
      logger.error(`[bridge] createLiquidationAddress failed: ${error.message} | bridge_response: ${JSON.stringify((error as any)?.response)}`);
      res.status(statusFromError(error)).json(bridgeError(error, "Failed to create liquidation address."));
    }
  }

  // ── Off-Ramp Transfers ────────────────────────────────────────

  static async createCryptoToAchTransfer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = readText(req.body?.on_behalf_of || req.body?.customer_id);
      const amount = readText(req.body?.amount || "0");
      const externalAccountId = readText(req.body?.external_account_id || req.body?.externalAccountId);
      const stellarAddress = readText(req.body?.from_address || req.body?.fromAddress);
      const rail = readText(req.body?.payment_rail || req.body?.ach_type, "ach") as any;
      const reference = readText(req.body?.ach_reference || req.body?.reference) || undefined;

      assertBridgeAmountInRange(amount, service.config.minUsdAmount, service.config.maxUsdAmount, "USD");

      const transfer = await service.createTransfer({
        on_behalf_of: customerId,
        developer_fee_percent: readText(req.body?.developer_fee_percent) || undefined,
        source: { payment_rail: 'stellar', currency: 'usdc', from_address: stellarAddress || undefined },
        destination: {
          amount,
          payment_rail: rail,
          currency: 'usd',
          external_account_id: externalAccountId || undefined,
          ...(reference ? { ach_reference: reference.slice(0, 10) } : {}),
        },
      });
      logger.info(`[bridge] crypto-to-ach transfer created: ${transfer.id}`);
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      logger.error(`[bridge] createCryptoToAchTransfer failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create ACH transfer." });
    }
  }

  static async createCryptoToWireTransfer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = readText(req.body?.on_behalf_of || req.body?.customer_id);
      const amount = readText(req.body?.amount || "0");
      const externalAccountId = readText(req.body?.external_account_id || req.body?.externalAccountId);
      const stellarAddress = readText(req.body?.from_address || req.body?.fromAddress);
      const wireMessage = readText(req.body?.wire_message || req.body?.memo) || undefined;

      assertBridgeAmountInRange(amount, service.config.minUsdAmount, service.config.maxUsdAmount, "USD");

      const transfer = await service.createWireOffRamp(
        customerId, stellarAddress, amount, externalAccountId, wireMessage,
      );
      logger.info(`[bridge] crypto-to-wire transfer created: ${transfer.id}`);
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      logger.error(`[bridge] createCryptoToWireTransfer failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create wire transfer." });
    }
  }

  static async createCryptoToRtpTransfer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = readText(req.body?.on_behalf_of || req.body?.customer_id);
      const amount = readText(req.body?.amount || "0");
      const externalAccountId = readText(req.body?.external_account_id || req.body?.externalAccountId);
      const stellarAddress = readText(req.body?.from_address || req.body?.fromAddress);
      const rail = readText(req.body?.payment_rail, "rtp") as any;

      assertBridgeAmountInRange(amount, service.config.minUsdAmount, service.config.maxUsdAmount, "USD");

      const transfer = await service.createTransfer({
        on_behalf_of: customerId,
        developer_fee_percent: readText(req.body?.developer_fee_percent) || undefined,
        source: { payment_rail: 'stellar', currency: 'usdc', from_address: stellarAddress || undefined },
        destination: { amount, payment_rail: rail, currency: 'usd', external_account_id: externalAccountId || undefined },
      });
      logger.info(`[bridge] crypto-to-${rail} transfer created: ${transfer.id}`);
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      logger.error(`[bridge] createCryptoToRtpTransfer failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create RTP/FedNow transfer." });
    }
  }

  static async createCryptoToSepaTransfer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = readText(req.body?.on_behalf_of || req.body?.customer_id);
      const amount = readText(req.body?.amount || "0");
      const externalAccountId = readText(req.body?.external_account_id || req.body?.externalAccountId);
      const stellarAddress = readText(req.body?.from_address || req.body?.fromAddress);

      assertBridgeAmountInRange(amount, service.config.minEurAmount, service.config.maxEurAmount, "EUR");

      const transfer = await service.createSepaOffRamp(
        customerId, stellarAddress, amount, externalAccountId,
      );
      logger.info(`[bridge] crypto-to-sepa transfer created: ${transfer.id}`);
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      logger.error(`[bridge] createCryptoToSepaTransfer failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create SEPA transfer." });
    }
  }

  static async createCryptoToSpeiTransfer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = readText(req.body?.on_behalf_of || req.body?.customer_id);
      const amount = readText(req.body?.amount || "0");
      const externalAccountId = readText(req.body?.external_account_id || req.body?.externalAccountId);
      const stellarAddress = readText(req.body?.from_address || req.body?.fromAddress);

      assertBridgeAmountInRange(amount, service.config.minMxnAmount, service.config.maxMxnAmount, "MXN");

      const transfer = await service.createSpeiOffRamp(
        customerId, stellarAddress, amount, externalAccountId,
      );
      logger.info(`[bridge] crypto-to-spei transfer created: ${transfer.id}`);
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      logger.error(`[bridge] createCryptoToSpeiTransfer failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create SPEI transfer." });
    }
  }

  // ── Generic Transfer (passthrough) ───────────────────────────

  static async createTransfer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const body = req.body || {};
      if (!body.on_behalf_of) {
        res.status(400).json({ success: false, message: "on_behalf_of (customer_id) is required." });
        return;
      }
      const transfer = await service.createTransfer(body);
      logger.info(`[bridge] transfer created: ${transfer.id}`);
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      logger.error(`[bridge] createTransfer failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create transfer." });
    }
  }

  static async listTransfers(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const params = {
        starting_after: String(req.query.starting_after || "").trim() || undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      } as any;
      const transfers = await service.listAllTransfers(params);
      res.json({ success: true, transfers });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to list transfers." });
    }
  }

  static async listCustomerTransfers(req: Request, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const params = {
        starting_after: String(req.query.starting_after || "").trim() || undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      } as any;
      const transfers = await getBridgeService().listCustomerTransfers(customerId, params);
      res.json({ success: true, transfers });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to list customer transfers." });
    }
  }

  static async cancelTransfer(req: Request, res: Response): Promise<void> {
    try {
      await getBridgeService().cancelTransfer(String(req.params.transferId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to cancel transfer." });
    }
  }

  // ── Customer Management ───────────────────────────────────────

  static async updateCustomer(req: Request, res: Response): Promise<void> {
    try {
      const customerId = String(req.params.id);
      const customer = await getBridgeService().updateCustomer(customerId, req.body || {});
      res.json({ success: true, customer });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to update customer." });
    }
  }

  static async createBusinessCustomer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customer = await service.createBusinessCustomer({
        type: 'business',
        business_name: readText(req.body?.business_name || req.body?.businessName),
        email: readText(req.body?.email) || undefined,
        phone: readText(req.body?.phone) || undefined,
        ein: readText(req.body?.ein) || undefined,
        website: readText(req.body?.website) || undefined,
        description: readText(req.body?.description) || undefined,
        address: req.body?.address,
      });
      res.status(201).json({ success: true, customer });
    } catch (error: any) {
      logger.error(`[bridge] createBusinessCustomer failed: ${error.message}`);
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create business customer." });
    }
  }

  // ── Webhook Management ────────────────────────────────────────

  static async listWebhooks(_req: Request, res: Response): Promise<void> {
    try {
      const webhooks = await getBridgeService().listWebhooks();
      res.json({ success: true, webhooks });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to list webhooks." });
    }
  }

  static async createWebhook(req: Request, res: Response): Promise<void> {
    try {
      const url = readText(req.body?.url);
      const eventTypes = req.body?.event_types || req.body?.eventTypes;
      if (!url) {
        res.status(400).json({ success: false, message: "url is required." });
        return;
      }
      const webhook = await getBridgeService().createWebhook(url, eventTypes);
      res.status(201).json({ success: true, webhook });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create webhook." });
    }
  }

  static async getWebhook(req: Request, res: Response): Promise<void> {
    try {
      const webhook = await getBridgeService().getWebhook(String(req.params.webhookId));
      res.json({ success: true, webhook });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Webhook not found." });
    }
  }

  static async updateWebhook(req: Request, res: Response): Promise<void> {
    try {
      const url = readText(req.body?.url);
      const eventTypes = req.body?.event_types || req.body?.eventTypes;
      const webhook = await getBridgeService().updateWebhook(String(req.params.webhookId), url, eventTypes);
      res.json({ success: true, webhook });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to update webhook." });
    }
  }

  static async deleteWebhook(req: Request, res: Response): Promise<void> {
    try {
      await getBridgeService().deleteWebhook(String(req.params.webhookId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to delete webhook." });
    }
  }

  // ── Static Memo Management ────────────────────────────────────

  static async listStaticMemos(_req: Request, res: Response): Promise<void> {
    try {
      const memos = await getBridgeService().listStaticMemos();
      res.json({ success: true, static_memos: memos });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to list static memos." });
    }
  }

  static async createStaticMemo(req: Request, res: Response): Promise<void> {
    try {
      const body = req.body || {};
      if (!body.on_behalf_of && !body.destination) {
        res.status(400).json({ success: false, message: "on_behalf_of and destination are required." });
        return;
      }
      const memo = await getBridgeService().createStaticMemo(body);
      res.status(201).json({ success: true, static_memo: memo });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create static memo." });
    }
  }

  static async getStaticMemo(req: Request, res: Response): Promise<void> {
    try {
      const memo = await getBridgeService().getStaticMemo(String(req.params.memoId));
      res.json({ success: true, static_memo: memo });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Static memo not found." });
    }
  }

  static async deleteStaticMemo(req: Request, res: Response): Promise<void> {
    try {
      await getBridgeService().deleteStaticMemo(String(req.params.memoId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to delete static memo." });
    }
  }

  // ── Bridge Wallets ────────────────────────────────────────────
  // Custodial wallets on base, ethereum, solana, tempo, or tron.
  // Bridge does NOT support Stellar as a wallet chain.

  static async createWallet(req: Request, res: Response): Promise<void> {
    try {
      const customerId = readText(req.params.id);
      const chain = readText(req.body?.chain);
      const allowed = ["base", "ethereum", "solana", "tempo", "tron"];
      if (!chain || !allowed.includes(chain)) {
        res.status(400).json({
          success: false,
          message: `chain is required and must be one of: ${allowed.join(", ")}. Note: Stellar is not a Bridge Wallet chain.`,
        });
        return;
      }
      const wallet = await getBridgeService().createWallet(customerId, chain as any);
      // Persist to DB
      await supabase.from('bridge_custodial_wallets').upsert({
        id: wallet.id,
        customer_id: customerId,
        chain: wallet.chain,
        address: wallet.address,
        initiation_required: wallet.initiation_required ?? false,
        created_at: wallet.created_at,
        updated_at: wallet.updated_at,
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' });
      res.status(201).json({ success: true, wallet });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to create Bridge Wallet." });
    }
  }

  static async listWallets(req: Request, res: Response): Promise<void> {
    try {
      const customerId = readText(req.params.id);
      // Try Bridge API first, fall back to DB on failure
      let wallets: any[];
      try {
        wallets = await getBridgeService().listWallets(customerId);
        // Sync all to DB
        if (wallets.length > 0) {
          await supabase.from('bridge_custodial_wallets').upsert(
            wallets.map((w) => ({
              id: w.id,
              customer_id: customerId,
              chain: w.chain,
              address: w.address,
              initiation_required: w.initiation_required ?? false,
              created_at: w.created_at,
              updated_at: w.updated_at,
              synced_at: new Date().toISOString(),
            })),
            { onConflict: 'id' },
          );
        }
      } catch (bridgeErr: any) {
        logger.warn(`[bridge] listWallets Bridge API failed, serving from DB: ${bridgeErr.message}`);
        const { data } = await supabase
          .from('bridge_custodial_wallets')
          .select('*')
          .eq('customer_id', customerId)
          .order('created_at', { ascending: false });
        wallets = data || [];
      }
      res.json({ success: true, wallets });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to list Bridge Wallets." });
    }
  }

  static async listWalletsFromDb(req: Request, res: Response): Promise<void> {
    try {
      const customerId = readText(req.params.id);
      const { data, error } = await supabase
        .from('bridge_custodial_wallets')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      res.json({ success: true, wallets: data || [] });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Failed to load wallets from DB." });
    }
  }

  static async getWallet(req: Request, res: Response): Promise<void> {
    try {
      const { id, walletId } = req.params;
      const wallet = await getBridgeService().getWallet(readText(id), readText(walletId));
      res.json({ success: true, wallet });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Bridge Wallet not found." });
    }
  }

  /**
   * Pipeline diagnostics: shows where the money actually is across the whole
   * USD → Base USDC → Stellar flow, plus each Bridge wallet's chain/address and
   * whether it needs an `initiation` object on transfer. Read-only.
   */
  static async getTransferPipeline(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = readText(req.params.id);

      const [wallets, vas] = await Promise.all([
        service.listWallets(customerId).catch(() => []),
        service.listVirtualAccounts(customerId).catch(() => []),
      ]);

      // Each Bridge wallet already carries its own per-chain balances.
      const walletDetails = (Array.isArray(wallets) ? wallets : []).map((w: any) => {
        const balances = Array.isArray(w.balances) ? w.balances : [];
        const usdc = balances.find((b: any) => String(b.currency).toLowerCase() === "usdc");
        return {
          id: w.id,
          chain: w.chain,
          address: w.address,
          initiation_required: Boolean(w.initiation_required),
          created_at: w.created_at ?? null,
          tags: Array.isArray(w.tags) ? w.tags : [],
          usdc_balance: usdc?.balance ?? "0",
          balances: balances.map((b: any) => ({
            chain: b.chain,
            currency: b.currency,
            amount: b.balance ?? b.amount ?? "0",
            contract_address: b.contract_address ?? null,
          })),
        };
      });

      const routes = (Array.isArray(vas) ? vas : []).map((va: any) => ({
        id: va.id,
        status: va.status,
        // Bridge stores the route under va.destination (a TransferEndpoint)
        destination_chain: va.destination?.payment_rail ?? va.destination_chain ?? null,
        destination_address: va.destination?.address ?? va.destination?.to_address ?? va.destination_address ?? null,
        source_currency: va.source_deposit_instructions?.currency ?? va.source_currency ?? null,
      }));

      res.json({
        success: true,
        customer_id: customerId,
        wallets: walletDetails,
        virtual_account_routes: routes,
      });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.error || error?.message || "Failed to load pipeline.",
        bridge_details: error?.response ?? null,
      });
    }
  }

  static async createBridgeWalletToStellarTransfer(req: Request, res: Response): Promise<void> {
    try {
      const service = getBridgeService();
      const customerId = readText(req.params.id);
      const walletId = readText(req.params.walletId);
      const amount = readText(req.body?.amount || "0");
      const destinationAddress = readText(
        req.body?.destination_wallet ||
          req.body?.destinationWallet ||
          req.body?.stellar_address ||
          req.body?.stellarAddress,
      );

      assertBridgeAmountInRange(amount, service.config.minUsdcAmount, service.config.maxUsdcAmount, "USDC");
      const check = await validateStellarDestination(destinationAddress);
      if (!check.ok) {
        res.status(400).json({ success: false, message: check.reason });
        return;
      }

      // Bridge convention (matches every working off-ramp): amount lives on the
      // destination only, source carries no amount, and crypto destinations use
      // `to_address` (not `address`).
      const transfer = await service.createTransfer({
        on_behalf_of: customerId,
        developer_fee_percent: readText(req.body?.developer_fee_percent || req.body?.developerFeePercent) || undefined,
        source: {
          // For a bridge_wallet source, bridge_wallet_id identifies it.
          // from_address is NOT supported here and Bridge rejects it.
          payment_rail: "bridge_wallet",
          currency: "usdc",
          bridge_wallet_id: walletId,
        },
        destination: {
          amount,
          payment_rail: "stellar",
          currency: "usdc",
          to_address: destinationAddress,
          // Bridge requires a blockchain_memo for Stellar destinations. The
          // destination is the user's own dedicated account, so any valid memo
          // works (funds land regardless of memo).
          blockchain_memo: readText(req.body?.blockchain_memo) || String(Math.floor(Math.random() * 9_000_000) + 1_000_000),
        } as any,
      });

      logger.info(`[bridge] bridge-wallet-to-stellar transfer created: ${transfer.id}`);

      // Associate the destination wallet with the customer's session in stellar_mainnet_wallets
      try {
        const { data: custRow } = await supabase
          .from('bridge_customers')
          .select('email')
          .eq('bridge_customer_id', customerId)
          .maybeSingle();
        if (custRow?.email) {
          const { data: sessRow } = await supabase
            .from('agent_sessions')
            .select('session_id, user_id')
            .eq('email', custRow.email)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (sessRow?.session_id && sessRow?.user_id) {
            await supabase.from('stellar_mainnet_wallets').upsert({
              session_id: sessRow.session_id,
              user_id: sessRow.user_id,
              public_key: destinationAddress,
              label: 'Bridge-linked wallet',
              wallet_kind: 'external_public_key',
              is_primary: false,
              metadata: { linked_from: 'bridge_transfer', transfer_id: transfer.id },
            }, { onConflict: 'session_id,public_key' });
            logger.info(`[bridge] Linked mainnet wallet ${destinationAddress} to session ${sessRow.session_id}`);
          }
        }
      } catch (linkErr: any) {
        logger.warn(`[bridge] Failed to link mainnet wallet: ${linkErr.message}`);
      }

      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      // Bridge attaches the exact invalid fields under `source` / `response`.
      logger.error(`[bridge] createBridgeWalletToStellarTransfer failed: ${error?.message} ${JSON.stringify({ source: error?.source, response: error?.response })}`);
      res.status(statusFromError(error)).json({
        success: false,
        message: error?.error || error?.message || "Failed to create Bridge wallet to Stellar transfer.",
        bridge_invalid_fields: error?.source ?? null,
        bridge_details: error?.response ?? null,
      });
    }
  }

  static async getWalletTransactions(req: Request, res: Response): Promise<void> {
    try {
      const walletId = readText(req.params.walletId);
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const startingAfter = readText(req.query.starting_after as string) || undefined;
      const transactions = await getBridgeService().getWalletTransactions(walletId, { limit, starting_after: startingAfter });
      res.json({ success: true, transactions });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to get wallet transactions." });
    }
  }

  static async getWalletBalances(_req: Request, res: Response): Promise<void> {
    try {
      const balances = await getBridgeService().getWalletBalances();
      res.json({ success: true, balances });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Failed to get wallet balances." });
    }
  }

  static async getGlobalWallet(req: Request, res: Response): Promise<void> {
    try {
      const walletId = readText(req.params.walletId);
      const wallet = await getBridgeService().getGlobalWallet(walletId);
      res.json({ success: true, wallet });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: error?.message || "Bridge Wallet not found." });
    }
  }

  static async getSessionStellarBalances(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = readText(req.query.session_id ?? req.body?.session_id);
      const email = readText(req.query.email ?? req.body?.email).toLowerCase();

      if (!sessionId && !email) {
        res.status(400).json({ success: false, message: "session_id or email is required." });
        return;
      }

      // Resolve public key from session or email
      let publicKey = "";
      if (sessionId) {
        const { data: walletRow } = await supabase
          .from("wallets").select("public_key").eq("session_id", sessionId).maybeSingle();
        if (walletRow?.public_key) publicKey = walletRow.public_key;
      }
      if (!publicKey && email) {
        const { data: sessionRow } = await supabase
          .from("agent_sessions").select("session_id").eq("email", email)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (sessionRow?.session_id) {
          const { data: walletRow } = await supabase
            .from("wallets").select("public_key").eq("session_id", sessionRow.session_id).maybeSingle();
          if (walletRow?.public_key) publicKey = walletRow.public_key;
        }
      }

      if (!publicKey) {
        res.json({ success: true, public_key: null, testnet: null, mainnet: null });
        return;
      }

      // Fetch from both Horizon servers in parallel
      const MAINNET_HORIZON = "https://horizon.stellar.org";
      const TESTNET_HORIZON = "https://horizon-testnet.stellar.org";
      const MAINNET_USDC = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
      const TESTNET_USDC = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

      async function fetchBalance(horizonUrl: string, usdcIssuer: string): Promise<{ usdc: string; xlm: string } | null> {
        try {
          const r = await fetch(`${horizonUrl}/accounts/${publicKey}`);
          if (!r.ok) return null;
          const acct: any = await r.json();
          const balances: Array<{ asset_type: string; asset_code?: string; asset_issuer?: string; balance: string }> =
            Array.isArray(acct.balances) ? acct.balances : [];
          const usdc = balances.find(
            (b) => b.asset_type === "credit_alphanum4" && b.asset_code === "USDC" && b.asset_issuer === usdcIssuer
          )?.balance ?? "0";
          const xlm = balances.find((b) => b.asset_type === "native")?.balance ?? "0";
          return { usdc, xlm };
        } catch {
          return null;
        }
      }

      const [testnetBalance, mainnetBalance] = await Promise.all([
        fetchBalance(TESTNET_HORIZON, TESTNET_USDC),
        fetchBalance(MAINNET_HORIZON, MAINNET_USDC),
      ]);

      res.json({
        success: true,
        public_key: publicKey,
        testnet: testnetBalance,
        mainnet: mainnetBalance,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Failed to fetch balances." });
    }
  }

  // ── Bridge destination wallets (stored by email) ──────────────────────

  /** Resolve the Bridge customer email from session_id or email query/body. */
  private static async resolveBridgeEmail(req: Request): Promise<string> {
    const email = readText(req.query.email ?? req.body?.email).toLowerCase();
    if (email) return email;
    const sessionId = readText(req.query.session_id ?? req.body?.session_id ?? req.headers["x-session-id"]);
    if (sessionId) {
      const { data: session } = await supabase
        .from("agent_sessions").select("email").eq("session_id", sessionId).maybeSingle();
      if (session?.email) return String(session.email).toLowerCase();
    }
    return "";
  }

  /** List the custodial Stellar destination wallets stored for a Bridge email, with live balances. */
  static async listStellarWallets(req: Request, res: Response): Promise<void> {
    try {
      const email = await BridgeController.resolveBridgeEmail(req);
      if (!email) {
        res.status(400).json({ success: false, message: "session_id or email is required." });
        return;
      }

      const { data: rows } = await supabase
        .from("bridge_stellar_wallets")
        .select("id, public_key, label, is_primary, is_funded, has_usdc_trustline, created_at")
        .eq("email", email)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false });

      const wallets = await Promise.all((rows || []).map(async (w: any) => {
        let usdc_balance: string | null = null;
        let exists = false;
        try {
          const account = await mainnetServer.loadAccount(w.public_key);
          exists = true;
          const usdc = account.balances.find(
            (b: any) => b.asset_type === "credit_alphanum4" && b.asset_code === "USDC" && b.asset_issuer === PUBLIC_USDC_ISSUER,
          );
          usdc_balance = usdc?.balance ?? "0";
        } catch {
          // not yet on-ledger
        }
        return { ...w, usdc_balance, exists_on_mainnet: exists };
      }));

      res.json({ success: true, email, wallets });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Failed to list wallets." });
    }
  }

  /** Generate + fund a new custodial Stellar wallet on mainnet, stored for the Bridge email. */
  static async generateStellarWallet(req: Request, res: Response): Promise<void> {
    try {
      const email = await BridgeController.resolveBridgeEmail(req);
      if (!email) {
        res.status(400).json({ success: false, message: "session_id or email is required." });
        return;
      }

      const label = readText(req.body?.label) || `Wallet for ${email}`;
      const result = await createAndFundMainnetWallet(label);

      if (!result.public_key) {
        res.status(502).json({ success: false, message: result.reason || "Wallet generation failed." });
        return;
      }

      // Whether or not on-chain setup fully succeeded, persist the wallet so it is recoverable.
      const isFirst = !(await supabase
        .from("bridge_stellar_wallets").select("id").eq("email", email).limit(1).maybeSingle()).data;

      const { data: inserted, error: insertError } = await supabase
        .from("bridge_stellar_wallets")
        .insert({
          email,
          public_key: result.public_key,
          vault_secret_id: result.vault_secret_id ?? null,
          label,
          is_primary: isFirst,
          is_funded: Boolean(result.funded),
          has_usdc_trustline: Boolean(result.trustline),
        })
        .select("id, public_key, label, is_primary, is_funded, has_usdc_trustline, created_at")
        .single();

      if (insertError) throw insertError;

      res.status(201).json({
        success: true,
        // When the wallet couldn't be auto-funded, this note tells the user to send XLM.
        needs_funding: !result.funded,
        sponsored: Boolean(result.sponsored),
        message: result.reason,
        wallet: { ...inserted, usdc_balance: "0", exists_on_mainnet: Boolean(result.funded) },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Failed to generate wallet." });
    }
  }

  /** Activate an existing generated wallet via sponsored reserves (0 XLM for the user). */
  static async activateStellarWallet(req: Request, res: Response): Promise<void> {
    try {
      const email = await BridgeController.resolveBridgeEmail(req);
      const publicKey = readText(req.body?.public_key ?? req.body?.publicKey);
      if (!email || !publicKey) {
        res.status(400).json({ success: false, message: "email/session_id and public_key are required." });
        return;
      }

      const { data: row } = await supabase
        .from("bridge_stellar_wallets")
        .select("vault_secret_id")
        .eq("email", email)
        .eq("public_key", publicKey)
        .maybeSingle();

      if (!row?.vault_secret_id) {
        res.status(404).json({ success: false, message: "Wallet not found for this account." });
        return;
      }

      const result = await sponsorExistingWallet(publicKey, String(row.vault_secret_id));

      if (result.funded || result.trustline) {
        await supabase
          .from("bridge_stellar_wallets")
          .update({ is_funded: result.funded, has_usdc_trustline: result.trustline })
          .eq("public_key", publicKey);
      }

      if (!result.ok) {
        res.status(502).json({ success: false, message: result.reason || "Activation failed.", funded: result.funded, trustline: result.trustline });
        return;
      }

      res.json({
        success: true,
        message: "Wallet activated. It can now receive USDC.",
        wallet: { public_key: publicKey, is_funded: result.funded, has_usdc_trustline: result.trustline, exists_on_mainnet: result.funded },
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Failed to activate wallet." });
    }
  }

  /**
   * Invest a Bridge-linked Stellar wallet's USDC into the DeFindex MAINNET
   * vault — a self-contained mainnet path that does not depend on the app's
   * network. Resolves the wallet's vaulted key, tops up gas from the sponsor,
   * builds + signs + submits the deposit on mainnet.
   */
  static async investStellarWallet(req: Request, res: Response): Promise<void> {
    try {
      const email = await BridgeController.resolveBridgeEmail(req);
      const publicKey = readText(req.body?.public_key ?? req.body?.publicKey);
      const amount = readText(req.body?.amount);

      if (!email || !publicKey) {
        res.status(400).json({ success: false, message: "email/session_id and public_key are required." });
        return;
      }
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        res.status(400).json({ success: false, message: "A positive amount is required." });
        return;
      }

      // Resolve the wallet's vaulted signing key (must belong to this email).
      const { data: row } = await supabase
        .from("bridge_stellar_wallets")
        .select("vault_secret_id")
        .eq("email", email)
        .eq("public_key", publicKey)
        .maybeSingle();
      if (!row?.vault_secret_id) {
        res.status(404).json({ success: false, message: "Wallet not found for this account." });
        return;
      }
      const secret = await new VaultService(supabase).getSecret(String(row.vault_secret_id));
      if (!secret) {
        res.status(500).json({ success: false, message: "Wallet signing key is unavailable." });
        return;
      }
      const keypair = Keypair.fromSecret(secret);

      // Make sure the wallet can pay Soroban fees.
      await ensureWalletGasMainnet(publicKey, 1);

      // Protocol: "defindex" (vault, default) or "blend" (direct lending pool).
      const protocol = (readText(req.body?.protocol) || "defindex").toLowerCase();

      let hash: string | null = null;
      let result: any;
      let target = "";

      if (protocol === "blend") {
        // Direct Blend supply on mainnet.
        const pool = await BlendService.getPoolInfo("mainnet");
        const assetId = pool.usdc?.assetId;
        if (!assetId) throw new Error("Blend USDC reserve not available on mainnet.");
        const amountStroops = String(Math.floor(amountNum * 1e7));
        const built = await BlendService.buildSupplyXdr({ userAddress: publicKey, assetId, amount: amountStroops, network: "mainnet" });
        target = built.poolId;
        const tx = TransactionBuilder.fromXDR(built.xdr, Networks.PUBLIC);
        tx.sign(keypair);
        const submit = await BlendService.submitSignedXdr(tx.toXDR(), "mainnet");
        hash = submit.hash;
        result = submit;
        logger.info(`[bridge] mainnet Blend supply ${amount} USDC from ${publicKey} -> ${target} hash=${hash}`);
      } else {
        // DeFindex vault deposit on mainnet.
        target = (process.env.DEFINDEX_USDC_VAULT_MAINNET || "").trim() || DEFINDEX_USDC_VAULT_MAINNET;
        const amountUnits = DefindexYieldService.amountToContractUnits(amount, 7);
        const { xdr } = await DefindexYieldService.buildVaultAction({
          action: "deposit",
          vaultAddress: target,
          caller: publicKey,
          amountUnits,
          network: "mainnet",
          invest: true,
        });
        const tx = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC);
        tx.sign(keypair);
        result = await DefindexYieldService.sendSignedTransaction(tx.toXDR(), "mainnet");
        hash = result?.hash || result?.txHash || result?.transactionHash || null;
        logger.info(`[bridge] mainnet DeFindex deposit ${amount} USDC from ${publicKey} -> ${target} hash=${hash}`);
      }

      res.status(201).json({
        success: true,
        network: "mainnet",
        protocol,
        vault: target,
        public_key: publicKey,
        amount,
        hash,
        result,
      });
    } catch (error: any) {
      const msg = error?.response?.data?.error || error?.message || "Failed to invest on mainnet.";
      logger.error(`[bridge] investStellarWallet failed: ${msg}`);
      res.status(statusFromError(error)).json({ success: false, message: msg });
    }
  }

  /**
   * Mainnet yield positions for a Bridge wallet: how much USDC it currently
   * has working in DeFindex and Blend (so the UI can show invested funds, not
   * just the idle wallet balance).
   */
  static async getStellarWalletPositions(req: Request, res: Response): Promise<void> {
    try {
      const email = await BridgeController.resolveBridgeEmail(req);
      const publicKey = readText(req.query.public_key ?? req.body?.public_key);
      if (!email || !publicKey) {
        res.status(400).json({ success: false, message: "email/session_id and public_key are required." });
        return;
      }

      const vault = (process.env.DEFINDEX_USDC_VAULT_MAINNET || "").trim() || DEFINDEX_USDC_VAULT_MAINNET;

      // DeFindex vault position (underlying USDC)
      let defindexUsdc = 0;
      try {
        const bal: any = await DefindexYieldService.getVaultBalance(vault, publicKey, "mainnet");
        const underlying = bal?.balance?.underlyingBalance ?? bal?.underlyingBalance ?? bal?.balance?.underlying ?? null;
        const raw = Array.isArray(underlying) ? underlying[0] : underlying;
        if (raw != null) defindexUsdc = Number(raw) / 1e7;
      } catch (e: any) {
        logger.warn(`[bridge] defindex position fetch failed: ${e?.message || e}`);
      }

      // Blend position (supplied USDC)
      let blendUsdc = 0;
      try {
        const pos: any = await BlendService.getUserPosition(publicKey, "mainnet");
        blendUsdc = (pos?.positions || []).reduce((s: number, p: any) => s + (Number(p.supply) || 0), 0);
      } catch (e: any) {
        logger.warn(`[bridge] blend position fetch failed: ${e?.message || e}`);
      }

      res.json({
        success: true,
        public_key: publicKey,
        defindex_usdc: defindexUsdc,
        blend_usdc: blendUsdc,
        total_invested_usdc: defindexUsdc + blendUsdc,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Failed to load positions." });
    }
  }

  /**
   * Admin: report the sponsor/treasury XLM balance and how many more wallet
   * activations it can still cover (~1.5 XLM locked per sponsored USDC wallet).
   * Guarded by INTERNAL_API_SECRET when that env var is set.
   */
  static async getSponsorStatus(req: Request, res: Response): Promise<void> {
    try {
      const expected = String(process.env.INTERNAL_API_SECRET || process.env.RAMP_SANDBOX_INTERNAL_SECRET || "").trim();
      if (expected) {
        const auth = String(req.headers.authorization || "");
        const provided = String(
          req.headers["x-internal-api-secret"] ||
          (auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "") ||
          req.query.secret ||
          "",
        ).trim();
        if (provided !== expected) {
          res.status(403).json({ success: false, message: "Unauthorized." });
          return;
        }
      }

      const sponsorSecret = resolveSponsorSecret();
      if (!sponsorSecret) {
        res.json({ success: true, configured: false, message: "No sponsor key configured (STELLAR_SPONSOR_SECRET)." });
        return;
      }

      let sponsorPublic = "";
      try {
        sponsorPublic = Keypair.fromSecret(sponsorSecret).publicKey();
      } catch {
        res.status(500).json({ success: false, configured: true, message: "Sponsor secret is malformed." });
        return;
      }

      const BASE_RESERVE = 0.5;        // XLM per reserve entry
      const PER_WALLET_XLM = 1.5;      // 1 account (2 base) is shared; trustline +0.5 → ~1.5 locked per wallet
      const FEE_BUFFER_XLM = 1;        // keep a little for tx fees

      let account: Awaited<ReturnType<typeof mainnetServer.loadAccount>>;
      try {
        account = await mainnetServer.loadAccount(sponsorPublic);
      } catch (e: any) {
        const status = e?.response?.status ?? e?.status;
        if (status === 404) {
          res.json({
            success: true, configured: true, sponsor_public_key: sponsorPublic,
            funded: false, xlm_balance: "0", message: "Sponsor account is not funded on mainnet yet — send it XLM.",
          });
          return;
        }
        throw e;
      }

      const nativeBalance = account.balances.find((b: any) => b.asset_type === "native")?.balance ?? "0";
      const subentryCount = Number((account as any).subentry_count ?? 0);
      const numSponsoring = Number((account as any).num_sponsoring ?? 0);
      const numSponsored = Number((account as any).num_sponsored ?? 0);

      const xlm = Number(nativeBalance);
      const minBalance = (2 + subentryCount + numSponsoring - numSponsored) * BASE_RESERVE;
      const available = Math.max(0, xlm - minBalance - FEE_BUFFER_XLM);
      const remainingCapacity = Math.floor(available / PER_WALLET_XLM);

      // How many wallets we've already activated (locked reserves)
      const { count: activatedCount } = await supabase
        .from("bridge_stellar_wallets")
        .select("id", { count: "exact", head: true })
        .eq("is_funded", true);

      res.json({
        success: true,
        configured: true,
        funded: true,
        sponsor_public_key: sponsorPublic,
        xlm_balance: nativeBalance,
        min_balance_xlm: minBalance.toFixed(4),
        available_xlm: available.toFixed(4),
        per_wallet_xlm: PER_WALLET_XLM,
        remaining_activations: remainingCapacity,
        currently_sponsoring: numSponsoring,
        activated_wallets: activatedCount ?? null,
        explorer_url: `https://stellar.expert/explorer/public/account/${sponsorPublic}`,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error?.message || "Failed to read sponsor status." });
    }
  }
}
