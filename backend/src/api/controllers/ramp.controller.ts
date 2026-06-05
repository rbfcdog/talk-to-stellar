import { Request, Response } from 'express';
import { AnchorService } from '../services/anchor.service';
import { timingSafeEqualString } from '../../utils/password';
import { publicErrorCode, publicErrorMessage, publicErrorPayload } from '../../utils/public-error';
import { logger } from '../../utils/logger';

function statusFromError(error: any): number {
  if (publicErrorCode(error) === 'service_timeout') return 504;
  const status = Number(error?.statusCode || error?.status || 500);
  if (Number.isFinite(status) && status >= 400 && status < 600) return status;
  return 500;
}

function errorMessage(error: any): string {
  return publicErrorMessage(error, 'Não consegui concluir a operação PIX agora. Tente novamente em alguns segundos.');
}

function errorPayload(error: any): Record<string, unknown> {
  const code = publicErrorCode(error);
  const payload: Record<string, unknown> = { success: false, code, message: errorMessage(error) };
  if (error?.kyc_url) payload.kyc_url = error.kyc_url;
  if (error?.bank_account_id) payload.bank_account_id = error.bank_account_id;
  if (error?.programmatic_onboarding) payload.programmatic_onboarding = error.programmatic_onboarding;
  if (error?.customer_id) payload.customer_id = error.customer_id;
  if (error?.retry_after_ms) payload.retry_after_ms = error.retry_after_ms;
  return payload;
}

function requestIdFromReq(req: Request): string {
  return String(req.headers['x-request-id'] || req.headers['x-correlation-id'] || '').trim();
}

function yieldErrorPayload(error: any, req?: Request): Record<string, unknown> {
  const requestId = req ? requestIdFromReq(req) : '';
  return {
    ...publicErrorPayload(error, {
      includeSupportCode: true,
      fallback: 'Não foi possível atualizar a aplicação agora. Tente novamente em alguns segundos.',
    }),
    ...(requestId ? { request_id: requestId } : {}),
  };
}

function maskLogValue(value: unknown, start = 6, end = 4): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (text.length <= start + end + 3) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function logYieldRouteFailure(route: string, req: Request, error: any): void {
  const code = publicErrorCode(error);
  const status = statusFromError(error);
  const source = { ...req.query, ...req.body, ...req.params } as Record<string, unknown>;
  logger.warn(`[defindex] event=route_failed ${JSON.stringify({
    request_id: requestIdFromReq(req),
    route,
    method: req.method,
    status,
    code,
    session_id: maskLogValue(source.session_id || source.sessionId || req.headers['x-session-id']),
    asset_code: source.asset_code || source.assetCode,
    action: source.action,
    amount: source.amount,
    requested_vault: maskLogValue(source.vault_address || source.vaultAddress),
    has_pin: Boolean(source.pin || source.wallet_pin || source.walletPin || req.headers['x-wallet-pin'] || req.headers['x-talktostellar-wallet-pin']),
    error: error instanceof Error ? error.message : String(error || 'Unknown error'),
  })}`);
}

function requestInput(req: Request): Record<string, unknown> {
  const headerPin = String(req.headers['x-wallet-pin'] || req.headers['x-talktostellar-wallet-pin'] || '').trim();
  const headerSessionId = String(req.headers['x-session-id'] || req.headers['x-talktostellar-session-id'] || '').trim();
  const headerSessionToken = String(req.headers['x-session-token'] || req.headers['x-talktostellar-session-token'] || '').trim();
  const requestId = requestIdFromReq(req);
  return {
    ...req.query,
    ...req.body,
    ...req.params,
    ...(requestId ? { request_id: requestId } : {}),
    ...(headerSessionId ? { session_id: headerSessionId } : {}),
    ...(headerSessionToken ? { session_token: headerSessionToken } : {}),
    ...(headerPin ? { pin: headerPin, wallet_pin: headerPin } : {}),
  };
}

