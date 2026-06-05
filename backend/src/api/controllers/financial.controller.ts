import { Request, Response } from 'express';
import { ActivityFeedService } from '../services/activity-feed.service';
import { FinancialInsightsService } from '../services/financial-insights.service';
import { SmartContactsService } from '../services/smart-contacts.service';
import { PaymentReplayService } from '../services/payment-replay.service';
import { EconomyEngineService } from '../services/economy-engine.service';
import { InvoiceService } from '../services/invoice.service';
import { GlobalProfileService } from '../services/global-profile.service';
import { TransactionHistoryService } from '../services/transaction-history.service';
import { FinancialContextService } from '../services/financial-context.service';
import { StellarService } from '../services/stellar.service';
import { AgentRepository } from '../repository/core/agent.repository';
import { supabase } from '../../config/supabase';
import ExternalService from '../services/core/external.service';
import { getAssetIssuer, normalizeAssetCode, resolveConfiguredAsset } from '../../config/assets';
import { isSessionExpired } from '../../utils/session-expiry';
import { DEFAULT_NETWORK_FEE_XLM, buildUnifiedFeeDisplay, formatNetworkFeeForCustomer } from '../../utils/fee-display';
import { PlatformFeeService } from '../services/platform-fee.service';
import { BrlReferenceRateService } from '../services/brl-reference-rate.service';
import { timingSafeEqualString } from '../../utils/password';
import { publicErrorMessage } from '../../utils/public-error';
import { mainnetWalletService } from '../services/mainnet-wallet.service';
import { attachQuoteExpiry, quoteTtlSeconds } from '../services/quote-expiry.service';
import { UserResearchEvidenceService } from '../services/user-research-log.service';
import { ConversionRateMatrixService } from '../services/conversion-rate-matrix.service';

const agentRepo = new AgentRepository(supabase);
const externalService = new ExternalService(supabase as any);

function toPositiveNumber(value: unknown, fallback = 0): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sessionAndUser(req: Request): { sessionId?: string; userId?: string } {
  return {
    sessionId: String(
      req.body?.session_id ||
        req.query?.session_id ||
        req.params?.session_id ||
        req.headers['x-session-id'] ||
        req.headers['x-talktostellar-session-id'] ||
        ''
    ).trim() || undefined,
    userId: String(req.body?.user_id || req.query?.user_id || '').trim() || undefined,
  };
}

function sessionTokenFromRequest(req: Request): string {
  const auth = String(req.headers.authorization || '').trim();
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  return String(
    req.body?.session_token ||
      req.body?.sessionToken ||
      req.headers['x-session-token'] ||
      bearer ||
      ''
  ).trim();
}

function formatConversionRouteChain(input: {
  sourceAssetCode?: string;
  destinationAssetCode?: string;
  path?: Array<{ code?: string; asset_code?: string; type?: string; asset_type?: string }>;
}): string {
  const source = String(input.sourceAssetCode || '').trim().toUpperCase();
  const destination = String(input.destinationAssetCode || '').trim().toUpperCase();
  const hops = Array.isArray(input.path)
    ? input.path
      .map((item) => String(item?.code || item?.asset_code || '').trim().toUpperCase())
      .filter(Boolean)
    : [];
  const chain = [source, ...hops, destination].filter(Boolean);
  return chain.filter((asset, index) => index === 0 || asset !== chain[index - 1]).join(' -> ');
}

async function requireSessionAuth(req: Request, res: Response): Promise<{ sessionId: string; userId: string; session: any } | null> {
  const { sessionId } = sessionAndUser(req);
  const sessionToken = sessionTokenFromRequest(req);

  if (!sessionId || !sessionToken) {
    res.status(401).json({ success: false, message: 'Sessão inválida. Faça login novamente.' });
    return null;
  }

  const session = await agentRepo.getSession(sessionId);
  const userId = String((session as any)?.user_id || '').trim();
  const storedToken = String((session as any)?.session_token || '').trim();

  if (!session || !userId || isSessionExpired(session) || !storedToken || !timingSafeEqualString(storedToken, sessionToken)) {
    res.status(401).json({ success: false, message: 'Sessão inválida. Faça login novamente.' });
    return null;
  }

  return { sessionId, userId, session };
}

