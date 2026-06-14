import { Request, Response } from 'express';
import {
  EarlyAccessSignupError,
  earlyAccessSignupService,
} from '../services/early-access-signup.service';
import { publicErrorMessage } from '../../utils/public-error';
import { applyApiRequestContext, readApiRequestContext, responseContext } from './request-context';

function statusFromError(error: any): number {
  if (error instanceof EarlyAccessSignupError) return error.statusCode;
  return Number(error?.status || error?.statusCode || 500);
}

function fallbackMessage(error: any): string {
  if (error instanceof EarlyAccessSignupError) return error.message;
  return 'Não consegui salvar seu e-mail agora. Tente novamente em alguns segundos.';
}

export class EarlyAccessController {
  static async subscribe(req: Request, res: Response) {
    const context = readApiRequestContext(req);
    applyApiRequestContext(res, context);

    try {
      const result = await earlyAccessSignupService.subscribe({
        email: req.body?.email,
        locale: req.body?.locale || req.body?.language,
        source: req.body?.source,
        campaign: req.body?.campaign,
        referrer: req.body?.referrer || req.get('referer'),
        pageUrl: req.body?.page_url || req.body?.pageUrl,
        metadata: req.body?.metadata,
      });

      res.status(201).json({
        success: true,
        ...responseContext(context),
        signup: result,
      });
    } catch (error: any) {
      res.status(statusFromError(error)).json({
        success: false,
        ...responseContext(context),
        message: publicErrorMessage(error, fallbackMessage(error)),
        code: error?.code || 'EARLY_ACCESS_SIGNUP_FAILED',
      });
    }
  }
}
