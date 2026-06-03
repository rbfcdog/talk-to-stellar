import crypto from 'crypto';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { getRequiredJwtSecret } from '../../config/secrets';
import { isProductionLikeEnvironment, readBooleanEnv } from '../../config/runtime';

export type EmailConfirmationPurpose = 'create_account' | 'login';

type Language = 'pt-BR' | 'en';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type EmailProvider = 'ses' | 'resend' | 'sendgrid' | 'webhook';

const LEGACY_EMAIL_VERIFICATION_CUTOFF_MS = Date.parse('2026-06-02T16:40:00Z');

type RequireVerifiedInput = {
  email?: string | null;
  purpose: EmailConfirmationPurpose;
  code?: string | null;
  language?: Language | string | null;
  metadata?: Record<string, unknown>;
};

type RequireVerifiedResult = {
  verified: boolean;
  email: string;
  maskedEmail: string;
  expiresAt?: string;
  devCode?: string;
  message: string;
};

function emailConfirmationEnabled(): boolean {
  const explicit = [
    process.env.EMAIL_CONFIRMATION_ENABLED,
    process.env.ENABLE_EMAIL_CONFIRMATION,
    process.env.REQUIRE_EMAIL_CONFIRMATION,
  ].find((value) => String(value || '').trim() !== '');
  if (explicit !== undefined) return readBooleanEnv(explicit);

  if (process.env.NODE_ENV === 'test') return false;
  return hasConfiguredEmailProvider();
}

export class EmailConfirmationError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'EmailConfirmationError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function normalizeEmail(value?: string | null): string {
  return String(value || '').trim().toLowerCase();
}

function looksLikeEmail(value?: string | null): boolean {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function normalizeLanguage(value?: string | null): Language {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english')) return 'en';
  return 'pt-BR';
}

function getTtlSeconds(): number {
  const parsed = Number(String(process.env.EMAIL_CONFIRMATION_TTL_SECONDS || '600').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 600;
  return Math.trunc(parsed);
}

function getMaxAttempts(): number {
  const parsed = Number(String(process.env.EMAIL_CONFIRMATION_MAX_ATTEMPTS || '5').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.trunc(parsed);
}

function getRequestCooldownSeconds(): number {
  const parsed = Number(String(process.env.EMAIL_CONFIRMATION_COOLDOWN_SECONDS || '45').trim());
  if (!Number.isFinite(parsed) || parsed < 0) return 45;
  return Math.trunc(parsed);
}

function getHashSecret(): string {
  return (
    process.env.EMAIL_CONFIRMATION_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    getRequiredJwtSecret()
  );
}

function generateCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

function hashCode(email: string, purpose: EmailConfirmationPurpose, code: string): string {
  return crypto
    .createHmac('sha256', getHashSecret())
    .update(`${purpose}:${email}:${code}`)
    .digest('hex');
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const first = local.slice(0, 1);
  const last = local.length > 2 ? local.slice(-1) : '';
  return `${first}${'*'.repeat(Math.max(2, local.length - 2))}${last}@${domain}`;
}

function isLegacyEmailVerifiedRow(row: any): boolean {
  if (row?.email_verified === true) return true;

  const source = String(row?.email_verification_source || '').trim().toLowerCase();
  if (source.startsWith('legacy_backfill_20260602')) return true;

  const createdAt = Date.parse(String(row?.created_at || ''));
  if (Number.isFinite(createdAt) && createdAt > 0 && createdAt < LEGACY_EMAIL_VERIFICATION_CUTOFF_MS) {
    return true;
  }

  const updatedAt = Date.parse(String(row?.updated_at || ''));
  return Number.isFinite(updatedAt) && updatedAt > 0 && updatedAt < LEGACY_EMAIL_VERIFICATION_CUTOFF_MS;
}

function isMissingTableError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (message.includes('email_confirmations') && (
      message.includes('schema cache') ||
      message.includes('does not exist') ||
      message.includes('could not find the table')
    ))
  );
}

function isMissingEmailVerificationColumnError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('email_verified') &&
    (message.includes('schema cache') || message.includes('does not exist') || message.includes('could not find'))
  );
}

