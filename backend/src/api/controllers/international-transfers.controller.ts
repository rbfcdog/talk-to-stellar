import { Request, Response } from 'express';
import crypto from 'crypto';
import { internationalTransferService } from '../services/international-transfer.service';
import { publicErrorMessage } from '../../utils/public-error';
import { timingSafeEqualString } from '../../utils/password';
import { logger } from '../../utils/logger';
import { applyApiRequestContext, readApiRequestContext, responseContext } from './request-context';
import { usdPayoutCoordinationService } from '../services/usd-payout-coordination.service';
import { orchestrator } from '../../orchestration/TransferOrchestrator';
import { transferRepository } from '../repository/transfer.repository';

function statusFromError(error: any): number {
  const explicit = Number(error?.status || error?.statusCode || 0);
  if (explicit >= 400 && explicit < 600) return explicit;
  const message = String(error?.message || error || '').toLowerCase();
  if (message.includes('not found')) return 404;
  if (message.includes('expired') || message.includes('invalid') || message.includes('required') || message.includes('missing')) return 400;
  return 500;
}

function errorBody(error: any) {
  return {
    success: false,
    ...(error?.code ? { code: error.code } : {}),
    ...(error?.details ? { details: error.details } : {}),
    message: publicErrorMessage(error, 'Não consegui atualizar a rota entre instituições agora. Tente novamente em alguns segundos.'),
  };
}

function errorBodyWithContext(error: any, context: ReturnType<typeof readApiRequestContext>) {
  return {
    ...errorBody(error),
    ...responseContext(context),
  };
}

function lifecycleLog(event: string, context: ReturnType<typeof readApiRequestContext>, details: Record<string, unknown> = {}) {
  logger.info(`[international_transfer] ${JSON.stringify({
    event,
    request_id: context.request_id,
    correlation_id: context.correlation_id,
    ...details,
  })}`);
}

