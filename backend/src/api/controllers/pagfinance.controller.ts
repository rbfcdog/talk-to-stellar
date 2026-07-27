/**
 * PagFinance Pix cash-in — session-authenticated API.
 *
 * The user pays a Pix QR generated here; the CASHIN_COMPLETED webhook (see
 * pagfinance-webhook.controller) later credits USDC. The BRL→USDC rate is
 * OURS, locked at intent time and persisted in the operation context —
 * PagFinance's cryptoEstimate is stored for reconciliation only.
 */

import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import { AgentRepository } from '../repository/core/agent.repository';
import { WalletRepository } from '../repository/core/wallet.repository';
import { OperationRepository } from '../repository/operation.repository';
import {
  getPagfinanceService,
  PagfinanceApiError,
  PagfinanceClient,
} from '../../integrations/pagfinance';
import { BrlReferenceRateService } from '../services/brl-reference-rate.service';
import { PlatformFeeService } from '../services/fees/platform-fee.service';
import { getStellarNetworkName } from '../../config/assets';
import { isSessionExpired } from '../../utils/session-expiry';
import { logger } from '../../utils/logger';

const INTENT_ID_SAFE = /^[A-Za-z0-9:_-]{4,120}$/;

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D+/g, '');
}

function round7(value: number): number {
  return Math.round(value * 1e7) / 1e7;
}

function requestInput(req: Request): Record<string, unknown> {
  const headerSessionId = str(req.headers['x-session-id'] || req.headers['x-talktostellar-session-id']);
  const headerSessionToken = str(req.headers['x-session-token'] || req.headers['x-talktostellar-session-token']);
  return {
    ...req.query,
    ...req.body,
    ...req.params,
    ...(headerSessionId ? { session_id: headerSessionId } : {}),
    ...(headerSessionToken ? { session_token: headerSessionToken } : {}),
  };
}

/** CPF check-digit validation over the 11-digit string. */
export function isValidCpf(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const position of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < position; i++) sum += Number(cpf[i]) * (position + 1 - i);
    const expected = ((sum * 10) % 11) % 10;
    if (expected !== Number(cpf[position])) return false;
  }
  return true;
}

interface SessionContext {
  sessionId: string;
  userId: string;
  publicKey: string;
  email?: string;
  language?: string;
}

type SessionResult =
  | { ok: true; ctx: SessionContext }
  | { ok: false; status: number; code: string; message: string };

async function resolveSession(input: Record<string, unknown>): Promise<SessionResult> {
  const sessionId = str(input.session_id);
  const sessionToken = str(input.session_token);
  if (!sessionId || !sessionToken) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'session_id and session_token are required.' };
  }

  const session = await new AgentRepository(supabase).getSession(sessionId);
  if (!session || String((session as any).session_token || '') !== sessionToken) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Invalid or expired TalkToStellar session.' };
  }
  if (isSessionExpired(session)) {
    return { ok: false, status: 401, code: 'session_expired', message: 'Session expired. Sign in again.' };
  }

  const wallet = await new WalletRepository(supabase).getWalletBySession(sessionId);
  const publicKey = str((session as any).public_key) || str(wallet?.public_key);
  if (!publicKey) {
    return { ok: false, status: 409, code: 'no_wallet', message: 'This session does not have an active wallet.' };
  }

  return {
    ok: true,
    ctx: {
      sessionId,
      userId: str((session as any).user_id) || sessionId,
      publicKey,
      email: str((session as any).email) || undefined,
      language: str((session as any).language) || undefined,
    },
  };
}

async function readCustomerData(sessionId: string): Promise<{ name?: string; cpf?: string }> {
  let name: string | undefined;
  const { data: walletRow } = await supabase
    .from('wallets')
    .select('name')
    .eq('session_id', sessionId)
    .maybeSingle();
  name = str(walletRow?.name) || undefined;

  const { data: rows } = await supabase
    .from('external_accounts')
    .select('data')
    .eq('session_id', sessionId)
    .not('data', 'is', null)
    .limit(20);

  let cpf: string | undefined;
  for (const row of rows || []) {
    const rowCpf = digits((row as any)?.data?.cpf);
    if (rowCpf.length === 11) {
      cpf = rowCpf;
      if (!name) name = str((row as any)?.data?.name) || undefined;
      break;
    }
    if (!name) name = str((row as any)?.data?.name) || undefined;
  }
  return { name, cpf };
}

