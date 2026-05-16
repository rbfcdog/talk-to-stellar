import { Request, Response } from 'express';
import { EvolutionService } from '../services/evolution.service';

export default class EvolutionController {
  static async webhook(req: Request, res: Response) {
    try {
      const secret = req.query.secret || req.get('x-evolution-webhook-secret');
      if (!EvolutionService.verifyWebhookSecret(secret)) {
        return res.status(401).json({ success: false, error: 'Invalid webhook secret.' });
      }

      const payload = req.params.event
        ? { ...req.body, event: req.body?.event || req.params.event }
        : req.body;
      const result = await EvolutionService.handleWebhook(payload);
      return res.status(200).json({ success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ success: false, error: message });
    }
  }

  static async ping(_req: Request, res: Response) {
    return res.status(200).json({ success: true, webhook: 'evolution' });
  }
}