function isPermissionError(error: any): boolean {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  return (
    code === '42501' ||
    message.includes('row-level security') ||
    message.includes('permission denied') ||
    message.includes('insufficient privilege') ||
    message.includes('not authorized')
  );
}

function emailConfirmationStorageAccessMessage(): string {
  const usingServiceRole = Boolean(String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
  return usingServiceRole
    ? 'Email confirmation storage is not accessible. Check the email_confirmations RLS policy and grants for the backend role.'
    : 'Email confirmation table exists, but the backend is using SUPABASE_ANON_KEY. Set SUPABASE_SERVICE_ROLE_KEY in the backend environment because the email_confirmations RLS policy only allows service_role.';
}

function handleEmailConfirmationStorageError(error: any): never {
  logger.warn(`[email-confirmation] storage error: ${String(error?.code || '')} ${String(error?.message || error)}`);
  if (isMissingTableError(error)) {
    throw new EmailConfirmationError(
      'EMAIL_CONFIRMATIONS_TABLE_MISSING',
      'Email confirmation table was not found. Run the backend migrations in the same Supabase project used by the backend.',
      500
    );
  }
  if (isPermissionError(error)) {
    throw new EmailConfirmationError(
      'EMAIL_CONFIRMATIONS_TABLE_INACCESSIBLE',
      emailConfirmationStorageAccessMessage(),
      500
    );
  }
  throw error;
}

function localizedMessage(language: Language, pt: string, en: string): string {
  return language === 'en' ? en : pt;
}

function genericEmailMessage(code: string, language: Language): string {
  switch (code) {
    case 'EMAIL_REQUIRED':
      return localizedMessage(language, 'Informe um e-mail válido para confirmar o acesso.', 'Enter a valid email to confirm access.');
    case 'EMAIL_CODE_INVALID':
      return localizedMessage(language, 'Código de confirmação inválido.', 'Invalid confirmation code.');
    case 'EMAIL_CODE_INVALID_OR_EXPIRED':
      return localizedMessage(language, 'Código de confirmação inválido ou expirado.', 'Invalid or expired confirmation code.');
    case 'EMAIL_CODE_LOCKED':
      return localizedMessage(language, 'Muitas tentativas. Solicite um novo código.', 'Too many attempts. Request a new code.');
    case 'EMAIL_CODE_EXPIRED':
      return localizedMessage(language, 'Código de confirmação expirado. Solicite um novo código.', 'Confirmation code expired. Request a new code.');
    case 'EMAIL_CODE_RECENT':
      return localizedMessage(language, 'Código enviado agora. Aguarde alguns segundos antes de solicitar outro.', 'Code sent recently. Wait a few seconds before requesting another one.');
    default:
      return localizedMessage(language, 'Não foi possível confirmar o e-mail.', 'Could not confirm email.');
  }
}

function fromAddress(): string {
  return (
    process.env.EMAIL_FROM ||
    process.env.TALKTOSTELLAR_EMAIL_FROM ||
    'TalkToStellar <no-reply@talktostellar.com>'
  );
}

function parseFromAddress(value: string): { email: string; name?: string } {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^(.*?)\s*<([^>]+)>$/);
  if (!match) return { email: trimmed };
  const name = String(match[1] || '').trim().replace(/^"|"$/g, '');
  return { email: String(match[2] || '').trim(), name: name || undefined };
}

function allowDevCodeResponse(): boolean {
  return !isProductionLikeEnvironment() || process.env.EMAIL_CONFIRMATION_ALLOW_DEV_CODE === 'true';
}

function configuredEmailProvider(): EmailProvider | null {
  const raw = String(process.env.EMAIL_CONFIRMATION_PROVIDER || '').trim().toLowerCase();
  if (!raw) return null;
  if (['ses', 'aws-ses', 'aws_ses'].includes(raw)) return 'ses';
  if (raw === 'resend') return 'resend';
  if (raw === 'sendgrid') return 'sendgrid';
  if (raw === 'webhook') return 'webhook';
  throw new EmailConfirmationError(
    'EMAIL_PROVIDER_INVALID',
    `Unsupported EMAIL_CONFIRMATION_PROVIDER "${raw}". Use ses, resend, sendgrid or webhook.`,
    500
  );
}

