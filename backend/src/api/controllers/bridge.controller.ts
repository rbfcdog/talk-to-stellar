import type { Request, Response } from "express";
import { getBridgeService } from "../../integrations/bridge";
import { logger } from "../../utils/logger";
import { assertBridgeAmountInRange } from "../middlewares/bridge-mainnet.middleware";
import { server as horizonServer, stellarConfig } from "../../config/stellar";
import { PUBLIC_USDC_ISSUER, TESTNET_USDC_ISSUER } from "../../config/assets";
import { Networks } from "@stellar/stellar-sdk";
import { supabase } from "../../config/supabase";

function readText(value: unknown, fallback = ""): string {
  return String(value ?? fallback).trim();
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
  return readCurrency(
    account.source_currency ??
      (account.source as Record<string, unknown> | undefined)?.currency ??
      destination?.currency,
  );
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

/** Verify a Stellar address exists, is funded, and has the USDC trustline before sending to Bridge. */
async function validateStellarDestination(address: string): Promise<{ ok: boolean; reason?: string }> {
  if (!address) return { ok: false, reason: "Stellar destination address is required." };
  try {
    const account = await horizonServer.loadAccount(address);
    const usdcIssuer = stellarConfig.network === Networks.PUBLIC ? PUBLIC_USDC_ISSUER : TESTNET_USDC_ISSUER;
    const hasTrustline = account.balances.some(
      (b: any) => b.asset_type === 'credit_alphanum4' && b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer,
    );
    if (!hasTrustline) {
      return { ok: false, reason: `Stellar address ${address} exists but has no USDC trustline. Add it before using with Bridge.` };
    }
    return { ok: true };
  } catch (e: any) {
    const status = e?.response?.status ?? e?.status;
    if (status === 404) {
      return { ok: false, reason: `Stellar address ${address} does not exist on ${stellarConfig.networkName} mainnet. Fund it with ≥2 XLM and add USDC trustline first.` };
    }
    logger.warn(`[bridge] Horizon check failed for ${address}: ${e?.message}`);
    // Don't block on Horizon errors — let Bridge validate
    return { ok: true };
  }
}

export class BridgeController {
  // ── Session-based helpers ──────────────────────────────────────

  static async getSessionUsdAccount(req: Request, res: Response): Promise<void> {
    try {
      const sessionId = String(req.query.session_id || req.headers['x-session-id'] || '').trim();
      const emailParam = String(req.query.email || '').trim().toLowerCase();

      let email: string | undefined;

      if (sessionId) {
        const { data: session } = await supabase
          .from('agent_sessions')
          .select('email')
          .eq('session_id', sessionId)
          .maybeSingle();
        email = session?.email ?? undefined;
        if (!email) {
          res.status(404).json({ success: false, message: 'Session not found or has no email.' });
          return;
        }
      } else if (emailParam) {
        email = emailParam;
      } else {
        res.status(400).json({ success: false, message: 'session_id or email required' });
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
      try {
        const accounts = await service.listVirtualAccounts(bridgeCustomerId);
        const usdAccounts = (Array.isArray(accounts) ? accounts : []).filter((va: any) => {
          const cur = (va.source_currency || va.currency || '').toLowerCase();
          return cur === 'usd';
        });
        // Enrich each VA with total funds received from activity history
        virtualAccounts = await Promise.all(
          usdAccounts.map(async (va: any) => {
            try {
              const events = await service.getVirtualAccountActivity(
                bridgeCustomerId!,
                va.id,
                { limit: 100 },
              );
              const received = (Array.isArray(events) ? events : [])
                .filter((e: any) => e.type === 'funds_received')
                .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);
              return { ...va, total_received_usd: received };
            } catch {
              return { ...va, total_received_usd: 0 };
            }
          }),
        );
      } catch {
        // non-fatal — return empty list
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
            // Fetch live USDC balance from Horizon
            let usdcBalance: string | null = null;
            try {
              const account = await horizonServer.loadAccount(walletRow.public_key);
              const usdcIssuer = stellarConfig.network === Networks.PUBLIC ? PUBLIC_USDC_ISSUER : TESTNET_USDC_ISSUER;
              const usdcEntry = account.balances.find(
                (b: any) => b.asset_type === 'credit_alphanum4' && b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer,
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

      res.json({
        success: true,
        has_account: true,
        kyc_status: bridgeKycStatus,
        customer_status: bridgeStatus,
        email,
        virtual_accounts: virtualAccounts,
        stellar_wallet: stellarWallet,
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
          const acct = await r.json();
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
}