function readBearerToken(req: Request): string {
  const auth = String(req.headers.authorization || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function hasInternalSandboxAuthorization(req: Request): boolean {
  const expected = String(process.env.RAMP_SANDBOX_INTERNAL_SECRET || process.env.INTERNAL_API_SECRET || '').trim();
  const provided = String(
    req.headers['x-ramp-sandbox-secret'] ||
      req.headers['x-internal-api-secret'] ||
      readBearerToken(req) ||
      ''
  ).trim();
  return Boolean(expected && provided && timingSafeEqualString(expected, provided));
}

function requireInternalSandboxAuthorization(req: Request, res: Response): boolean {
  if (hasInternalSandboxAuthorization(req)) return true;
  res.status(403).json({
    success: false,
    code: 'sandbox_helper_unauthorized',
    message: 'Entre na sua conta para continuar este fluxo PIX neste ambiente.',
  });
  return false;
}

export class RampController {
  static async getEtherfuseConfig(_req: Request, res: Response) {
    try {
      res.status(200).json({ success: true, ...AnchorService.getRuntimeInfo() });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async resolveEtherfuseWalletByEmail(req: Request, res: Response) {
    try {
      if (!requireInternalSandboxAuthorization(req, res)) return;
      const result = await AnchorService.resolveWalletByEmail(requestInput(req));
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async createEtherfuseCustomer(req: Request, res: Response) {
    try {
      const result = await AnchorService.createCustomerForSession(requestInput(req));
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorPayload(error));
    }
  }

  static async verifySessionPin(req: Request, res: Response) {
    try {
      const result = await AnchorService.verifySessionPin(requestInput(req));
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json(yieldErrorPayload(error, req));
    }
  }

  static async getEtherfuseKycStatus(req: Request, res: Response) {
    try {
      const result = await AnchorService.getKycStatusForSession(requestInput(req));
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async getEtherfuseAssets(req: Request, res: Response) {
    try {
      const result = await AnchorService.getAssetsForSession(requestInput(req));
      res.status(200).json({ success: true, ...result as any });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async getDefindexYieldStatus(_req: Request, res: Response) {
    try {
      const result = await AnchorService.getDefindexYieldStatus();
      res.status(200).json(result);
    } catch (error: any) {
      logYieldRouteFailure('status', _req, error);
      res.status(statusFromError(error)).json(yieldErrorPayload(error, _req));
    }
  }

  static async getDefindexYieldBalance(req: Request, res: Response) {
    try {
      const result = await AnchorService.getDefindexYieldBalanceForSession(requestInput(req));
      res.status(200).json(result);
    } catch (error: any) {
      logYieldRouteFailure('balance', req, error);
      res.status(statusFromError(error)).json(yieldErrorPayload(error, req));
    }
  }

  static async prepareDefindexYield(req: Request, res: Response) {
    try {
      const result = await AnchorService.prepareDefindexYieldForSession(requestInput(req));
      res.status(200).json(result);
    } catch (error: any) {
      logYieldRouteFailure('prepare', req, error);
      res.status(statusFromError(error)).json(yieldErrorPayload(error, req));
    }
  }

  static async executeDefindexYield(req: Request, res: Response) {
    try {
      const result = await AnchorService.executeDefindexYieldForSession(requestInput(req));
      if (!result.success) {
        res.status(400).json(yieldErrorPayload((result as any).error || result, req));
        return;
      }
      res.status(200).json(result);
    } catch (error: any) {
      logYieldRouteFailure('execute', req, error);
      res.status(statusFromError(error)).json(yieldErrorPayload(error, req));
    }
  }

  static async listEtherfuseFiatAccounts(req: Request, res: Response) {
    try {
      const result = await AnchorService.listFiatAccountsForSession(requestInput(req));
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async getExternalBankAccount(req: Request, res: Response) {
    try {
      const result = await AnchorService.getOrCreateExternalBankAccountForSession(requestInput(req));
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async getEtherfuseWalletBalances(req: Request, res: Response) {
    try {
      const result = await AnchorService.getWalletBalancesForSession(requestInput(req));
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async createEtherfuseQuote(req: Request, res: Response) {
    try {
      const result = await AnchorService.getQuoteForSession(requestInput(req));
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async ensureEtherfuseTesouroTrustline(req: Request, res: Response) {
    try {
      const result = await AnchorService.ensureTesouroTrustlineForSession(requestInput(req));
      res.status(result.success ? 200 : 409).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async createEtherfuseOnRamp(req: Request, res: Response) {
    try {
      const result = await AnchorService.createOnRampForSession(requestInput(req));
      res.status(201).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorPayload(error));
    }
  }

  static async getEtherfuseOnRamp(req: Request, res: Response) {
    try {
      const orderId = String(req.params.orderId || req.query.order_id || req.query.orderId || '').trim();
      const operationId = String(req.query.operation_id || req.query.operationId || '').trim() || undefined;
      const result = await AnchorService.getOnRampStatus(orderId, operationId);
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async createEtherfuseOffRamp(req: Request, res: Response) {
    try {
      const result = await AnchorService.createOffRampForSession(requestInput(req));
      res.status(201).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async previewEtherfuseOffRamp(req: Request, res: Response) {
    try {
      const result = await AnchorService.previewOffRampForSession(requestInput(req));
      res.status(200).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async getEtherfuseOffRamp(req: Request, res: Response) {
    try {
      const orderId = String(req.params.orderId || req.query.order_id || req.query.orderId || '').trim();
      const operationId = String(req.query.operation_id || req.query.operationId || '').trim() || undefined;
      const result = await AnchorService.getOffRampStatus(orderId, operationId);
      res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async submitEtherfuseOffRamp(req: Request, res: Response) {
    try {
      const result = await AnchorService.submitOffRampForSession(requestInput(req));
      res.status(result.success ? 200 : 400).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async simulateEtherfuseFiatReceived(req: Request, res: Response) {
    try {
      const result = await AnchorService.simulateFiatReceivedForSession({
        ...requestInput(req),
        trusted_internal: hasInternalSandboxAuthorization(req),
      });
      res.status(result.success ? 200 : 400).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async submitPixFundedTransfer(req: Request, res: Response) {
    try {
      const result = await AnchorService.submitPixFundedTransferForSession(requestInput(req));
      res.status(result.success ? 200 : 400).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async resolvePixFundedTransferRecipient(req: Request, res: Response) {
    try {
      const result = await AnchorService.resolvePixFundedTransferRecipientForSession(requestInput(req));
      res.status(200).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async runTemporaryEtherfuseOnRampTest(req: Request, res: Response) {
    try {
      if (!requireInternalSandboxAuthorization(req, res)) return;
      const result = await AnchorService.runTemporarySandboxOnRampTest(requestInput(req));
      res.status(200).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async runTemporaryEtherfuseOffRampTest(req: Request, res: Response) {
    try {
      if (!requireInternalSandboxAuthorization(req, res)) return;
      const result = await AnchorService.runTemporarySandboxOffRampTest(requestInput(req));
      res.status(200).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }
}