async function saveCustomerData(input: {
  sessionId: string;
  userId: string;
  name: string;
  cpf: string;
}): Promise<{ ok: boolean; conflict?: boolean; error?: string }> {
  const { error } = await supabase.from('external_accounts').insert([
    {
      session_id: input.sessionId,
      user_id: input.userId,
      provider: 'pagfinance',
      data: { cpf: input.cpf, name: input.name },
    },
  ]);
  if (!error) return { ok: true };

  const message = String(error.message || '');
  if ((error as any).code === '23505' || /unique|duplicate/i.test(message)) {
    return { ok: false, conflict: true, error: 'CPF já vinculado a outra conta TalkToStellar.' };
  }
  logger.warn(`[pagfinance] could not persist customer data: ${message}`);
  // Non-fatal: the intent can proceed; the user will just be asked again.
  return { ok: true };
}

type RateResult =
  | { ok: true; usdcGross: number; brlPerUsdc: number; source: 'onchain_path' | 'fallback_env' }
  | { ok: false; error: string };

async function resolveRate(amountBrl: number, fallbackBrlPerUsdc: number | null): Promise<RateResult> {
  try {
    const quote = await BrlReferenceRateService.quoteBrlToUsdc(amountBrl);
    const gross = Number(quote.destinationAmount);
    if (Number.isFinite(gross) && gross > 0) {
      return { ok: true, usdcGross: gross, brlPerUsdc: Number(quote.brlPerUsdc), source: 'onchain_path' };
    }
  } catch (e: any) {
    logger.warn(`[pagfinance] BRL→USDC path quote failed: ${e?.message || e}`);
  }

  if (getStellarNetworkName() === 'PUBLIC' && fallbackBrlPerUsdc && fallbackBrlPerUsdc > 0) {
    logger.warn('[pagfinance] using PAGFINANCE_FALLBACK_BRL_PER_USDC — on-chain path unavailable');
    return {
      ok: true,
      usdcGross: amountBrl / fallbackBrlPerUsdc,
      brlPerUsdc: fallbackBrlPerUsdc,
      source: 'fallback_env',
    };
  }
  return { ok: false, error: 'BRL→USDC rate unavailable. Try again in a moment.' };
}

function handleError(res: Response, error: unknown, where: string): Response {
  if (error instanceof PagfinanceApiError) {
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        code: 'rate_limited',
        message: 'Aguarde um instante antes de tentar novamente.',
        retry_after_ms: (error.retryAfter ?? 5) * 1000,
      });
    }
    const status = error.status >= 500 ? 502 : error.status;
    logger.warn(`[pagfinance] ${where}: upstream ${error.status} ${error.code}`);
    return res.status(status).json({
      success: false,
      code: error.code || 'pagfinance_error',
      message: 'Não foi possível completar a operação PIX agora.',
    });
  }
  logger.error(`[pagfinance] ${where}: ${error instanceof Error ? error.message : String(error)}`);
  return res.status(500).json({ success: false, code: 'internal_error', message: 'Erro interno.' });
}

