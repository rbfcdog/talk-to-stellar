import { Request, Response } from 'express';
import { brlUsdQuoteService } from '../services/brl-usd-quote.service';
import { publicErrorMessage } from '../../utils/public-error';

function statusFromError(error: any): number {
  const message = String(error?.message || error || '');
  if (/positive|amount|required/i.test(message)) return 400;
  return Number(error?.status || error?.statusCode || 500);
}

export class QuotesController {
  static async createBrlUsdQuote(req: Request, res: Response) {
    try {
      const quote = await brlUsdQuoteService.createQuote({
        brl_amount: req.body?.brl_amount || req.body?.amount,
        user_id: req.body?.user_id || req.body?.userId,
        institution_id: req.body?.institution_id || req.body?.institutionId,
      });
      res.status(201).json({ success: true, quote });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        message: publicErrorMessage(error, 'Nao consegui criar a cotacao agora. Tente novamente em alguns segundos.'),
      });
    }
  }
}