function hasSesConfig(): boolean {
  const hasAccessKey = Boolean(String(process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '').trim());
  const hasSecretKey = Boolean(String(process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim());
  const explicitSes = configuredEmailProvider() === 'ses';
  const sesRegion = Boolean(String(process.env.AWS_SES_REGION || process.env.SES_REGION || '').trim());
  return hasAccessKey && hasSecretKey && (explicitSes || sesRegion);
}

function hasConfiguredEmailProvider(): boolean {
  return Boolean(
    String(process.env.RESEND_API_KEY || '').trim() ||
      String(process.env.SENDGRID_API_KEY || '').trim() ||
      String(process.env.EMAIL_CONFIRMATION_WEBHOOK_URL || process.env.EMAIL_WEBHOOK_URL || '').trim() ||
      hasSesConfig()
  );
}

function buildMessage(input: {
  to: string;
  code: string;
  purpose: EmailConfirmationPurpose;
  language: Language;
  expiresInMinutes: number;
}): EmailMessage {
  const actionPt = input.purpose === 'create_account' ? 'criar sua conta' : 'entrar na sua conta';
  const actionEn = input.purpose === 'create_account' ? 'create your account' : 'sign in to your account';
  const subject = input.language === 'en'
    ? 'Your TalkToStellar confirmation code'
    : 'Seu código de confirmação TalkToStellar';
  const text = input.language === 'en'
    ? [
        `Your code to ${actionEn} is ${input.code}.`,
        `It expires in ${input.expiresInMinutes} minutes.`,
        'If this was not you, ignore this email.',
      ].join('\n')
    : [
        `Seu código para ${actionPt} é ${input.code}.`,
        `Ele expira em ${input.expiresInMinutes} minutos.`,
        'Se não foi você, ignore este e-mail.',
      ].join('\n');
  const html = input.language === 'en'
    ? `<p>Your code to ${actionEn} is <strong>${input.code}</strong>.</p><p>It expires in ${input.expiresInMinutes} minutes.</p><p>If this was not you, ignore this email.</p>`
    : `<p>Seu código para ${actionPt} é <strong>${input.code}</strong>.</p><p>Ele expira em ${input.expiresInMinutes} minutos.</p><p>Se não foi você, ignore este e-mail.</p>`;

  return {
    to: input.to,
    subject,
    text,
    html,
  };
}

async function sendViaSendGrid(message: EmailMessage): Promise<boolean> {
  const apiKey = String(process.env.SENDGRID_API_KEY || '').trim();
  if (!apiKey) return false;

  const from = parseFromAddress(fromAddress());
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: message.to }] }],
      from,
      subject: message.subject,
      content: [
        { type: 'text/plain', value: message.text },
        { type: 'text/html', value: message.html },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`SendGrid email failed: ${response.status} ${body}`);
  }
  return true;
}

async function sendViaResend(message: EmailMessage): Promise<boolean> {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend email failed: ${response.status} ${body}`);
  }
  return true;
}

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmac(key: crypto.BinaryLike, value: string): Buffer {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

function getSesRegion(): string {
  return String(
    process.env.AWS_SES_REGION ||
      process.env.SES_REGION ||
      process.env.AWS_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      'sa-east-1'
  ).trim();
}

function getSesEndpoint(region: string): URL {
  const configured = String(process.env.AWS_SES_ENDPOINT || '').trim();
  return new URL(configured || `https://email.${region}.amazonaws.com/v2/email/outbound-emails`);
}

function signSesRequest(input: {
  payload: string;
  region: string;
  endpoint: URL;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  now?: Date;
}): Record<string, string> {
  const now = input.now || new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = input.endpoint.host;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host,
    'x-amz-date': amzDate,
  };
  if (input.sessionToken) headers['x-amz-security-token'] = input.sessionToken;

  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join('');
  const canonicalRequest = [
    'POST',
    input.endpoint.pathname,
    input.endpoint.searchParams.toString(),
    canonicalHeaders,
    signedHeaders,
    sha256Hex(input.payload),
  ].join('\n');
  const credentialScope = `${dateStamp}/${input.region}/ses/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = hmac(
    hmac(hmac(hmac(Buffer.from(`AWS4${input.secretAccessKey}`, 'utf8'), dateStamp), input.region), 'ses'),
    'aws4_request'
  );
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  return {
    ...headers,
    authorization: [
      `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', '),
  };
}

