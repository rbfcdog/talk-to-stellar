import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from '../config';

/**
 * Middleware to validate Twilio webhook requests using signature validation
 * Twilio includes X-Twilio-Signature header with HMAC signature
 */
export const validateTwilioSignature = (req: Request, res: Response, next: NextFunction): void => {
  // Get Twilio token
  const twilioAuthToken = config.twilioAuthToken;

  // Skip validation in development if TWILIO_AUTH_TOKEN is not set
  if (!twilioAuthToken && config.nodeEnv !== 'production') {
    console.warn('⚠️  TWILIO_AUTH_TOKEN not set. Skipping signature validation in development.');
    return next();
  }

  if (!twilioAuthToken) {
    console.error('❌ TWILIO_AUTH_TOKEN not configured');
    res.status(401).json({ error: 'Twilio authentication token not configured' });
    return;
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string;
  const requestUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const body = req.body as Record<string, unknown>;

  // Debug logging
  console.log('🔍 Signature Validation Debug:');
  console.log(`   URL: ${requestUrl}`);
  console.log(`   Host Header: ${req.get('host')}`);
  console.log(`   Protocol: ${req.protocol}`);
  console.log(`   Original URL: ${req.originalUrl}`);
  console.log(`   Body Keys:`, Object.keys(body).sort());
  console.log(`   Auth Token: ${twilioAuthToken.substring(0, 4)}...${twilioAuthToken.substring(twilioAuthToken.length - 4)}`);
  console.log(`   Received Signature: ${twilioSignature}`);

  // Generate signature from parsed body
  const signature = generateTwilioSignature(requestUrl, body, twilioAuthToken);

  console.log(`   Calculated Signature: ${signature}`);
  console.log(`   Match: ${signature === twilioSignature ? '✓ YES' : '✗ NO'}`);

  if (signature !== twilioSignature) {
    console.warn(`⚠️  Invalid Twilio signature!`);
    console.warn(`   The signature doesn't match. This usually means:`);
    console.warn(`   1. TWILIO_AUTH_TOKEN is incorrect`);
    console.warn(`   2. Request URL doesn't match (check protocol/host)`);
    console.warn(`   3. Body parameters have changed`);
    res.status(401).json({ error: 'Invalid Twilio signature' });
    return;
  }

  console.log('✓ Twilio signature validated successfully');
  next();
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
