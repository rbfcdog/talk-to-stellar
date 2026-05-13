import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import ExternalService from '../../services/external.service';

const externalService = new ExternalService(supabase as any);

export class ShortLinkController {
  static async create(req: Request, res: Response) {
    try {
      const url = String(req.body?.url || '').trim();
      const purpose = String(req.body?.purpose || 'qr_passkey_confirm').trim().toLowerCase();
      const sessionId = String(req.body?.session_id || req.body?.sessionId || '').trim();
      const userId = String(req.body?.user_id || req.body?.userId || '').trim();
      const expiresInHours = Math.max(1, Number(req.body?.expires_in_hours || req.body?.expiresInHours || 24));

      if (!url) {
        return res.status(400).json({ success: false, message: 'url é obrigatório.' });
      }
      if (!/^https?:\/\//i.test(url)) {
        return res.status(400).json({ success: false, message: 'url inválida. Use http:// ou https://.' });
      }

      const shortUrl = await externalService.shortenPublicUrl({
        url,
        purpose,
        sessionId: sessionId || undefined,
        userId: userId || undefined,
        expiresInHours,
      });

      return res.status(200).json({
        success: true,
        url: shortUrl,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  }

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
