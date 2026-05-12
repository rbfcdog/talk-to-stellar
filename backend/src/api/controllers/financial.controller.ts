import { Request, Response } from 'express';
import { ActivityFeedService } from '../services/activity-feed.service';
import { FinancialInsightsService } from '../services/financial-insights.service';
import { SmartContactsService } from '../services/smart-contacts.service';
import { PaymentReplayService } from '../services/payment-replay.service';
import { EconomyEngineService } from '../services/economy-engine.service';
import { InvoiceService } from '../services/invoice.service';
import { GlobalProfileService } from '../services/global-profile.service';

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

}
