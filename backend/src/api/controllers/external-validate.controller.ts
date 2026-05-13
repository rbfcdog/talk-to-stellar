import { Request, Response } from 'express'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { supabase } from '../../config/supabase'
import { getQuoteExpiry, isQuoteExpired, quoteExpiryMessage } from '../services/quote-expiry.service'

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me'
}

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function readPaymentLinkState(hash: string) {
  const { data, error } = await supabase
    .from('payment_confirmations')
    .select('used, used_at, status')
    .eq('token_hash', hash)
    .limit(1)
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (message.includes('payment_confirmations') || message.includes('schema cache')) return null
    throw error
  }
  return data
}

async function readOnboardingState(hash: string) {
  const { data, error } = await supabase
    .from('onboarding_finalizations')
    .select('used, used_at, status, result')
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
        return res.status(400).json({ success: false, valid: false, message: 'Invalid or expired token' })
      }

      const sub = String(payload?.sub || '')
      const hash = tokenHash(token)
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

      if (['external_payment_confirm', 'external_conversion_confirm', 'external_payment_claim'].includes(sub)) {
        const state = await readPaymentLinkState(hash)
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
      }

      if (sub === 'external_onboard') {
        const state = await readOnboardingState(hash)
        if (state?.used || String(state?.status || '').toLowerCase() === 'completed') {
          return res.status(200).json({
            ...(state?.result || {}),
            success: true,
            valid: false,
            alreadyCompleted: true,
            message: 'Conta já criada. Reutilizando a conta existente.',
            payload,
          })
        }
        if (String(state?.status || '').toLowerCase() === 'processing') {
          return res.status(409).json({
            success: false,
            valid: false,
            processing: true,
            message: 'Este link de criação já está em processamento. Aguarde a conclusão.',
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
