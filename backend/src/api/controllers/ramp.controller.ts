import { Request, Response } from 'express';
import { AnchorService } from '../services/anchor.service';

function statusFromError(error: any): number {
  const status = Number(error?.statusCode || error?.status || 500);
  if (Number.isFinite(status) && status >= 400 && status < 600) return status;
  return 500;
}

function errorMessage(error: any): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function requestInput(req: Request): Record<string, unknown> {
  return {
    ...req.query,
    ...req.body,
    ...req.params,
  };
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
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
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

  static async listEtherfuseFiatAccounts(req: Request, res: Response) {
    try {
      const result = await AnchorService.listFiatAccountsForSession(requestInput(req));
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
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
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
      const result = await AnchorService.simulateFiatReceivedForSession(requestInput(req));
      res.status(result.success ? 200 : 400).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async runTemporaryEtherfuseOnRampTest(req: Request, res: Response) {
    try {
      const result = await AnchorService.runTemporarySandboxOnRampTest(requestInput(req));
      res.status(200).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }

  static async runTemporaryEtherfuseOffRampTest(req: Request, res: Response) {
    try {
      const result = await AnchorService.runTemporarySandboxOffRampTest(requestInput(req));
      res.status(200).json(result);
    } catch (error: any) {
      res.status(statusFromError(error)).json({ success: false, message: errorMessage(error) });
    }
  }
}
