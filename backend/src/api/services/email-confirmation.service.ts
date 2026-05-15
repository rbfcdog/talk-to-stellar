import crypto from 'crypto';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

export type EmailConfirmationPurpose = 'create_account' | 'login';

type Language = 'pt-BR' | 'en';

type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

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

function getHashSecret(): string {
  return (
    process.env.EMAIL_CONFIRMATION_SECRET ||
    process.env.JWT_SECRET ||
    process.env.INTERNAL_API_SECRET ||
    'dev-email-confirmation-secret'
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
  return process.env.NODE_ENV !== 'production' || process.env.EMAIL_CONFIRMATION_ALLOW_DEV_CODE === 'true';
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
  if (await sendViaResend(message)) return;
  if (await sendViaSendGrid(message)) return;
  if (await sendViaWebhook(message)) return;

  if (allowDevCodeResponse()) {
    logger.warn(`[email-confirmation] DEV email fallback for ${message.to}: ${message.text}`);
    return;
  }

  throw new EmailConfirmationError(
    'EMAIL_PROVIDER_MISSING',
    'Email sending is not configured on the server. Set RESEND_API_KEY, SENDGRID_API_KEY, or EMAIL_CONFIRMATION_WEBHOOK_URL in the backend environment.',
    500
  );
}

export class EmailConfirmationService {
  static maskEmail(email: string): string {
    return maskEmail(normalizeEmail(email));
  }

  static async requireVerified(input: RequireVerifiedInput): Promise<RequireVerifiedResult> {
    const email = normalizeEmail(input.email);
    const language = normalizeLanguage(input.language);

    if (!email || !looksLikeEmail(email)) {
      throw new EmailConfirmationError('EMAIL_REQUIRED', genericEmailMessage('EMAIL_REQUIRED', language), 400);
    }

    const code = String(input.code || '').replace(/\D+/g, '').trim();
    if (code) {
      await this.verifyCode({ email, purpose: input.purpose, code });
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
    const code = generateCode();
    const codeHash = hashCode(input.email, input.purpose, code);
    const now = new Date().toISOString();
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
  }): Promise<void> {
    const language = 'en';
    if (!/^\d{6}$/.test(input.code)) {
      throw new EmailConfirmationError('EMAIL_CODE_INVALID', genericEmailMessage('EMAIL_CODE_INVALID', language), 401);
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
      throw new EmailConfirmationError('EMAIL_CODE_INVALID', genericEmailMessage('EMAIL_CODE_INVALID_OR_EXPIRED', language), 401);
    }

    const attempts = Number((data as any)?.attempts || 0);
    if (attempts >= getMaxAttempts()) {
      throw new EmailConfirmationError('EMAIL_CODE_LOCKED', genericEmailMessage('EMAIL_CODE_LOCKED', language), 429);
    }

    const expiresAt = Date.parse(String((data as any)?.expires_at || ''));
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
      throw new EmailConfirmationError('EMAIL_CODE_EXPIRED', genericEmailMessage('EMAIL_CODE_EXPIRED', language), 401);
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
}
