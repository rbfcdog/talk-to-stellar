import { Request, Response, NextFunction } from 'express';
import { AuditRepository } from '../repository/audit.repository';

export interface AuditRequest extends Request {
  auditSession?: string;
  auditUserAgent?: string;
  auditIpAddress?: string;
}

/**
 * Middleware to extract session and user agent info for audit logging
 */
export function auditMiddleware(req: AuditRequest, res: Response, next: NextFunction) {
  // Extract session ID from header or query
  const sessionId = (req.get('x-session-id') || req.query.session_id || req.get('authorization')) as string;
  const userAgent = req.get('user-agent');
  const ipAddress = req.ip || req.connection.remoteAddress;

  if (sessionId) {
    req.auditSession = sessionId;
    req.auditUserAgent = userAgent;
    req.auditIpAddress = ipAddress;
  }

  next();
}

/**
 * Utility function to log an audit event with session context
 */
export async function logAuditEvent(
  sessionId: string | undefined,
  eventType: string,
  metadata: any = {},
  ipAddress?: string,
  userAgent?: string
) {
  if (!sessionId) {
    console.warn('Audit log called without session_id');
    return;
  }

  try {
    await AuditRepository.logEvent(sessionId, eventType, metadata, ipAddress, userAgent);
  } catch (error) {
    console.error('Failed to log audit event:', error instanceof Error ? error.message : String(error));
    // Don't throw - audit logging failures should not break the app
  }
}

/**
 * Typed helper functions for common audit events
 */
export const AuditLogger = {
  logSessionCreated: (sessionId: string, userId: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'session_created', { user_id: userId }, ipAddress, userAgent),

  logPaymentInitiated: (sessionId: string, destination: string, amount: string, asset: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'payment_initiated', { destination, amount, asset }, ipAddress, userAgent),

  logPaymentConfirmed: (sessionId: string, hash: string, amount: string, asset: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'payment_confirmed', { transaction_hash: hash, amount, asset }, ipAddress, userAgent),

  logPasskeyRegistered: (sessionId: string, credentialId: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'passkey_registered', { credential_id: credentialId }, ipAddress, userAgent),

  logPasswordChanged: (sessionId: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'password_changed', {}, ipAddress, userAgent),

  logOnboardingCompleted: (sessionId: string, publicKey: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'onboarding_completed', { public_key: publicKey }, ipAddress, userAgent),

  logContactAdded: (sessionId: string, contactName: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'contact_added', { contact_name: contactName }, ipAddress, userAgent),

  logBalanceChecked: (sessionId: string, publicKey: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'balance_checked', { public_key: publicKey }, ipAddress, userAgent),

  logTrustlineCreated: (sessionId: string, asset: string, issuer: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'trustline_created', { asset, issuer }, ipAddress, userAgent),

  logConversionInitiated: (sessionId: string, fromAsset: string, toAsset: string, amount: string, ipAddress?: string, userAgent?: string) =>
    logAuditEvent(sessionId, 'conversion_initiated', { from_asset: fromAsset, to_asset: toAsset, amount }, ipAddress, userAgent),
};
