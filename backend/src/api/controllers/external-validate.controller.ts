import { Request, Response } from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { supabase } from '../../config/supabase'
import { getQuoteExpiry, isQuoteExpired, quoteExpiryMessage } from '../services/quote-expiry.service'
import { getRequiredJwtSecret } from '../../config/secrets'

function getJwtSecret() {
  return getRequiredJwtSecret()
}

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function getOnboardingProcessingTtlSeconds(): number {
  const parsed = Number(String(process.env.ONBOARDING_PROCESSING_TTL_SECONDS || '180').trim())
  if (!Number.isFinite(parsed) || parsed <= 0) return 180
  return Math.trunc(parsed)
}

function isOnboardingProcessingStale(state: any): boolean {
  const ttlMs = getOnboardingProcessingTtlSeconds() * 1000
  const lockAtRaw = String(state?.updated_at || state?.created_at || '').trim()
  const lockAtMs = Date.parse(lockAtRaw)
  if (!Number.isFinite(lockAtMs)) return false
  return Date.now() - lockAtMs > ttlMs
}

async function readPaymentLinkState(hash: string) {
  const primary = await supabase
    .from('payment_confirmations')
    .select('used, used_at, status, expires_at')
    .eq('token_hash', hash)
    .limit(1)
    .maybeSingle()

  if (primary.error) {
    const message = String(primary.error.message || '').toLowerCase()
    if (message.includes('expires_at')) {
      const fallback = await supabase
        .from('payment_confirmations')
        .select('used, used_at, status')
        .eq('token_hash', hash)
        .limit(1)
        .maybeSingle()

      if (!fallback.error) return fallback.data
    }
    if (message.includes('payment_confirmations') || message.includes('schema cache')) return null
    throw primary.error
  }
  return primary.data
}

async function readOnboardingState(hash: string) {
  const { data, error } = await supabase
    .from('onboarding_finalizations')
    .select('used, used_at, status, result, created_at, updated_at')
    .eq('token_hash', hash)
    .limit(1)
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (message.includes('onboarding_finalizations') || message.includes('schema cache')) return null
    throw error
  }
  return data
}

async function readLogoutState(hash: string) {
  const { data, error } = await supabase
    .from('logout_confirmations')
    .select('used, used_at, status, expires_at')
    .eq('token_hash', hash)
    .limit(1)
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (message.includes('logout_confirmations') || message.includes('schema cache')) return null
    throw error
  }
  return data
}

export default class ExternalValidateController {
  // GET /api/external/validate-token?token=...
  static async validate(req: Request, res: Response) {
    try {
      const token = String(req.query.token || req.body.token || '')
      if (!token) return res.status(400).json({ success: false, message: 'token is required' })

      let payload: any
      try {
        payload = jwt.verify(token, getJwtSecret())
      } catch (err: any) {
        if (String(err?.name || '') === 'TokenExpiredError') {
          const decoded = jwt.decode(token) || {}
          return res.status(400).json({
            success: false,
            valid: false,
            expired: true,
            expired_at: err?.expiredAt ? new Date(err.expiredAt).toISOString() : null,
            message: 'Este link expirou. Solicite um novo link.',
            payload: decoded,
          })
        }
        return res.status(400).json({ success: false, valid: false, message: 'Link inválido ou expirado.' })
      }

      const sub = String(payload?.sub || '')
      const hash = tokenHash(token)

      if (['external_payment_confirm', 'external_conversion_confirm', 'external_payment_claim'].includes(sub)) {
        const state = await readPaymentLinkState(hash)
        const expiresAtRaw = (state as any)?.expires_at
        const expiresAtMs = expiresAtRaw ? Date.parse(String(expiresAtRaw)) : NaN
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
          return res.status(410).json({
            success: false,
            valid: false,
            expired: true,
            expired_at: expiresAtRaw || null,
            message: 'Este link expirou. Solicite um novo link.',
            payload,
          })
        }
        if (state?.used || String(state?.status || '').toLowerCase() === 'completed') {
          return res.status(409).json({
            success: false,
            valid: false,
            used: true,
            used_at: state?.used_at || null,
            message: 'Este link já foi utilizado. Solicite um novo link.',
            payload,
          })
        }
        if (String(state?.status || '').toLowerCase() === 'processing') {
          return res.status(409).json({
            success: false,
            valid: false,
            processing: true,
            message: 'Este link já está em processamento. Aguarde a conclusão.',
            payload,
          })
        }
        if (
          ['external_payment_confirm', 'external_conversion_confirm'].includes(sub) &&
          getQuoteExpiry(payload) &&
          isQuoteExpired(payload)
        ) {
          return res.status(400).json({
            success: false,
            valid: false,
            expiredQuote: true,
            message: quoteExpiryMessage(),
            payload,
          })
        }
      }

      if (sub === 'external_onboard') {
        const state = await readOnboardingState(hash)
        if (state?.used || String(state?.status || '').toLowerCase() === 'completed') {
          return res.status(409).json({
            success: false,
            valid: false,
            used: true,
            alreadyCompleted: true,
            used_at: state?.used_at || null,
            message: 'Este link já foi utilizado.',
            payload,
            result: state?.result || null,
          })
        }
        if (String(state?.status || '').toLowerCase() === 'processing') {
          if (isOnboardingProcessingStale(state)) {
            return res.status(200).json({
              success: true,
              valid: true,
              payload,
              staleProcessing: true,
              message: 'Foi detectado um processamento anterior interrompido. Você já pode tentar novamente.',
            })
          }
          return res.status(409).json({
            success: false,
            valid: false,
            processing: true,
            message: 'Este link de criação já está em processamento. Aguarde a conclusão.',
            payload,
          })
        }
      }

      if (sub === 'external_logout_confirm') {
        const state = await readLogoutState(hash)
        const expiresAtRaw = (state as any)?.expires_at
        const expiresAtMs = expiresAtRaw ? Date.parse(String(expiresAtRaw)) : NaN
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
          return res.status(410).json({
            success: false,
            valid: false,
            expired: true,
            expired_at: expiresAtRaw || null,
            message: 'Este link expirou. Solicite um novo link.',
            payload,
          })
        }
        if (state?.used || String(state?.status || '').toLowerCase() === 'completed') {
          return res.status(409).json({
            success: false,
            valid: false,
            used: true,
            used_at: state?.used_at || null,
            message: 'Este link já foi utilizado.',
            payload,
          })
        }
        if (String(state?.status || '').toLowerCase() === 'processing') {
          return res.status(409).json({
            success: false,
            valid: false,
            processing: true,
            message: 'Este link já está em processamento. Aguarde a conclusão.',
            payload,
          })
        }
      }

      return res.status(200).json({ success: true, valid: true, payload })
    } catch (error: any) {
      const message = error?.message || String(error)
      return res.status(500).json({ success: false, message })
    }
  }
}
