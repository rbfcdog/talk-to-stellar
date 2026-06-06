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
  '/setup-passkey',
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

function requestSessionId(req: Request): string {
  return String(
    req.body?.session_id ||
      req.body?.sessionId ||
      req.query.session_id ||
      req.query.sessionId ||
      req.get('x-session-id') ||
      req.get('x-talktostellar-session-id') ||
      ''
  ).trim();
}

function normalizeSessionSource(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'telegram' || normalized.includes('telegram')) return 'telegram';
  if (
    normalized === 'whatsapp' ||
    normalized === 'phone' ||
    normalized === 'evolution' ||
    normalized === 'whatsapp_evolution' ||
    normalized === 'whatsapp-evolution' ||
    normalized.includes('whatsapp')
  ) return 'whatsapp';
  if (normalized === 'web' || normalized === 'browser' || normalized === 'chat' || normalized === 'chat_link') return 'web';
  return normalized;
}

function isExternalSessionSource(value: unknown): boolean {
  const source = normalizeSessionSource(value);
  return source === 'whatsapp' || source === 'telegram';
}

function sourceFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return normalizeSessionSource(
      url.searchParams.get('provider') ||
      url.searchParams.get('session_scope') ||
      url.searchParams.get('sessionScope') ||
      url.searchParams.get('session_source') ||
      url.searchParams.get('sessionSource') ||
      url.searchParams.get('external_source') ||
      url.searchParams.get('channel') ||
      url.searchParams.get('source') ||
      url.searchParams.get('from') ||
      ''
    );
  } catch {
    return '';
  }
}

async function resolveSessionSource(sessionId: string, rawUrl: string): Promise<string> {
  const fromUrl = sourceFromUrl(rawUrl);
  if (fromUrl === 'telegram' || fromUrl === 'whatsapp') return fromUrl;
  if (!sessionId) return fromUrl;

  try {
    const { data, error } = await supabase
      .from('external_accounts')
      .select('provider')
      .eq('session_id', sessionId)
      .in('provider', ['telegram', 'whatsapp', 'phone'])
      .order('id', { ascending: false })
      .limit(1);

    if (error) return fromUrl;
    const provider = normalizeSessionSource(Array.isArray(data) ? data[0]?.provider : '');
    return provider || fromUrl;
  } catch {
    return fromUrl;
  }
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
      const expiresInMinutes = Math.max(0, Number(req.body?.expires_in_minutes || req.body?.expiresInMinutes || 0));
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
        expiresInMinutes: expiresInMinutes || undefined,
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
        Boolean(record.session_id);

      if (!canAttachSession) {
        return res.status(200).json({
          success: true,
          url: record.url,
          purpose: record.purpose || null,
          session_source: sourceFromUrl(record.url) || null,
        });
      }

      const { data: session, error } = await supabase
        .from('agent_sessions')
        .select('session_id, session_token, user_id, last_activity, updated_at, created_at')
        .eq('session_id', record.session_id)
        .maybeSingle();

      const sessionSource = await resolveSessionSource(String(session?.session_id || record.session_id || ''), record.url);

      if (error || !session?.session_token) {
        return res.status(200).json({
          success: true,
          url: record.url,
          purpose: record.purpose || null,
          session_source: sessionSource || null,
        });
      }

      const expiredSession = isSessionExpired(session);
      if (expiredSession && !isExternalSessionSource(sessionSource)) {
        return res.status(200).json({
          success: true,
          url: record.url,
          purpose: record.purpose || null,
          session_source: sessionSource || null,
        });
      }

      if (expiredSession && isExternalSessionSource(sessionSource)) {
        const now = new Date().toISOString();
        await supabase
          .from('agent_sessions')
          .update({ last_activity: now, updated_at: now })
          .eq('session_id', String(session.session_id || record.session_id || ''));
      }

      return res.status(200).json({
        success: true,
        url: record.url,
        purpose: record.purpose || null,
        session_id: String(session.session_id || record.session_id || ''),
        session_token: String(session.session_token || ''),
        session_source: sessionSource || null,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async consume(req: Request, res: Response) {
    try {
      const code = String(req.params.code || req.query.code || '').trim();
      if (!code) {
        return res.status(400).json({ success: false, message: 'code é obrigatório.' });
      }

      const record = await externalService.resolveShortLinkRecord(code);
      if (!record?.url) {
        return res.status(404).json({ success: false, message: 'Link não encontrado.' });
      }

      const recordSessionId = String(record.session_id || '').trim();
      const callerSessionId = requestSessionId(req);
      const authorized =
        hasTrustedProxySecret(req) ||
        Boolean(recordSessionId && callerSessionId && recordSessionId === callerSessionId);

      if (!authorized) {
        return res.status(403).json({
          success: false,
          message: 'Esta sessão não pode marcar este link como usado.',
        });
      }

      const consumed = await externalService.expireShortLink(code);
      return res.status(consumed ? 200 : 404).json({
        success: consumed,
        message: consumed ? 'Link marcado como usado.' : 'Link não encontrado.',
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  }
}