async function sendViaSes(message: EmailMessage): Promise<boolean> {
  const accessKeyId = String(process.env.AWS_SES_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.AWS_SES_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  if (!accessKeyId || !secretAccessKey) return false;

  const region = getSesRegion();
  const endpoint = getSesEndpoint(region);
  const payload = JSON.stringify({
    FromEmailAddress: fromAddress(),
    Destination: {
      ToAddresses: [message.to],
    },
    Content: {
      Simple: {
        Subject: {
          Data: message.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: message.text,
            Charset: 'UTF-8',
          },
          Html: {
            Data: message.html,
            Charset: 'UTF-8',
          },
        },
      },
    },
  });
  const headers = signSesRequest({
    payload,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    sessionToken: String(process.env.AWS_SES_SESSION_TOKEN || process.env.AWS_SESSION_TOKEN || '').trim() || undefined,
  });

  const response = await fetch(endpoint.toString(), {
    method: 'POST',
    headers,
    body: payload,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AWS SES email failed: ${response.status} ${body}`);
  }
  return true;
}

async function sendViaWebhook(message: EmailMessage): Promise<boolean> {
  const url = String(process.env.EMAIL_CONFIRMATION_WEBHOOK_URL || process.env.EMAIL_WEBHOOK_URL || '').trim();
  if (!url) return false;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.EMAIL_CONFIRMATION_WEBHOOK_SECRET
        ? { Authorization: `Bearer ${process.env.EMAIL_CONFIRMATION_WEBHOOK_SECRET}` }
        : {}),
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Email webhook failed: ${response.status} ${body}`);
  }
  return true;
}

async function sendEmail(message: EmailMessage): Promise<void> {
  const provider = configuredEmailProvider();
  if (provider === 'ses' && await sendViaSes(message)) return;
  if (provider === 'resend' && await sendViaResend(message)) return;
  if (provider === 'sendgrid' && await sendViaSendGrid(message)) return;
  if (provider === 'webhook' && await sendViaWebhook(message)) return;

  if (!provider) {
    if (await sendViaResend(message)) return;
    if (await sendViaSendGrid(message)) return;
    if (await sendViaWebhook(message)) return;
    if (await sendViaSes(message)) return;
  }

  if (allowDevCodeResponse()) {
    logger.warn(`[email-confirmation] DEV email fallback for ${message.to}: ${message.text}`);
    return;
  }

  throw new EmailConfirmationError(
    'EMAIL_PROVIDER_MISSING',
    'Email sending is not configured on the server. Set EMAIL_CONFIRMATION_PROVIDER=ses with AWS SES credentials, RESEND_API_KEY, SENDGRID_API_KEY or EMAIL_CONFIRMATION_WEBHOOK_URL.',
    500
  );
}

export class EmailConfirmationService {
  static isEnabled(): boolean {
    return emailConfirmationEnabled();
  }

  static maskEmail(email: string): string {
    return maskEmail(normalizeEmail(email));
  }

  static async sendTransactional(message: EmailMessage): Promise<void> {
    await sendEmail(message);
  }

  static async isAccountEmailVerified(input: {
    email?: string | null;
    sessionId?: string | null;
    userId?: string | null;
  }): Promise<boolean> {
    const email = normalizeEmail(input.email);
    const sessionId = String(input.sessionId || '').trim();
    const userId = normalizeEmail(input.userId);

    const select = 'session_id, user_id, email, email_verified, email_verified_at, email_verification_source, created_at, updated_at';
    try {
      const candidates: any[] = [];

      if (sessionId) {
        const { data, error } = await supabase
          .from('agent_sessions')
          .select(select)
          .eq('session_id', sessionId)
          .limit(1);
        if (error) {
          if (isMissingEmailVerificationColumnError(error)) return false;
          throw error;
        }
        candidates.push(...(data || []));
      }

      if (email) {
        const byEmail = await supabase
          .from('agent_sessions')
          .select(select)
          .eq('email', email)
          .order('updated_at', { ascending: false })
          .limit(3);
        if (byEmail.error) {
          if (isMissingEmailVerificationColumnError(byEmail.error)) return false;
          throw byEmail.error;
        }
        candidates.push(...(byEmail.data || []));

        const byUserId = await supabase
          .from('agent_sessions')
          .select(select)
          .eq('user_id', email)
          .order('updated_at', { ascending: false })
          .limit(3);
        if (byUserId.error) {
          if (isMissingEmailVerificationColumnError(byUserId.error)) return false;
          throw byUserId.error;
        }
        candidates.push(...(byUserId.data || []));
      } else if (userId) {
        const byUserId = await supabase
          .from('agent_sessions')
          .select(select)
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(3);
        if (byUserId.error) {
          if (isMissingEmailVerificationColumnError(byUserId.error)) return false;
          throw byUserId.error;
        }
        candidates.push(...(byUserId.data || []));
      }

      return candidates.some((row) => isLegacyEmailVerifiedRow(row));
    } catch (error) {
      logger.warn(`[email-confirmation] could not read account email verification state: ${String((error as any)?.message || error)}`);
      return false;
    }
  }

