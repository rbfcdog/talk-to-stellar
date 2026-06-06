import { Request, Response } from 'express';
import { brlUsdQuoteService } from '../services/brl-usd-quote.service';
import { publicErrorMessage } from '../../utils/public-error';
import { applyApiRequestContext, readApiRequestContext, responseContext } from './request-context';

function statusFromError(error: any): number {
  const message = String(error?.message || error || '');
  if (/positive|amount|required/i.test(message)) return 400;
  return Number(error?.status || error?.statusCode || 500);
}

export class QuotesController {
  static async createBrlUsdQuote(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);
    try {
      const quote = await brlUsdQuoteService.createQuote({
        brl_amount: req.body?.brl_amount || req.body?.amount,
        user_id: req.body?.user_id || req.body?.userId,
        institution_id: req.body?.institution_id || req.body?.institutionId,
        request_id: context.request_id,
        correlation_id: context.correlation_id,
      });
      res.status(201).json({ success: true, ...responseContext(context), quote });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        ...responseContext(context),
        message: publicErrorMessage(error, 'Não consegui criar a cotação agora. Tente novamente em alguns segundos.'),
      });
    }
  }
}
