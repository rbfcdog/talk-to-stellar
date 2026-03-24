import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Middleware to validate Twilio webhook requests using signature validation
 * Twilio includes X-Twilio-Signature header with HMAC signature
 */
export const validateTwilioSignature = (authToken: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get Twilio token from environment or parameter
    const twilioAuthToken = authToken || process.env.TWILIO_AUTH_TOKEN;

    // Skip validation in development if TWILIO_AUTH_TOKEN is not set
    if (!twilioAuthToken && process.env.NODE_ENV !== 'production') {
      console.warn('TWILIO_AUTH_TOKEN not set. Skipping signature validation in development.');
      return next();
    }

    if (!twilioAuthToken) {
      console.error('TWILIO_AUTH_TOKEN not configured');
      return res.status(401).json({ error: 'Twilio authentication token not configured' });
    }

    const twilioSignature = req.headers['x-twilio-signature'] as string;
    const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Twilio signature validation algorithm
    const signature = generateTwilioSignature(requestUrl, req.body, twilioAuthToken);

    if (signature !== twilioSignature) {
      console.warn(
        `Invalid Twilio signature. Expected: ${signature}, Got: ${twilioSignature}`
      );
      return res.status(401).json({ error: 'Invalid Twilio signature' });
    }

    next();
  };
};

/**
 * Generate Twilio signature for validation
 * @param url - Request URL
 * @param params - Request body parameters
 * @param authToken - Twilio Auth Token
 * @returns Base64 encoded HMAC-SHA1 signature
 */
export const generateTwilioSignature = (
  url: string,
  params: Record<string, unknown>,
  authToken: string
): string => {
  let data = url;

  // Add all body parameters to the signature data in sorted order
  const sortedKeys = Object.keys(params).sort();
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  // Generate HMAC-SHA1 signature
  const hmac = crypto.createHmac('sha1', authToken);
  hmac.update(data);
  return hmac.digest('base64');
};
