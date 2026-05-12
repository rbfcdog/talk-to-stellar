import { Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { getQuoteExpiry, isQuoteExpired, quoteExpiryMessage } from '../services/quote-expiry.service'

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me'
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

      return res.status(200).json({ success: true, valid: true, payload })
    } catch (error: any) {
      const message = error?.message || String(error)
      return res.status(500).json({ success: false, message })
    }
  }
}