async function findOperationByIntentId(sessionId: string, intentId: string): Promise<any | null> {
  const { data } = await supabase
    .from('operations')
    .select('*')
    .eq('type', 'PIX_ONRAMP')
    .eq('source_session_id', sessionId)
    .like('context', `%"pagfinance_intent_id":"${intentId}"%`)
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

function parseContext(operation: any): Record<string, any> {
  try {
    return JSON.parse(String(operation?.context || '{}'));
  } catch {
    return {};
  }
}

export class PagfinanceController {
  /** Provider switch for the frontend: is PagFinance the active Pix cash-in? */
  static async getCashinConfig(req: Request, res: Response) {
    try {
      const service = getPagfinanceService();
      const config = service.settings;
      const base = {
        success: true,
        provider: 'pagfinance',
        available: service.enabled,
        network: getStellarNetworkName(),
        min_brl_amount: config.minBrlAmount,
        max_brl_amount: config.maxBrlAmount,
      };

      const input = requestInput(req);
      if (service.enabled && str(input.session_id) && str(input.session_token)) {
        const auth = await resolveSession(input);
        if (auth.ok) {
          const stored = await readCustomerData(auth.ctx.sessionId);
          return res.json({ ...base, needs_customer_data: !(stored.cpf && stored.name) });
        }
      }
      return res.json({ ...base, needs_customer_data: true });
    } catch (error) {
      return handleError(res, error, 'getCashinConfig');
    }
  }

  /** Advisory preview of the BRL→USDC conversion using OUR locked-rate logic. */
  static async createCashinQuote(req: Request, res: Response) {
    try {
      const service = getPagfinanceService();
      if (!service.enabled) {
        return res.status(503).json({ success: false, code: 'pagfinance_unavailable', message: 'PIX indisponível no momento.' });
      }
      const input = requestInput(req);
      const auth = await resolveSession(input);
      if (!auth.ok) return res.status(auth.status).json({ success: false, code: auth.code, message: auth.message });

      const config = service.settings;
      const amountBrl = Number(input.amount_brl ?? input.amount ?? 0);
      if (!Number.isFinite(amountBrl) || amountBrl < config.minBrlAmount || amountBrl > config.maxBrlAmount) {
        return res.status(400).json({
          success: false,
          code: 'invalid_amount',
          message: `Informe um valor entre R$ ${config.minBrlAmount} e R$ ${config.maxBrlAmount}.`,
        });
      }

      const rate = await resolveRate(amountBrl, config.fallbackBrlPerUsdc);
      if (!rate.ok) {
        return res.status(503).json({ success: false, code: 'rate_unavailable', message: rate.error });
      }
      const fee = PlatformFeeService.calculateSpread({
        sourceAmount: rate.usdcGross,
        sourceAssetCode: 'USDC',
        destinationAssetCode: 'BRL',
        mode: 'deduct_from_source',
      });
      const usdcFee = fee.enabled ? Number(fee.feeAmount) : 0;
      const usdcNet = fee.enabled ? Number(fee.netSourceAmount) : rate.usdcGross;

      return res.json({
        success: true,
        amount_brl: amountBrl,
        usdc_estimate: {
          gross: round7(rate.usdcGross),
          fee: round7(usdcFee),
          net: round7(usdcNet),
          brl_per_usdc: rate.brlPerUsdc,
          rate_source: rate.source,
        },
      });
    } catch (error) {
      return handleError(res, error, 'createCashinQuote');
    }
  }

  static async createCashinIntent(req: Request, res: Response) {
    try {
      const service = getPagfinanceService();
      if (!service.enabled) {
        return res.status(503).json({ success: false, code: 'pagfinance_unavailable', message: 'PIX indisponível no momento.' });
      }
      const input = requestInput(req);
      const auth = await resolveSession(input);
      if (!auth.ok) return res.status(auth.status).json({ success: false, code: auth.code, message: auth.message });
      const ctx = auth.ctx;
      const config = service.settings;

      const amountBrl = Number(input.amount_brl ?? input.amount ?? 0);
      if (!Number.isFinite(amountBrl) || amountBrl < config.minBrlAmount || amountBrl > config.maxBrlAmount) {
        return res.status(400).json({
          success: false,
          code: 'invalid_amount',
          message: `Informe um valor entre R$ ${config.minBrlAmount} e R$ ${config.maxBrlAmount}.`,
        });
      }

      const stored = await readCustomerData(ctx.sessionId);
      const customerName = str(input.customer_name) || stored.name || '';
      const customerCpf = digits(input.customer_tax_id ?? input.customer_cpf) || stored.cpf || '';
      if (!customerName || !customerCpf) {
        return res.status(422).json({
          success: false,
          code: 'needs_customer_data',
          needs_customer_data: true,
          message: 'Nome completo e CPF são necessários para gerar o PIX.',
        });
      }
      if (!isValidCpf(customerCpf)) {
        return res.status(400).json({ success: false, code: 'invalid_tax_id', message: 'CPF inválido.' });
      }
      if (!stored.cpf) {
        const saved = await saveCustomerData({
          sessionId: ctx.sessionId,
          userId: ctx.userId,
          name: customerName,
          cpf: customerCpf,
        });
        if (!saved.ok && saved.conflict) {
          return res.status(409).json({ success: false, code: 'cpf_conflict', message: saved.error });
        }
      }

      const rate = await resolveRate(amountBrl, config.fallbackBrlPerUsdc);
      if (!rate.ok) {
        return res.status(503).json({ success: false, code: 'rate_unavailable', message: rate.error });
      }
      const fee = PlatformFeeService.calculateSpread({
        sourceAmount: rate.usdcGross,
        sourceAssetCode: 'USDC',
        destinationAssetCode: 'BRL',
        mode: 'deduct_from_source',
      });
      const usdcFee = fee.enabled ? Number(fee.feeAmount) : 0;
      const usdcNet = fee.enabled ? Number(fee.netSourceAmount) : rate.usdcGross;

      await service.ensureUser(ctx.publicKey, { name: customerName, ...(ctx.email ? { email: ctx.email } : {}) });

      const idempotencyKey = PagfinanceClient.idempotencyKey('pgf');
      const intent = await service.createIntent(
        ctx.publicKey,
        {
          amount: amountBrl,
          customer: {
            name: customerName,
            taxID: customerCpf,
            ...(ctx.email ? { email: ctx.email } : {}),
          },
          expiresIn: config.intentExpiresInSeconds,
          comment: 'TalkToStellar PIX deposit',
        },
        idempotencyKey,
      );

      const nowIso = new Date().toISOString();
      const expiresInSeconds = intent.expiresIn ?? config.intentExpiresInSeconds;
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
      const context = {
        provider: 'pagfinance',
        rail: 'pix',
        direction: 'onramp',
        intent_id: intent.intentId,
        anchor_order_id: intent.intentId,
        pagfinance_intent_id: intent.intentId,
        correlation_id: intent.correlationID ?? intent.intentId,
        value_cents: intent.valueCents ?? Math.round(amountBrl * 100),
        source_amount_brl: amountBrl,
        final_asset_code: 'USDC',
        usdc_gross: round7(rate.usdcGross),
        usdc_fee: round7(usdcFee),
        usdc_net: round7(usdcNet),
        brl_per_usdc: rate.brlPerUsdc,
        rate_source: rate.source,
        rate_locked_at: nowIso,
        pagfinance_crypto_estimate: intent.cryptoEstimate ?? null,
        br_code: intent.brCode,
        qr_code_image: intent.qrCodeImage ?? null,
        payment_link_url: intent.paymentLinkUrl ?? null,
        expires_at: expiresAt,
        external_provider: str(input.provider) || undefined,
        external_provider_user_id: str(input.provider_user_id) || undefined,
        language: ctx.language || str(input.lang) || 'pt',
        idempotency_key: idempotencyKey,
      };

      const operation = await OperationRepository.create({
        user_id: ctx.userId,
        type: 'PIX_ONRAMP',
        status: 'PENDING',
        amount: amountBrl,
        asset_code: 'USDC',
        source_session_id: ctx.sessionId,
        source_public_key: ctx.publicKey,
        context: JSON.stringify(context),
      } as any);

      return res.status(201).json({
        success: true,
        operation_id: operation.id,
        intent_id: intent.intentId,
        status: intent.status ?? 'ACTIVE',
        amount_brl: amountBrl,
        value_cents: context.value_cents,
        br_code: intent.brCode,
        qr_code_image: intent.qrCodeImage ?? null,
        payment_link_url: intent.paymentLinkUrl ?? null,
        expires_in: expiresInSeconds,
        expires_at: expiresAt,
        usdc_estimate: {
          gross: context.usdc_gross,
          fee: context.usdc_fee,
          net: context.usdc_net,
          brl_per_usdc: rate.brlPerUsdc,
          rate_source: rate.source,
        },
      });
    } catch (error) {
      return handleError(res, error, 'createCashinIntent');
    }
  }

  static async getCashinIntent(req: Request, res: Response) {
    try {
      const service = getPagfinanceService();
      if (!service.enabled) {
        return res.status(503).json({ success: false, code: 'pagfinance_unavailable', message: 'PIX indisponível no momento.' });
      }
      const input = requestInput(req);
      const auth = await resolveSession(input);
      if (!auth.ok) return res.status(auth.status).json({ success: false, code: auth.code, message: auth.message });

      const intentId = str(input.intentId ?? input.intent_id);
      if (!INTENT_ID_SAFE.test(intentId)) {
        return res.status(400).json({ success: false, code: 'invalid_intent_id', message: 'Identificador inválido.' });
      }

      const operation = await findOperationByIntentId(auth.ctx.sessionId, intentId);
      if (!operation) {
        return res.status(404).json({ success: false, code: 'not_found', message: 'Depósito não encontrado.' });
      }
      const context = parseContext(operation);

      let remote: Awaited<ReturnType<typeof service.getIntent>> | null = null;
      try {
        remote = await service.getIntent(auth.ctx.publicKey, intentId);
      } catch (e: any) {
        logger.warn(`[pagfinance] remote intent poll failed for ${intentId}: ${e?.message || e}`);
      }

      let localStatus = String(operation.status || 'PENDING');
      const remoteCompleted = remote?.status === 'COMPLETED';
      const pastExpiry = context.expires_at && Date.parse(context.expires_at) < Date.now();
      if (localStatus === 'PENDING' && !remoteCompleted && (remote?.status === 'EXPIRED' || pastExpiry)) {
        await OperationRepository.update(operation.id, {
          status: 'FAILED',
          context: JSON.stringify({ ...context, failure_reason: 'expired' }),
        } as any);
        localStatus = 'FAILED';
        context.failure_reason = 'expired';
      }

      const status =
        localStatus === 'COMPLETED'
          ? 'COMPLETED'
          : localStatus === 'FAILED' || localStatus === 'CREDITING'
            ? context.failure_reason === 'expired'
              ? 'EXPIRED'
              : localStatus
            : remoteCompleted
              ? 'PAID_PENDING_CREDIT'
              : (remote?.status ?? 'ACTIVE');

      return res.json({
        success: true,
        operation_id: operation.id,
        intent_id: intentId,
        status,
        local_status: localStatus,
        remote_status: remote?.status ?? null,
        amount_brl: Number(operation.amount ?? context.source_amount_brl ?? 0),
        br_code: context.br_code ?? null,
        qr_code_image: context.qr_code_image ?? null,
        payment_link_url: context.payment_link_url ?? null,
        expires_at: context.expires_at ?? null,
        stellar_transaction_hash: operation.stellar_transaction_hash ?? null,
        usdc_estimate: {
          gross: context.usdc_gross ?? null,
          fee: context.usdc_fee ?? null,
          net: context.usdc_net ?? null,
          brl_per_usdc: context.brl_per_usdc ?? null,
          rate_source: context.rate_source ?? null,
        },
      });
    } catch (error) {
      return handleError(res, error, 'getCashinIntent');
    }
  }

  static async listCashinIntents(req: Request, res: Response) {
    try {
      const service = getPagfinanceService();
      if (!service.enabled) {
        return res.status(503).json({ success: false, code: 'pagfinance_unavailable', message: 'PIX indisponível no momento.' });
      }
      const input = requestInput(req);
      const auth = await resolveSession(input);
      if (!auth.ok) return res.status(auth.status).json({ success: false, code: auth.code, message: auth.message });

      const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
      const { data } = await supabase
        .from('operations')
        .select('*')
        .eq('type', 'PIX_ONRAMP')
        .eq('source_session_id', auth.ctx.sessionId)
        .like('context', '%"provider":"pagfinance"%')
        .order('created_at', { ascending: false })
        .limit(limit);

      const items = (data || []).map((operation: any) => {
        const context = parseContext(operation);
        return {
          operation_id: operation.id,
          intent_id: context.pagfinance_intent_id ?? null,
          status: operation.status,
          amount_brl: Number(operation.amount ?? context.source_amount_brl ?? 0),
          usdc_net: context.usdc_net ?? null,
          stellar_transaction_hash: operation.stellar_transaction_hash ?? null,
          created_at: operation.created_at,
        };
      });
      return res.json({ success: true, items, count: items.length });
    } catch (error) {
      return handleError(res, error, 'listCashinIntents');
    }
  }
}