  static async markAccountEmailVerified(input: {
    email?: string | null;
    sessionId?: string | null;
    userId?: string | null;
    source?: string | null;
  }): Promise<void> {
    const email = normalizeEmail(input.email);
    const sessionId = String(input.sessionId || '').trim();
    const userId = normalizeEmail(input.userId);
    const now = new Date().toISOString();
    const patch = {
      email_verified: true,
      email_verified_at: now,
      email_verification_source: String(input.source || 'email_confirmation').trim() || 'email_confirmation',
      updated_at: now,
    };

    try {
      if (sessionId) {
        const { error } = await supabase
          .from('agent_sessions')
          .update(patch)
          .eq('session_id', sessionId);
        if (error) {
          if (isMissingEmailVerificationColumnError(error)) return;
          throw error;
        }
        return;
      }

      if (email) {
        const byEmail = await supabase
          .from('agent_sessions')
          .update(patch)
          .eq('email', email);
        if (byEmail.error) {
          if (isMissingEmailVerificationColumnError(byEmail.error)) return;
          throw byEmail.error;
        }

        const byUserId = await supabase
          .from('agent_sessions')
          .update(patch)
          .eq('user_id', email);
        if (byUserId.error) {
          if (isMissingEmailVerificationColumnError(byUserId.error)) return;
          throw byUserId.error;
        }
        return;
      }

      if (userId) {
        const { error } = await supabase
          .from('agent_sessions')
          .update(patch)
          .eq('user_id', userId);
        if (error) {
          if (isMissingEmailVerificationColumnError(error)) return;
          throw error;
        }
      }
    } catch (error) {
      logger.warn(`[email-confirmation] could not persist verified email state: ${String((error as any)?.message || error)}`);
    }
  }

  static async requireVerified(input: RequireVerifiedInput): Promise<RequireVerifiedResult> {
    const email = normalizeEmail(input.email);
    const language = normalizeLanguage(input.language);

    if (!emailConfirmationEnabled()) {
      return {
        verified: true,
        email,
        maskedEmail: email ? maskEmail(email) : '',
        message: language === 'en'
          ? 'Email confirmation is disabled.'
          : 'Confirmação por e-mail desativada.',
      };
    }

    if (!email || !looksLikeEmail(email)) {
      throw new EmailConfirmationError('EMAIL_REQUIRED', genericEmailMessage('EMAIL_REQUIRED', language), 400);
    }

    const code = String(input.code || '').replace(/\D+/g, '').trim();
    if (code) {
      await this.verifyCode({ email, purpose: input.purpose, code, language });
      return {
        verified: true,
        email,
        maskedEmail: maskEmail(email),
        message: language === 'en' ? 'Email confirmed.' : 'E-mail confirmado.',
      };
    }

    return this.requestCode({
      email,
      purpose: input.purpose,
      language,
      metadata: input.metadata,
    });
  }

