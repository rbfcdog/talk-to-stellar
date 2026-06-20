import { Request, Response } from 'express';
import { paymentWatcher } from '../../integrations/payment-watcher/service';

export const PaymentWatcherController = {
  status(_req: Request, res: Response) {
    res.json(paymentWatcher.status());
  },

  subscribe(req: Request, res: Response) {
    const { public_key } = req.body as { public_key?: string };
    if (!public_key) return res.status(400).json({ error: 'public_key required' });
    paymentWatcher.subscribe(public_key);
    res.json({ subscribed: true, public_key });
  },

  unsubscribe(req: Request, res: Response) {
    const { public_key } = req.body as { public_key?: string };
    if (!public_key) return res.status(400).json({ error: 'public_key required' });
    paymentWatcher.unsubscribe(public_key);
    res.json({ unsubscribed: true, public_key });
  },
};
