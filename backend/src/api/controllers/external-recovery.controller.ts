import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase } from '../../config/supabase';
import { hashPassword } from '../../utils/password';

function normalizePhone(value: string): string {
  return String(value || '').replace(/\D+/g, '');
}

function otpHash(phone: string, otp: string): string {
  const secret = process.env.OTP_SECRET || process.env.JWT_SECRET || 'dev-otp-secret';
  return crypto.createHash('sha256').update(`${phone}:${otp}:${secret}`).digest('hex');
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendOtpViaWhatsApp(phone: string, otp: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!sid || !token || !from) {
    return;
  }

  const to = phone.startsWith('whatsapp:') ? phone : `whatsapp:+${phone}`;
  const body = `TalkToStellar: seu codigo de recuperacao e ${otp}. Valido por 10 minutos.`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: from,
      To: to,
      Body: body,
    }).toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Twilio send failed: ${response.status} ${text}`);
  }
}

export default class ExternalRecoveryController {
  // POST /api/external/recovery-init
  static async recoveryInit(req: Request, res: Response) {
    try {
      const phone = normalizePhone(String(req.body?.phone || ''));
      if (!phone) {
        return res.status(400).json({ success: false, message: 'phone is required' });
      }

      const [waLookup, phoneLookup] = await Promise.all([
        supabase
          .from('external_accounts')
          .select('session_id, user_id')
          .eq('provider', 'whatsapp')
          .eq('provider_user_id', phone)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('external_accounts')
          .select('session_id, user_id')
          .eq('provider', 'phone')
          .eq('provider_user_id', phone)
          .limit(1)
          .maybeSingle(),
      ]);

      const account = waLookup.data || phoneLookup.data;
      if (!account?.session_id) {
        return res.status(404).json({ success: false, message: 'No account linked to this phone number' });
      }

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const hashed = otpHash(phone, otp);

      const { error: upsertError } = await supabase
        .from('recovery_otps')
        .upsert(
          {
            phone_number: phone,
            otp_hash: hashed,
            expires_at: expiresAt,
            used_at: null,
            attempts: 0,
          },
          { onConflict: 'phone_number' }
        );

      if (upsertError) {
        return res.status(500).json({ success: false, message: upsertError.message });
      }

      try {
        await sendOtpViaWhatsApp(phone, otp);
      } catch (sendError: any) {
        if (process.env.NODE_ENV === 'production') {
          return res.status(502).json({ success: false, message: sendError?.message || 'Could not send OTP' });
        }
      }

      return res.status(200).json({
        success: true,
        message: 'OTP sent to WhatsApp',
        phone,
        // DEV-only fallback to simplify local testing
        dev_otp: process.env.NODE_ENV === 'production' ? undefined : otp,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  }

  // POST /api/external/recovery-complete
  static async recoveryComplete(req: Request, res: Response) {
    try {
      const phone = normalizePhone(String(req.body?.phone || ''));
      const otp = String(req.body?.otp || '').trim();
      const newPassword = String(req.body?.new_password || '').trim();

      if (!phone || !otp || !newPassword) {
        return res.status(400).json({ success: false, message: 'phone, otp and new_password are required' });
      }

      if (newPassword.length < 4) {
        return res.status(400).json({ success: false, message: 'new_password must have at least 4 characters' });
      }

      const { data: otpRow, error: otpError } = await supabase
        .from('recovery_otps')
        .select('*')
        .eq('phone_number', phone)
        .limit(1)
        .maybeSingle();

      if (otpError || !otpRow) {
        return res.status(400).json({ success: false, message: 'Invalid recovery request' });
      }

      if (otpRow.used_at) {
        return res.status(400).json({ success: false, message: 'OTP already used' });
      }

      if (new Date(otpRow.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ success: false, message: 'OTP expired' });
      }

      const expected = otpHash(phone, otp);
      if (expected !== String(otpRow.otp_hash || '')) {
        const attempts = Number(otpRow.attempts || 0) + 1;
        await supabase
          .from('recovery_otps')
          .update({ attempts })
          .eq('phone_number', phone);
        return res.status(401).json({ success: false, message: 'Invalid OTP' });
      }

      const [waLookup, phoneLookup] = await Promise.all([
        supabase
          .from('external_accounts')
          .select('session_id, user_id')
          .eq('provider', 'whatsapp')
          .eq('provider_user_id', phone)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('external_accounts')
          .select('session_id, user_id')
          .eq('provider', 'phone')
          .eq('provider_user_id', phone)
          .limit(1)
          .maybeSingle(),
      ]);

      const account = waLookup.data || phoneLookup.data;
      if (!account?.session_id) {
        return res.status(404).json({ success: false, message: 'No account linked to this phone number' });
      }

      const passwordHash = hashPassword(newPassword);
      const { error: updateSessionError } = await supabase
        .from('agent_sessions')
        .update({ password_hash: passwordHash })
        .eq('session_id', account.session_id);

      if (updateSessionError) {
        return res.status(500).json({ success: false, message: updateSessionError.message });
      }

      const { error: markUsedError } = await supabase
        .from('recovery_otps')
        .update({ used_at: new Date().toISOString() })
        .eq('phone_number', phone);

      if (markUsedError) {
        return res.status(500).json({ success: false, message: markUsedError.message });
      }

      return res.status(200).json({ success: true, message: 'Password reset successfully' });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  }
}
