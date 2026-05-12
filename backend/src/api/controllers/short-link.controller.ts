import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import ExternalService from '../../services/external.service';

const externalService = new ExternalService(supabase as any);

export class ShortLinkController {
  static async resolve(req: Request, res: Response) {
    try {
      const code = String(req.params.code || req.query.code || '').trim();
      const url = await externalService.resolveShortLink(code);
      if (!url) {
        return res.status(404).json({ success: false, message: 'Link não encontrado ou expirado.' });
      }
      return res.status(200).json({ success: true, url });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  }
}