function readBearerToken(req: Request): string {
  const auth = String(req.headers.authorization || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function hasInternalOpsAuthorization(req: Request): boolean {
  const expectedValues = [
    process.env.INTERNATIONAL_TRANSFER_OPS_SECRET,
    process.env.INTERNAL_API_SECRET,
    process.env.OPS_DASHBOARD_TOKEN,
    process.env.TRANSFER_API_TOKEN,
  ].map((value) => String(value || '').trim()).filter(Boolean);
  const provided = String(
    req.headers['x-international-transfer-ops-secret'] ||
      req.headers['x-internal-api-secret'] ||
      req.headers['x-ops-token'] ||
      req.headers['x-api-key'] ||
      readBearerToken(req) ||
      ''
  ).trim();
  return Boolean(provided && expectedValues.some((expected) => timingSafeEqualString(expected, provided)));
}

function requireInternalOpsAuthorization(req: Request, res: Response, context?: ReturnType<typeof readApiRequestContext>): boolean {
  if (hasInternalOpsAuthorization(req)) return true;
  res.status(403).json({
    success: false,
    ...(context ? responseContext(context) : {}),
    message: 'Internal transfer operation requires backend ops authorization.',
  });
  return false;
}

function readText(value: unknown): string {
  return String(value || '').trim();
}

function isStellarTxHash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function stellarExplorerUrl(hash: string, network: string): string {
  const explorerNetwork = network === 'mainnet' || network === 'public' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${explorerNetwork}/tx/${encodeURIComponent(hash)}`;
}

function shortHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function bankLast4(value: unknown): string | null {
  const raw = readText(value);
  return /^\d{4}$/.test(raw) ? raw : null;
}

function requirePayoutProviderAuthorization(
  req: Request,
  res: Response,
  provider: string,
  context: ReturnType<typeof readApiRequestContext>,
): boolean {
  const expected = usdPayoutCoordinationService.expectedWebhookSecret(provider);
  const provided = String(req.headers['x-payout-webhook-secret'] || readBearerToken(req) || '').trim();
  if (expected && provided && timingSafeEqualString(expected, provided)) return true;
  res.status(401).json({
    success: false,
    ...responseContext(context),
    message: 'Payout provider event authorization failed.',
  });
  return false;
}

export class InternationalTransfersController {
  static async listOrchestrationTransfers(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      if (!requireInternalOpsAuthorization(req, res, context)) return;
      const state = req.query.state ? String(req.query.state) : undefined;
      const limit = Math.min(Number(req.query.limit || 50) || 50, 200);
      const transfers = await transferRepository.list({ state, limit });
      const total = await transferRepository.count(state ? { state } : undefined);
      res.status(200).json({ success: true, ...responseContext(context), total, count: transfers.length, transfers });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async getPayoutProviders(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      const providers = internationalTransferService.getPayoutProviderCapabilities();
      res.status(200).json({ success: true, ...responseContext(context), providers });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async receivePayoutProviderEvent(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    const provider = String(req.params.provider || '').trim().toLowerCase();
    try {
      if (!requirePayoutProviderAuthorization(req, res, provider, context)) return;
      const transfer = await internationalTransferService.handlePayoutProviderEvent(provider, req.body || {});
      lifecycleLog('payout_provider_event_applied', context, {
        provider,
        transfer_id: transfer.transfer_id,
        status: transfer.status,
        payout_status: transfer.payout_status,
      });
      res.status(202).json({
        success: true,
        ...responseContext(context),
        payout_event: {
          accepted: true,
          transfer_id: transfer.transfer_id,
          transfer_status: transfer.status,
          payout_status: transfer.payout_status,
        },
      });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async createTransfer(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      const isNormalizedIntent = Boolean(req.body?.amount_brl_in || req.body?.amountBrlIn) && !req.body?.quote_id && !req.body?.quoteId;
      if (isNormalizedIntent) {
        if (!requireInternalOpsAuthorization(req, res, context)) return;
        const transfer = await orchestrator.createTransfer({
          amount_brl_in: String(req.body?.amount_brl_in || req.body?.amountBrlIn),
          source_endpoint: req.body?.source_endpoint || req.body?.sourceEndpoint || { institution_type: 'api', masked_identifier: 'api-client' },
          destination_endpoint: req.body?.destination_endpoint || req.body?.destinationEndpoint || { provider_type: 'usd_bank', country: 'US', masked_account: '****' },
          actor: 'api',
          correlation_id: context.correlation_id,
        });
        lifecycleLog('orchestration_transfer_created', context, {
          transfer_id: transfer.id,
          public_ref: transfer.public_ref,
          state: transfer.state,
        });
        res.status(201).json({ success: true, ...responseContext(context), transfer });
        return;
      }

      const transfer = await internationalTransferService.createTransfer({
        quote_id: String(req.body?.quote_id || req.body?.quoteId || ''),
        user_id: req.body?.user_id || req.body?.userId,
        institution_id: req.body?.institution_id || req.body?.institutionId,
        sender_identity: req.body?.sender_identity || req.body?.senderIdentity || {},
        recipient_identity: req.body?.recipient_identity || req.body?.recipientIdentity || {},
        payout_destination: req.body?.payout_destination || req.body?.payoutDestination,
        same_name_payout_required: req.body?.same_name_payout_required ?? req.body?.sameNamePayoutRequired,
        request_id: context.request_id,
        correlation_id: context.correlation_id,
      });
      lifecycleLog('transfer_created', context, { transfer_id: transfer.transfer_id, status: transfer.status });
      res.status(201).json({ success: true, ...responseContext(context), transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async createPixIntent(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      const requestedMock = req.body?.mock === true || req.body?.mock_pix_intent === true || req.body?.mockPixIntent === true;
      if (requestedMock && !requireInternalOpsAuthorization(req, res, context)) return;
      const transfer = await internationalTransferService.createPixIntent(String(req.params.id), {
        session_id: String(req.body?.session_id || req.body?.sessionId || ''),
        session_token: String(req.body?.session_token || req.body?.sessionToken || ''),
        email: req.body?.email,
        mock: requestedMock,
        request_id: context.request_id,
        correlation_id: context.correlation_id,
      });
      lifecycleLog('pix_intent_created', context, { transfer_id: transfer.transfer_id, status: transfer.status, pix_order_id: transfer.pix_order_id });
      res.status(201).json({ success: true, ...responseContext(context), transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async settleStellar(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      if (!requireInternalOpsAuthorization(req, res, context)) return;
      const transfer = await internationalTransferService.settleStellar(String(req.params.id), {
        request_id: context.request_id,
        correlation_id: context.correlation_id,
      });
      lifecycleLog('stellar_settlement_requested', context, { transfer_id: transfer.transfer_id, status: transfer.status, stellar_tx_hash: transfer.stellar_tx_hash });
      res.status(200).json({ success: true, ...responseContext(context), transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async confirmSandboxFunding(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      if (!requireInternalOpsAuthorization(req, res, context)) return;
      const transfer = await internationalTransferService.confirmSandboxFunding(String(req.params.id), {
        ...(req.body || {}),
        request_id: context.request_id,
        correlation_id: context.correlation_id,
      });
      lifecycleLog('funding_confirmation_requested', context, { transfer_id: transfer.transfer_id, status: transfer.status });
      res.status(200).json({ success: true, ...responseContext(context), transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async createPayoutInstruction(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      if (!requireInternalOpsAuthorization(req, res, context)) return;
      const transfer = await internationalTransferService.createPayoutInstruction(
        String(req.params.id),
        req.body?.provider || req.body?.payout_provider || req.body?.payoutProvider,
        {
          session_id: req.body?.session_id || req.body?.sessionId,
          session_token: req.body?.session_token || req.body?.sessionToken,
          wallet_pin: req.body?.wallet_pin || req.body?.walletPin || req.body?.pin,
          run_etherfuse_offramp_test: req.body?.run_etherfuse_offramp_test ?? req.body?.runEtherfuseOffRampTest,
          target_brl: req.body?.target_brl || req.body?.targetBrl,
          circle_destination_id: req.body?.circle_destination_id ||
            req.body?.circleDestinationId ||
            req.body?.provider_destination_id ||
            req.body?.providerDestinationId,
          circle_destination_type: req.body?.circle_destination_type ||
            req.body?.circleDestinationType ||
            req.body?.provider_destination_type ||
            req.body?.providerDestinationType,
          circle_source_wallet_id: req.body?.circle_source_wallet_id || req.body?.circleSourceWalletId,
          circle_idempotency_key: req.body?.circle_idempotency_key || req.body?.circleIdempotencyKey || req.body?.idempotency_key || req.body?.idempotencyKey,
          wire_test: req.body?.wire_test === true || String(req.body?.wire_test || '').trim() === 'true' || undefined,
          amount_usd: String(req.body?.amount_usd || req.body?.amountUsd || '').trim() || undefined,
          request_id: context.request_id,
          correlation_id: context.correlation_id,
        },
      );
      lifecycleLog('payout_instruction_requested', context, { transfer_id: transfer.transfer_id, status: transfer.status, payout_instruction_id: transfer.payout_instruction_id });
      res.status(201).json({ success: true, ...responseContext(context), transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async refreshPayoutStatus(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      if (!requireInternalOpsAuthorization(req, res, context)) return;
      const transfer = await internationalTransferService.refreshPayoutStatus(String(req.params.id), {
        request_id: context.request_id,
        correlation_id: context.correlation_id,
      });
      lifecycleLog('payout_status_refreshed', context, {
        transfer_id: transfer.transfer_id,
        status: transfer.status,
        payout_status: transfer.payout_status,
        payout_instruction_id: transfer.payout_instruction_id,
      });
      res.status(200).json({ success: true, ...responseContext(context), transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async getTransfer(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      if (!requireInternalOpsAuthorization(req, res, context)) return;
      try {
        const transfer = await internationalTransferService.getTransfer(String(req.params.id));
        res.status(200).json({ success: true, ...responseContext(context), transfer });
        return;
      } catch (error: any) {
        if (!String(error?.message || error).toLowerCase().includes('not found')) throw error;
      }
      const { transfer, events } = await orchestrator.getTransferWithEvents(String(req.params.id));
      res.status(200).json({ success: true, ...responseContext(context), transfer, events });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async getReconciliation(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      if (!requireInternalOpsAuthorization(req, res, context)) return;
      const reconciliation = await internationalTransferService.getReconciliation(String(req.params.id));
      res.status(200).json({ success: true, ...responseContext(context), reconciliation });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async getOrchestrationLog(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      const orchestration_log = await internationalTransferService.getOrchestrationLog(String(req.params.id));
      lifecycleLog('orchestration_log_read', context, {
        transfer_id: orchestration_log.transfer_id,
        status: orchestration_log.current_status,
        evidence_status: orchestration_log.evidence_status,
      });
      res.status(200).json({ success: true, ...responseContext(context), orchestration_log });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async getReviewerEvidence(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      const reviewer_evidence = await internationalTransferService.getReviewerEvidence(String(req.params.id));
      lifecycleLog('reviewer_evidence_read', context, {
        transfer_id: reviewer_evidence.transfer_id,
        ready_count: reviewer_evidence.submission.ready_count,
        required_count: reviewer_evidence.submission.required_count,
      });
      res.status(200).json({ success: true, ...responseContext(context), reviewer_evidence });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async getPayoutEvidence(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      const payout_evidence = await internationalTransferService.getPayoutEvidence(String(req.params.id));
      lifecycleLog('payout_evidence_read', context, {
        transfer_id: payout_evidence.transfer_id,
        ready: payout_evidence.ready,
        provider: payout_evidence.provider.provider_name,
      });
      res.status(200).json({ success: true, ...responseContext(context), payout_evidence });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async getWorkflow(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      const workflow = await internationalTransferService.getWorkflow(String(req.params.id));
      lifecycleLog('workflow_read', context, {
        transfer_id: workflow.transfer_id,
        current_state: workflow.current_state,
        next_action: workflow.next_action.code,
      });
      res.status(200).json({ success: true, ...responseContext(context), workflow });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBodyWithContext(error, context));
    }
  }

  static async sendWireTest(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      if (!requireInternalOpsAuthorization(req, res, context)) return;

      const apiKey = readText(process.env.CIRCLE_API_KEY);
      const destinationId = readText(
        req.body?.destination_id ||
        req.body?.destinationId ||
        process.env.CIRCLE_PAYOUT_DESTINATION_ID ||
        process.env.CIRCLE_BANK_ACCOUNT_ID,
      );
      const sourceWalletId = readText(req.body?.source_wallet_id || process.env.CIRCLE_SOURCE_WALLET_ID);
      const baseUrl = readText(process.env.CIRCLE_API_BASE_URL).replace(/\/+$/, '') || 'https://api-sandbox.circle.com';
      const amount = readText(req.body?.amount || req.body?.amount_usd || '10');
      const destinationTail = bankLast4(req.body?.destination_tail || req.body?.destinationTail || process.env.CIRCLE_PAYOUT_DESTINATION_LAST4);

      const missing = [
        ...(!apiKey ? ['CIRCLE_API_KEY'] : []),
        ...(!destinationId ? ['CIRCLE_PAYOUT_DESTINATION_ID'] : []),
      ];
      if (missing.length) {
        res.status(400).json({
          success: false,
          ...responseContext(context),
          code: 'circle_wire_test_not_configured',
          message: `Wire payout test is missing required configuration: ${missing.join(', ')}.`,
          missing,
        });
        return;
      }

      const idempotencyKey = crypto.randomUUID();
      const payload = {
        idempotencyKey,
        destination: { type: 'wire' as const, id: destinationId },
        amount: { amount, currency: 'USD' as const },
        source: sourceWalletId ? { id: sourceWalletId, type: 'wallet' as const } : undefined,
        metadata: {
          beneficiaryEmail: 'team.talktostellar@gmail.com',
          platform: 'TalkToStellar',
          test: true,
        },
      };

      let circleData: any = {};
      let circleStatus = 502;
      try {
        const circleResponse = await fetch(`${baseUrl}/v1/businessAccount/payouts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(payload),
        });
        circleStatus = circleResponse.status;
        circleData = await circleResponse.json().catch(() => ({}));
      } catch (fetchErr: any) {
        circleData = { error: 'fetch_failed', message: fetchErr.message || String(fetchErr) };
        circleStatus = 502;
      }

      res.status(200).json({
        success: circleStatus === 200 || circleStatus === 201,
        ...responseContext(context),
        circle_http_status: circleStatus,
        payout: {
          id: circleData?.data?.id || null,
          status: circleData?.data?.status || (circleData?.code ? `error_${circleData.code}` : circleData?.error || 'unknown'),
          amount,
          currency: 'USD',
          destination_tail: destinationTail,
          destination_reference_hash: shortHash(destinationId),
          source_wallet_id: sourceWalletId ? shortHash(sourceWalletId) : null,
          idempotency_key: idempotencyKey,
        },
        circle_raw: circleData,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        ...responseContext(context),
        message: error?.message || String(error),
      });
    }
  }
}
