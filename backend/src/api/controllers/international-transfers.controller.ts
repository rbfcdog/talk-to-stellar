import { Request, Response } from 'express';
import { internationalTransferService } from '../services/international-transfer.service';
import { publicErrorMessage } from '../../utils/public-error';

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
    message: publicErrorMessage(error, 'Nao consegui atualizar a rota entre instituicoes agora. Tente novamente em alguns segundos.'),
  };
}

export class InternationalTransfersController {
  static async createTransfer(req: Request, res: Response) {
    try {
      const transfer = await internationalTransferService.createTransfer({
        quote_id: String(req.body?.quote_id || req.body?.quoteId || ''),
        user_id: req.body?.user_id || req.body?.userId,
        institution_id: req.body?.institution_id || req.body?.institutionId,
        sender_identity: req.body?.sender_identity || req.body?.senderIdentity || {},
        recipient_identity: req.body?.recipient_identity || req.body?.recipientIdentity || {},
        payout_destination: req.body?.payout_destination || req.body?.payoutDestination,
        same_name_payout_required: req.body?.same_name_payout_required ?? req.body?.sameNamePayoutRequired,
      });
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBody(error));
    }
  }

  static async createPixIntent(req: Request, res: Response) {
    try {
      const transfer = await internationalTransferService.createPixIntent(String(req.params.id), {
        session_id: String(req.body?.session_id || req.body?.sessionId || ''),
        session_token: String(req.body?.session_token || req.body?.sessionToken || ''),
        email: req.body?.email,
        mock: req.body?.mock === true || req.body?.mock_pix_intent === true || req.body?.mockPixIntent === true,
      });
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBody(error));
    }
  }

  static async settleStellar(req: Request, res: Response) {
    try {
      const transfer = await internationalTransferService.settleStellar(String(req.params.id));
      res.status(200).json({ success: true, transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBody(error));
    }
  }

  static async createPayoutInstruction(req: Request, res: Response) {
    try {
      const transfer = await internationalTransferService.createPayoutInstruction(
        String(req.params.id),
        req.body?.provider || req.body?.payout_provider || req.body?.payoutProvider,
        {
          session_id: req.body?.session_id || req.body?.sessionId,
          session_token: req.body?.session_token || req.body?.sessionToken,
          wallet_pin: req.body?.wallet_pin || req.body?.walletPin || req.body?.pin,
          run_etherfuse_offramp_test: req.body?.run_etherfuse_offramp_test ?? req.body?.runEtherfuseOffRampTest,
          target_brl: req.body?.target_brl || req.body?.targetBrl,
        },
      );
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBody(error));
    }
  }

  static async getTransfer(req: Request, res: Response) {
    try {
      const transfer = await internationalTransferService.getTransfer(String(req.params.id));
      res.status(200).json({ success: true, transfer });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBody(error));
    }
  }

  static async getReconciliation(req: Request, res: Response) {
    try {
      const reconciliation = await internationalTransferService.getReconciliation(String(req.params.id));
      res.status(200).json({ success: true, reconciliation });
    } catch (error: any) {
      res.status(statusFromError(error)).json(errorBody(error));
    }
  }
}