  private static async requestCode(input: {
    email: string;
    purpose: EmailConfirmationPurpose;
    language: Language;
    metadata?: Record<string, unknown>;
  }): Promise<RequireVerifiedResult> {
    const ttlSeconds = getTtlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    const latest = await this.getLatestPending(input.email, input.purpose);
    const cooldownSeconds = getRequestCooldownSeconds();
    if (latest?.created_at && cooldownSeconds > 0) {
      const createdAt = Date.parse(String((latest as any).created_at || ''));
      if (Number.isFinite(createdAt) && Date.now() - createdAt < cooldownSeconds * 1000) {
        throw new EmailConfirmationError('EMAIL_CODE_RECENT', genericEmailMessage('EMAIL_CODE_RECENT', input.language), 429);
      }
    }

    const code = generateCode();
    const codeHash = hashCode(input.email, input.purpose, code);
    const now = new Date().toISOString();
    const { error: cleanupError } = await supabase
      .from('email_confirmations')
      .update({
        used_at: now,
        updated_at: now,
      })
      .eq('email', input.email)
      .eq('purpose', input.purpose)
      .is('used_at', null);
    if (cleanupError) handleEmailConfirmationStorageError(cleanupError);

    const insertPayload = {
      email: input.email,
      purpose: input.purpose,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      metadata: input.metadata || {},
      created_at: now,
      updated_at: now,
    };

    const { error } = await supabase.from('email_confirmations').insert(insertPayload);
    if (error) {
      handleEmailConfirmationStorageError(error);
    }

    const message = buildMessage({
      to: input.email,
      code,
      purpose: input.purpose,
      language: input.language,
      expiresInMinutes: Math.max(1, Math.ceil(ttlSeconds / 60)),
    });
    await sendEmail(message);

    return {
      verified: false,
      email: input.email,
      maskedEmail: maskEmail(input.email),
      expiresAt,
      devCode: allowDevCodeResponse() ? code : undefined,
      message: input.language === 'en'
        ? `We sent a confirmation code to ${maskEmail(input.email)}. Enter it to continue.`
        : `Enviamos um código de confirmação para ${maskEmail(input.email)}. Informe o código para continuar.`,
    };
  }

  private static async verifyCode(input: {
    email: string;
    purpose: EmailConfirmationPurpose;
    code: string;
    language: Language;
  }): Promise<void> {
    if (!/^\d{6}$/.test(input.code)) {
      throw new EmailConfirmationError('EMAIL_CODE_INVALID', genericEmailMessage('EMAIL_CODE_INVALID', input.language), 401);
    }

    const codeHash = hashCode(input.email, input.purpose, input.code);
    const { data, error } = await supabase
      .from('email_confirmations')
      .select('id, attempts, expires_at, used_at')
      .eq('email', input.email)
      .eq('purpose', input.purpose)
      .eq('code_hash', codeHash)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      handleEmailConfirmationStorageError(error);
    }

    if (!data) {
      await this.incrementLatestAttempt(input.email, input.purpose);
      throw new EmailConfirmationError('EMAIL_CODE_INVALID', genericEmailMessage('EMAIL_CODE_INVALID_OR_EXPIRED', input.language), 401);
    }

    const attempts = Number((data as any)?.attempts || 0);
    if (attempts >= getMaxAttempts()) {
      throw new EmailConfirmationError('EMAIL_CODE_LOCKED', genericEmailMessage('EMAIL_CODE_LOCKED', input.language), 429);
    }

    const expiresAt = Date.parse(String((data as any)?.expires_at || ''));
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      throw new EmailConfirmationError('EMAIL_CODE_EXPIRED', genericEmailMessage('EMAIL_CODE_EXPIRED', input.language), 401);
    }

    const { error: updateError } = await supabase
      .from('email_confirmations')
      .update({
        used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', String((data as any).id));

    if (updateError) handleEmailConfirmationStorageError(updateError);
  }

  private static async incrementLatestAttempt(email: string, purpose: EmailConfirmationPurpose): Promise<void> {
    const { data, error } = await supabase
      .from('email_confirmations')
      .select('id, attempts')
      .eq('email', email)
      .eq('purpose', purpose)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return;

    await supabase
      .from('email_confirmations')
      .update({
        attempts: Number((data as any)?.attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', String((data as any).id));
  }

  private static async getLatestPending(email: string, purpose: EmailConfirmationPurpose): Promise<any | null> {
    const { data, error } = await supabase
      .from('email_confirmations')
      .select('id, created_at, expires_at')
      .eq('email', email)
      .eq('purpose', purpose)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      handleEmailConfirmationStorageError(error);
    }
    return data || null;
  }
}