export class FinancialController {
  private static async buildConversionPreviewPayload(req: Request, includeEstimatedSpreadWhenTreasuryDisabled: boolean) {
    const rawAmount = String(req.query?.brl_amount || req.body?.brl_amount || req.query?.amount || req.body?.amount || '1000')
      .replace(',', '.')
      .trim();
    const brlAmount = Math.max(0, toPositiveNumber(rawAmount, 1000));
    let grossQuote: any = null;
    try {
      grossQuote = await BrlReferenceRateService.quoteBrlToUsdc(brlAmount.toFixed(7));
    } catch (error: any) {
      throw new Error(error?.message || String(error || 'BRL/USDC quote unavailable'));
    }
    const rawBrlPerUsdc = toPositiveNumber(grossQuote?.brlPerUsdc, 0);
    if (rawBrlPerUsdc <= 0) {
      throw new Error('Cotação BRL/USDC indisponível no momento.');
    }
    const brlPerUsdc = rawBrlPerUsdc;
    const usdcPerBrl = brlPerUsdc > 0 ? 1 / brlPerUsdc : 0;
    const grossUsdc = toPositiveNumber(grossQuote.destinationAmount, 0);

    const spread = PlatformFeeService.calculateSpread({
      sourceAmount: brlAmount.toFixed(7),
      sourceAssetCode: 'BRL',
      destinationAssetCode: 'USDC',
      mode: 'deduct_from_source',
    });

    const spreadEstimateBrl = toPositiveNumber(spread.feeAmount, 0);
    const spreadBrl = includeEstimatedSpreadWhenTreasuryDisabled
      ? spreadEstimateBrl
      : (spread.enabled ? spreadEstimateBrl : 0);
    const netBrl = Math.max(0, brlAmount - spreadBrl);
    const spreadUsdc = spreadBrl * usdcPerBrl;
    let receiveQuote: any = null;
    if (netBrl > 0) {
      try {
        receiveQuote = await BrlReferenceRateService.quoteBrlToUsdc(netBrl.toFixed(7));
      } catch {
        receiveQuote = null;
      }
    }
    const receiveUsdc = receiveQuote ? toPositiveNumber(receiveQuote.destinationAmount, 0) : netBrl * usdcPerBrl;

    const networkFee = await formatNetworkFeeForCustomer(DEFAULT_NETWORK_FEE_XLM);
    const networkFeeBrl = toPositiveNumber(networkFee.fee_brl, 0);
    const networkFeeUsdc = toPositiveNumber(networkFee.fee_usdc, 0);

    const totalFeeBrl = spreadBrl + networkFeeBrl;
    const totalFeeUsdc = spreadUsdc + networkFeeUsdc;
    const totalFeePct = brlAmount > 0 ? (totalFeeBrl / brlAmount) * 100 : 0;

    const traditionalFeePct = Math.max(0, EconomyEngineService.traditionalFeePct() * 100);
    const traditionalFeeBrl = brlAmount * (traditionalFeePct / 100);
    const savingsBrl = Math.max(0, traditionalFeeBrl - totalFeeBrl);

    return {
      success: true,
      input: {
        brl_amount: Number(brlAmount.toFixed(2)),
      },
      quote: {
        brl_per_usdc: Number(brlPerUsdc.toFixed(6)),
        usdc_per_brl: Number(usdcPerBrl.toFixed(6)),
        source: grossQuote.source,
        symbol: grossQuote?.symbol || 'USDC/BRL',
        path: grossQuote?.path || [],
        source_asset: grossQuote?.sourceAsset || { code: 'TESOURO', issuer: getAssetIssuer('TESOURO') },
        destination_asset: grossQuote?.destinationAsset || { code: 'USDC', issuer: getAssetIssuer('USDC') },
      },
      output: {
        gross_receive_usdc: Number(grossUsdc.toFixed(4)),
        receive_usdc: Number(receiveUsdc.toFixed(4)),
      },
      fees: {
        talktostellar_spread_brl: Number(spreadBrl.toFixed(6)),
        talktostellar_spread_usdc: Number(spreadUsdc.toFixed(6)),
        network_fee_brl: Number(networkFeeBrl.toFixed(8)),
        network_fee_usdc: Number(networkFeeUsdc.toFixed(8)),
        total_fee_brl: Number(totalFeeBrl.toFixed(8)),
        total_fee_usdc: Number(totalFeeUsdc.toFixed(8)),
        total_fee_pct: Number(totalFeePct.toFixed(6)),
        spread_bps_config: spread.feeBps,
        spread_min_brl_config: toPositiveNumber(process.env.TALKTOSTELLAR_SPREAD_MIN_BRL, 0.05),
        spread_min_usdc_config: toPositiveNumber(process.env.TALKTOSTELLAR_SPREAD_MIN_USDC, 0.01),
        spread_collection_active: Boolean(spread.enabled),
        spread_estimated_brl: Number(spreadEstimateBrl.toFixed(6)),
        network_fee_display: networkFee.display,
      },
      comparison: {
        traditional_fee_pct: Number(traditionalFeePct.toFixed(4)),
        traditional_fee_brl: Number(traditionalFeeBrl.toFixed(6)),
        savings_brl: Number(savingsBrl.toFixed(6)),
      },
    };
  }

