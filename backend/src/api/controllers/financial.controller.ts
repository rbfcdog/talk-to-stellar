import { Request, Response } from 'express';
import { ActivityFeedService } from '../services/activity-feed.service';
import { FinancialInsightsService } from '../services/financial-insights.service';
import { SmartContactsService } from '../services/smart-contacts.service';
import { PaymentReplayService } from '../services/payment-replay.service';
import { EconomyEngineService } from '../services/economy-engine.service';
import { InvoiceService } from '../services/invoice.service';
import { GlobalProfileService } from '../services/global-profile.service';
import { TransactionHistoryService } from '../services/transaction-history.service';
import { AgentRepository } from '../../repositories/agent.repository';
import { supabase } from '../../config/supabase';
import ExternalService from '../../services/external.service';
import { getAssetIssuer, normalizeAssetCode } from '../../config/assets';
import { isSessionExpired } from '../../utils/session-expiry';

const agentRepo = new AgentRepository(supabase);
const externalService = new ExternalService(supabase as any);

function sessionAndUser(req: Request): { sessionId?: string; userId?: string } {
  return {
    sessionId: String(req.body?.session_id || req.query?.session_id || req.params?.session_id || '').trim() || undefined,
    userId: String(req.body?.user_id || req.query?.user_id || '').trim() || undefined,
  };
}

export class FinancialController {
  static async getActivityFeed(req: Request, res: Response) {
    try {
      const data = await ActivityFeedService.listFeed({
        ...sessionAndUser(req),
        limit: Number(req.query.limit || req.body?.limit || 40),
      });
      return res.status(200).json({ success: true, feed: data });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async getInsights(req: Request, res: Response) {
    try {
      const insights = await FinancialInsightsService.listLatestInsights({
        ...sessionAndUser(req),
        limit: Number(req.query.limit || req.body?.limit || 8),
      });
      return res.status(200).json({ success: true, insights });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async getSmartContacts(req: Request, res: Response) {
    try {
      const contacts = await SmartContactsService.listSmartContacts({
        ...sessionAndUser(req),
        limit: Number(req.query.limit || req.body?.limit || 30),
      });
      return res.status(200).json({ success: true, contacts });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async getReplayCandidate(req: Request, res: Response) {
    try {
      const replay = await PaymentReplayService.findReplayCandidate({
        ...sessionAndUser(req),
        queryContext: String(req.body?.query_context || req.query?.query_context || ''),
      });
      return res.status(200).json({ success: true, replay });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async getSavings(req: Request, res: Response) {
    try {
      const savings = await EconomyEngineService.calculateMonthly(sessionAndUser(req));
      return res.status(200).json({ success: true, ...savings });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async createInvoice(req: Request, res: Response) {
    try {
      const invoice = await InvoiceService.create({
        ...sessionAndUser(req),
        recipientName: String(req.body?.recipient_name || req.body?.recipient || ''),
        title: req.body?.title,
        description: req.body?.description,
        amount: String(req.body?.amount || ''),
        currency: String(req.body?.currency || 'USD'),
        dueDate: req.body?.due_date,
      });
      return res.status(201).json({ success: true, invoice });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async listInvoices(req: Request, res: Response) {
    try {
      const invoices = await InvoiceService.list({
        ...sessionAndUser(req),
        limit: Number(req.query.limit || req.body?.limit || 30),
      });
      return res.status(200).json({ success: true, invoices });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async getOrCreateGlobalProfile(req: Request, res: Response) {
    try {
      const profile = await GlobalProfileService.getOrCreate({
        ...sessionAndUser(req),
        usernameHint: req.body?.username || req.query?.username,
        displayName: req.body?.display_name,
        bio: req.body?.bio,
      });
      return res.status(200).json({ success: true, profile });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
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
      return res.status(400).json({ success: false, message: error?.message || String(error) });
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
      if (!storedToken || storedToken !== sessionToken) {
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
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async getTransactions(req: Request, res: Response) {
    try {
      const payload = await TransactionHistoryService.listTransactions({
        ...sessionAndUser(req),
        month: Number(req.query.month || req.body?.month || 0),
        year: Number(req.query.year || req.body?.year || 0),
        limit: Number(req.query.limit || req.body?.limit || 60),
      });
      return res.status(200).json({ success: true, ...payload });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async getWalletProfile(req: Request, res: Response) {
    try {
      const publicKey = String(req.params.public_key || req.query.public_key || req.body?.public_key || '').trim();
      const payload = await TransactionHistoryService.getWalletProfile({
        ...sessionAndUser(req),
        publicKey,
      });
      return res.status(200).json({ success: true, ...payload });
    } catch (error: any) {
      return res.status(400).json({ success: false, message: error?.message || String(error) });
    }
  }
}
