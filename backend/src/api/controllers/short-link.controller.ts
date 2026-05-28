import { Request, Response } from 'express';
import { supabase } from '../../config/supabase';
import ExternalService from '../services/core/external.service';
import { isProductionLikeEnvironment } from '../../config/runtime';
import { timingSafeEqualString } from '../../utils/password';
import { isSessionExpired } from '../../utils/session-expiry';

const externalService = new ExternalService(supabase as any);

const PUBLIC_SHORT_LINK_PURPOSES = new Set([
  'create_account_passkey_qr',
  'login_passkey_qr',
  'confirm_payment_passkey_qr',
  'send_external_wallet',
]);

const PUBLIC_SHORT_LINK_PATHS = [
  '/create-account',
  '/login',
  '/confirm-payment',
  '/send-external',
];

function splitCsv(value: unknown): string[] {
  return String(value || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function normalizeBaseUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withProtocol).origin;
  } catch {
    return '';
  }
}

function configuredFrontendOrigins(): Set<string> {
  const values = [
    process.env.PUBLIC_APP_URL,
    process.env.FRONTEND_URL,
    process.env.CREATE_ACCOUNT_BASE,
    process.env.PAYMENT_CONFIRM_BASE,
    process.env.NEXT_PUBLIC_FRONTEND_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.RENDER_EXTERNAL_URL,
    process.env.VERCEL_URL,
    ...splitCsv(process.env.CORS_ORIGINS),
  ];

  return new Set(values.map(normalizeBaseUrl).filter(Boolean));
}

function isLocalFrontendOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function isAllowedShortLinkPath(pathname: string): boolean {
  return PUBLIC_SHORT_LINK_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function hasTrustedProxySecret(req: Request): boolean {
  const expected = String(process.env.SHORT_LINK_PROXY_SECRET || process.env.INTERNAL_API_SECRET || '').trim();
  const provided = String(req.get('x-internal-api-secret') || req.get('x-short-link-proxy-secret') || '').trim();
  return Boolean(expected && provided && timingSafeEqualString(expected, provided));
}

function validatePublicShortLinkTarget(req: Request, rawUrl: string, purpose: string): string | null {
  if (!PUBLIC_SHORT_LINK_PURPOSES.has(purpose)) {
    return 'purpose de short link não permitido para criação pública.';
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return 'url inválida.';
  }

  const productionLike = isProductionLikeEnvironment();
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && !productionLike && isLocalFrontendOrigin(parsed.origin))) {
    return 'short links públicos exigem HTTPS.';
  }

  if (!isAllowedShortLinkPath(parsed.pathname)) {
    return 'destino de short link não permitido.';
  }

  const allowedOrigins = configuredFrontendOrigins();
  if (allowedOrigins.has(parsed.origin) || (!productionLike && isLocalFrontendOrigin(parsed.origin))) {
    return null;
  }

  const forwardedFrontendOrigin = normalizeBaseUrl(req.get('x-frontend-origin') || '');
  if (hasTrustedProxySecret(req) && forwardedFrontendOrigin && parsed.origin === forwardedFrontendOrigin) {
    return null;
  }

  return 'origem de short link não permitida.';
}

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
      const validationError = validatePublicShortLinkTarget(req, url, purpose);
      if (validationError) {
        return res.status(400).json({ success: false, message: validationError });
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
      const record = await externalService.resolveShortLinkRecord(code);
      if (!record?.url) {
        return res.status(404).json({ success: false, message: 'Link não encontrado ou expirado.' });
      }

      const includeSession = String(req.query.include_session || req.query.includeSession || '').trim() === '1';
      const canAttachSession = includeSession &&
        hasTrustedProxySecret(req) &&
        ['pix_onramp', 'pix_offramp', 'send_external_wallet'].includes(String(record.purpose || '').trim().toLowerCase()) &&
        Boolean(record.session_id);

      if (!canAttachSession) {
        return res.status(200).json({ success: true, url: record.url });
      }

      const { data: session, error } = await supabase
        .from('agent_sessions')
        .select('session_id, session_token, user_id, last_activity, updated_at, created_at')
        .eq('session_id', record.session_id)
        .maybeSingle();

      if (error || !session?.session_token || isSessionExpired(session)) {
        return res.status(200).json({ success: true, url: record.url });
      }

      return res.status(200).json({
        success: true,
        url: record.url,
        session_id: String(session.session_id || record.session_id || ''),
        session_token: String(session.session_token || ''),
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  }
}