  static async getConversionPreview(req: Request, res: Response) {
    try {
      return res.status(200).json(
        await FinancialController.buildConversionPreviewPayload(req, false)
      );
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getConversionFeesPreview(req: Request, res: Response) {
    try {
      return res.status(200).json(
        await FinancialController.buildConversionPreviewPayload(req, true)
      );
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getUsdcToBrlPreview(req: Request, res: Response) {
    try {
      const rawAmount = String(req.query?.usdc_amount || req.body?.usdc_amount || req.query?.amount || req.body?.amount || '1')
        .replace(',', '.')
        .trim();
      const usdcAmount = Math.max(0, toPositiveNumber(rawAmount, 1));
      let grossQuote: any = null;
      try {
        grossQuote = await BrlReferenceRateService.quoteUsdcToBrl(usdcAmount.toFixed(7));
      } catch (error: any) {
        throw new Error(error?.message || String(error || 'BRL/USDC quote unavailable'));
      }
      const rawBrlPerUsdc = toPositiveNumber(grossQuote?.brlPerUsdc, 0);
      if (rawBrlPerUsdc <= 0) {
        throw new Error('Cotação BRL/USDC indisponível no momento.');
      }
      const brlPerUsdc = rawBrlPerUsdc;
      const estimatedBrl = toPositiveNumber(grossQuote?.destinationAmount, usdcAmount * brlPerUsdc);

      const spread = PlatformFeeService.calculateSpread({
        sourceAmount: estimatedBrl.toFixed(7),
        sourceAssetCode: 'BRL',
        destinationAssetCode: 'USDC',
        mode: 'deduct_from_source',
      });
      const spreadBrl = spread.enabled ? toPositiveNumber(spread.feeAmount, 0) : 0;
      const networkFee = await formatNetworkFeeForCustomer(DEFAULT_NETWORK_FEE_XLM);
      const networkFeeBrl = toPositiveNumber(networkFee.fee_brl, 0);
      const totalFeeBrl = spreadBrl + networkFeeBrl;
      const requiredBrl = estimatedBrl + totalFeeBrl;

      return res.status(200).json({
        success: true,
        input: {
          usdc_amount: Number(usdcAmount.toFixed(7)),
        },
        quote: {
          brl_per_usdc: Number(brlPerUsdc.toFixed(6)),
          usdc_per_brl: Number((brlPerUsdc > 0 ? 1 / brlPerUsdc : 0).toFixed(8)),
          source: grossQuote.source,
          symbol: grossQuote?.symbol || 'USDC/BRL',
          path: grossQuote?.path || [],
          source_asset: grossQuote?.sourceAsset || { code: 'USDC', issuer: getAssetIssuer('USDC') },
          destination_asset: grossQuote?.destinationAsset || { code: 'TESOURO', issuer: getAssetIssuer('TESOURO') },
        },
        output: {
          estimated_brl: Number(estimatedBrl.toFixed(2)),
          required_brl: Number(requiredBrl.toFixed(2)),
        },
        fees: {
          talktostellar_spread_brl: Number(spreadBrl.toFixed(6)),
          network_fee_brl: Number(networkFeeBrl.toFixed(8)),
          total_fee_brl: Number(totalFeeBrl.toFixed(8)),
          network_fee_display: networkFee.display,
        },
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getConversionRateMatrix(req: Request, res: Response) {
    try {
      const assets = String(req.query?.assets || req.body?.assets || '')
        .split(/[,\s]+/g)
        .map((asset) => asset.trim())
        .filter(Boolean);
      const sampleAmount = req.query?.sample_amount || req.query?.sampleAmount || req.body?.sample_amount || req.body?.sampleAmount;
      const payload = await ConversionRateMatrixService.buildMatrix({
        assets: assets.length ? assets : undefined,
        sampleAmount: sampleAmount as any,
      });
      return res.status(200).json(payload);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: publicErrorMessage(error, 'Não consegui carregar as taxas de conversão agora. Tente novamente em alguns segundos.'),
      });
    }
  }

  static async getActivityFeed(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const data = await ActivityFeedService.listFeed({
        sessionId: auth.sessionId,
        userId: auth.userId,
        limit: Number(req.query.limit || req.body?.limit || 40),
      });
      return res.status(200).json({ success: true, feed: data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getInsights(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const insights = await FinancialInsightsService.listLatestInsights({
        sessionId: auth.sessionId,
        userId: auth.userId,
        limit: Number(req.query.limit || req.body?.limit || 8),
      });
      return res.status(200).json({ success: true, insights });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getSmartContacts(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const contacts = await SmartContactsService.listSmartContacts({
        sessionId: auth.sessionId,
        userId: auth.userId,
        limit: Number(req.query.limit || req.body?.limit || 30),
      });
      return res.status(200).json({ success: true, contacts });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getReplayCandidate(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const replay = await PaymentReplayService.findReplayCandidate({
        sessionId: auth.sessionId,
        userId: auth.userId,
        queryContext: String(req.body?.query_context || req.query?.query_context || ''),
      });
      return res.status(200).json({ success: true, replay });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getSavings(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const savings = await EconomyEngineService.calculateMonthly({ sessionId: auth.sessionId, userId: auth.userId });
      return res.status(200).json({ success: true, ...savings });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async trackUserResearchEvent(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;

      const session = auth.session || {};
      const result = await UserResearchEvidenceService.track({
        sessionId: auth.sessionId,
        userId: auth.userId,
        email: String((session as any)?.email || req.body?.email || '').trim(),
        channel: req.body?.channel || req.body?.source || req.body?.from || req.body?.origin || (session as any)?.session_source,
        eventName: String(req.body?.event_name || req.body?.eventName || '').trim(),
        eventGroup: String(req.body?.event_group || req.body?.eventGroup || '').trim(),
        taskLabel: String(req.body?.task_label || req.body?.taskLabel || '').trim(),
        status: String(req.body?.status || 'observed').trim(),
        feedbackText: String(req.body?.feedback_text || req.body?.feedbackText || '').trim(),
        evidenceUrl: String(req.body?.evidence_url || req.body?.evidenceUrl || '').trim(),
        evidenceType: String(req.body?.evidence_type || req.body?.evidenceType || '').trim(),
        pageUrl: String(req.body?.page_url || req.body?.pageUrl || '').trim(),
        route: String(req.body?.route || '').trim(),
        operationId: String(req.body?.operation_id || req.body?.operationId || '').trim(),
        transactionHash: String(req.body?.transaction_hash || req.body?.transactionHash || '').trim(),
        stellarNetwork: String(
          req.body?.stellar_network ||
            req.body?.stellarNetwork ||
            (session as any)?.stellar_network ||
            process.env.STELLAR_NETWORK ||
            ''
        ).trim(),
        metadata: req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {},
        dedupeKey: String(req.body?.dedupe_key || req.body?.dedupeKey || '').trim(),
      });
      return res.status(201).json(result);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: publicErrorMessage(error, 'Não consegui registrar essa evidência agora.'),
      });
    }
  }

  static async createConversionConfirmation(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;

      const sourceAmount = String(req.body?.source_amount || req.body?.sourceAmount || req.body?.amount || '')
        .replace(',', '.')
        .trim();
      const sourceAmountNumber = toPositiveNumber(sourceAmount, 0);
      const destAmountRaw = String(req.body?.dest_amount || req.body?.destAmount || '').replace(',', '.').trim();
      const destAmountNumber = toPositiveNumber(destAmountRaw, 0);
      if (sourceAmountNumber <= 0 && destAmountNumber <= 0) {
        return res.status(400).json({ success: false, message: 'Informe um valor válido para converter.' });
      }

      const sourceAssetCode = normalizeAssetCode(req.body?.source_asset_code || req.body?.sourceAssetCode || 'USDC');
      const destAssetCode = normalizeAssetCode(req.body?.dest_asset_code || req.body?.destAssetCode || req.body?.destination_asset_code || 'BRL');
      if (sourceAssetCode === destAssetCode) {
        return res.status(400).json({ success: false, message: 'Escolha moedas diferentes para converter.' });
      }

      const context = await FinancialContextService.resolve({ sessionId: auth.sessionId, userId: auth.userId });
      const sourcePublicKey = String((auth.session as any)?.public_key || context.walletPublicKey || '').trim();
      if (!sourcePublicKey) {
        return res.status(400).json({ success: false, message: 'Conta sem carteira ativa para conversão.' });
      }

      const sourceAsset = resolveConfiguredAsset(sourceAssetCode, req.body?.source_asset_issuer || req.body?.sourceAssetIssuer);
      const destAsset = resolveConfiguredAsset(destAssetCode, req.body?.dest_asset_issuer || req.body?.destAssetIssuer || req.body?.destination_asset_issuer);
      const useStrictReceive = destAmountNumber > 0 && sourceAmountNumber <= 0;

      const quote = useStrictReceive
        ? await StellarService.quotePathPayment({
            sourcePublicKey,
            destination: sourcePublicKey,
            sourceAsset,
            destAsset,
            destAmount: destAmountRaw,
          })
        : await StellarService.quoteStrictSendConversion({
            sourcePublicKey,
            destination: sourcePublicKey,
            sourceAmount,
            sourceAsset,
            destAsset,
          });

      const effectiveSourceAmount = useStrictReceive ? quote.sourceAmount : sourceAmount;

      const networkFee = await formatNetworkFeeForCustomer(quote.networkFeeXlm || DEFAULT_NETWORK_FEE_XLM);
      const unifiedFee = buildUnifiedFeeDisplay({
        networkFee,
        platformFeeAmount: quote.platformFee?.feeAmount || null,
        platformFeeAssetCode: quote.platformFee?.feeAssetCode || null,
        sourceAssetCode: quote.sourceAsset?.code || sourceAsset.code,
        destinationAssetCode: quote.destinationAsset?.code || destAsset.code,
      });
      const quoteWithExpiry = attachQuoteExpiry({
        ...quote,
        fee_display: unifiedFee.display,
        fee_usdc: unifiedFee.fee_usdc,
        fee_brl: unifiedFee.fee_brl,
      });
      const routeChain = formatConversionRouteChain({
        sourceAssetCode: quote.sourceAsset?.code || sourceAsset.code,
        destinationAssetCode: quote.destinationAsset?.code || destAsset.code,
        path: quote.path || [],
      });

      const { token, url } = await externalService.createConversionConfirmUrlWithContext({
        session_id: auth.sessionId,
        owner_id: auth.userId,
        source_amount: effectiveSourceAmount,
        source_asset_code: sourceAsset.code,
        source_asset_issuer: sourceAsset.issuer,
        dest_amount: String(quote.destinationAmount || ''),
        dest_asset_code: destAsset.code,
        dest_asset_issuer: destAsset.issuer,
        quote: quoteWithExpiry,
        conversion_mode: useStrictReceive ? 'strict_receive' : 'strict_send',
      }, {
        conversion_mode: useStrictReceive ? 'strict_receive' : 'strict_send',
        return_to: String(req.body?.return_to || req.body?.returnTo || '').trim() || null,
        return_source: String(req.body?.return_source || req.body?.returnSource || req.body?.from || req.body?.origin || '').trim() || null,
        estimated_fee_display: unifiedFee.display,
        estimated_fee_usdc: unifiedFee.fee_usdc || null,
        estimated_fee_brl: unifiedFee.fee_brl || null,
        estimated_platform_fee: null,
        estimated_spread_fee: null,
        route_chain: routeChain || null,
        optimization_criteria: useStrictReceive
          ? 'melhor cotação disponível para o valor final informado'
          : 'melhor cotação disponível para o valor de envio informado',
        quote_issued_at: quoteWithExpiry.quote_issued_at || null,
        quote_expires_at: quoteWithExpiry.quote_expires_at || null,
        quote_ttl_seconds: quoteWithExpiry.quote_ttl_seconds || quoteTtlSeconds(),
        language: req.body?.language || req.body?.lang || null,
      });

      return res.status(200).json({
        success: true,
        token,
        url,
        quote: quoteWithExpiry,
        source_amount: effectiveSourceAmount,
        source_asset_code: sourceAsset.code,
        dest_amount: String(quote.destinationAmount || ''),
        dest_asset_code: destAsset.code,
        return_to: String(req.body?.return_to || req.body?.returnTo || '').trim() || null,
        return_source: String(req.body?.return_source || req.body?.returnSource || req.body?.from || req.body?.origin || '').trim() || null,
        estimated_fee_display: unifiedFee.display,
        route_chain: routeChain || null,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui preparar essa conversão agora. Tente novamente em alguns segundos.") });
    }
  }

  static async createInvoice(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const invoice = await InvoiceService.create({
        sessionId: auth.sessionId,
        userId: auth.userId,
        recipientName: String(req.body?.recipient_name || req.body?.recipient || ''),
        title: req.body?.title,
        description: req.body?.description,
        amount: String(req.body?.amount || ''),
        currency: String(req.body?.currency || 'USD'),
        dueDate: req.body?.due_date,
      });
      return res.status(201).json({ success: true, invoice });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async listInvoices(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const invoices = await InvoiceService.list({
        sessionId: auth.sessionId,
        userId: auth.userId,
        limit: Number(req.query.limit || req.body?.limit || 30),
      });
      return res.status(200).json({ success: true, invoices });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getOrCreateGlobalProfile(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const profile = await GlobalProfileService.getOrCreate({
        sessionId: auth.sessionId,
        userId: auth.userId,
        usernameHint: req.body?.username || req.query?.username,
        displayName: req.body?.display_name,
        bio: req.body?.bio,
      });
      return res.status(200).json({ success: true, profile });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getPublicGlobalProfile(req: Request, res: Response) {
    try {
      const username = String(req.params.username || '').trim();
      const profile = await GlobalProfileService.getPublicProfile(username);
      if (!profile) {
        return res.status(404).json({ success: false, message: 'Perfil não encontrado.' });
      }
      return res.status(200).json({ success: true, profile });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async createPublicGlobalProfilePayment(req: Request, res: Response) {
    try {
      const username = String(req.params.username || '').trim();
      const sessionId = String(req.body?.session_id || '').trim();
      const sessionToken = String(req.body?.session_token || '').trim();
      const amount = String(req.body?.amount || '').replace(',', '.').trim();
      const assetCode = normalizeAssetCode(req.body?.asset_code || 'USDC');
      const assetIssuer = getAssetIssuer(assetCode, req.body?.asset_issuer);
      const memo = String(req.body?.memo || '').replace(/\s+/g, ' ').trim().slice(0, 120);

      if (!username || !sessionId || !sessionToken || !amount) {
        return res.status(400).json({
          success: false,
          message: 'username, session_id, session_token e amount são obrigatórios.',
        });
      }

      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Informe um valor maior que zero.' });
      }

      if (assetCode !== 'XLM' && !assetIssuer) {
        return res.status(400).json({ success: false, message: `${assetCode}_ISSUER não está configurado no backend.` });
      }

      const session = await agentRepo.getSession(sessionId);
      if (!session?.user_id || isSessionExpired(session)) {
        return res.status(401).json({ success: false, message: 'Sessão inválida. Faça login novamente.' });
      }

      const storedToken = String((session as any)?.session_token || '').trim();
      if (!storedToken || !timingSafeEqualString(storedToken, sessionToken)) {
        return res.status(401).json({ success: false, message: 'Sessão inválida. Faça login novamente.' });
      }

      const profile = await GlobalProfileService.getPublicProfile(username);
      if (!profile) {
        return res.status(404).json({ success: false, message: 'Perfil não encontrado.' });
      }

      const destinationPublicKey = String((profile as any)?.destination_public_key || '').trim();
      if (!destinationPublicKey) {
        return res.status(400).json({
          success: false,
          message: 'Este perfil ainda não está pronto para receber pagamentos.',
        });
      }

      const destinationName = String(
        (profile as any)?.display_name ||
        (profile as any)?.username ||
        username
      ).trim();

      const { token, url } = await externalService.createPaymentConfirmUrl({
        amount,
        destination: destinationPublicKey,
        destination_name: destinationName,
        session_id: sessionId,
        owner_id: String(session.user_id),
        asset_code: assetCode,
        asset_issuer: assetIssuer,
      }, {
        source_amount: amount,
        source_asset_code: assetCode,
        source_asset_issuer: assetIssuer || null,
        destination_amount: amount,
        destination_asset_code: assetCode,
        destination_asset_issuer: assetIssuer || null,
        transaction_context_message: memo || `Pagamento para ${destinationName}`,
        memo: memo || `Pagamento para ${destinationName}`,
      });

      return res.status(201).json({
        success: true,
        token,
        url,
        message: `Link de confirmação gerado para pagar ${destinationName}.`,
      });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getTransactions(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const payload = await TransactionHistoryService.listTransactions({
        sessionId: auth.sessionId,
        userId: auth.userId,
        month: Number(req.query.month || req.body?.month || 0),
        year: Number(req.query.year || req.body?.year || 0),
        limit: Number(req.query.limit || req.body?.limit || 60),
      });
      return res.status(200).json({ success: true, ...payload });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getWalletProfile(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const publicKey = String(req.params.public_key || req.query.public_key || req.body?.public_key || '').trim();
      const payload = await TransactionHistoryService.getWalletProfile({
        sessionId: auth.sessionId,
        userId: auth.userId,
        publicKey,
      });
      return res.status(200).json({ success: true, ...payload });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: publicErrorMessage(error, "Não consegui carregar essa informação agora. Tente novamente em alguns segundos.") });
    }
  }

  static async getMainnetStatus(_req: Request, res: Response) {
    try {
      return res.status(200).json(mainnetWalletService.getStatus());
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Não consegui carregar a configuração Mainnet agora."),
      });
    }
  }

  static async getMainnetWallet(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const wallet = await mainnetWalletService.getPrimaryWallet(auth.sessionId, auth.userId);
      return res.status(200).json({
        success: true,
        wallet,
        configured: Boolean(wallet),
        message: wallet
          ? 'Carteira Mainnet configurada em modo somente leitura.'
          : 'Nenhuma carteira Mainnet foi anexada a esta conta ainda.',
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Não consegui carregar a carteira Mainnet agora."),
      });
    }
  }

  static async attachMainnetWallet(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const result = await mainnetWalletService.attachWallet({
        sessionId: auth.sessionId,
        userId: auth.userId,
        publicKey: String(req.body?.public_key || req.body?.publicKey || '').trim(),
        label: String(req.body?.label || '').trim() || undefined,
      });
      return res.status(200).json(result);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Não consegui configurar a carteira Mainnet agora."),
      });
    }
  }

  static async getMainnetBalance(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const payload = await mainnetWalletService.getBalance({
        sessionId: auth.sessionId,
        userId: auth.userId,
        publicKey: String(req.query.public_key || req.body?.public_key || '').trim() || undefined,
      });
      return res.status(200).json(payload);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Não consegui consultar o saldo Mainnet agora."),
      });
    }
  }

  static async getMainnetOperations(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const payload = await mainnetWalletService.listOperations({
        sessionId: auth.sessionId,
        userId: auth.userId,
        publicKey: String(req.query.public_key || req.body?.public_key || '').trim() || undefined,
        limit: Number(req.query.limit || req.body?.limit || 12),
      });
      return res.status(200).json(payload);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Não consegui consultar as operações Mainnet agora."),
      });
    }
  }

  static async previewMainnetPayment(req: Request, res: Response) {
    try {
      const auth = await requireSessionAuth(req, res);
      if (!auth) return;
      const payload = await mainnetWalletService.createPaymentPreview({
        sessionId: auth.sessionId,
        userId: auth.userId,
        destination: String(req.body?.destination || req.body?.destination_public_key || '').trim(),
        amount: String(req.body?.amount || '').trim(),
        assetCode: String(req.body?.asset_code || 'USDC').trim(),
        memo: String(req.body?.memo || '').trim(),
      });
      return res.status(200).json(payload);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: publicErrorMessage(error, "Não consegui preparar essa interação Mainnet agora."),
      });
    }
  }
}
