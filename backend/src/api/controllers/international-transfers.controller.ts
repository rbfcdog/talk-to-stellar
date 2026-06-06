import { Request, Response } from 'express';
import { internationalTransferService } from '../services/international-transfer.service';
import { publicErrorMessage } from '../../utils/public-error';
import { timingSafeEqualString } from '../../utils/password';
import { logger } from '../../utils/logger';
import { applyApiRequestContext, readApiRequestContext, responseContext } from './request-context';

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
  const expected = String(process.env.INTERNATIONAL_TRANSFER_OPS_SECRET || process.env.INTERNAL_API_SECRET || '').trim();
  const provided = String(
    req.headers['x-international-transfer-ops-secret'] ||
      req.headers['x-internal-api-secret'] ||
      readBearerToken(req) ||
      ''
  ).trim();
  return Boolean(expected && provided && timingSafeEqualString(expected, provided));
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

export class InternationalTransfersController {
  static async createTransfer(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
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
      const transfer = await internationalTransferService.getTransfer(String(req.params.id));
      res.status(200).json({ success: true, ...responseContext(context), transfer });
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
}
