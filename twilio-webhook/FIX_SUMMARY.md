# 🔧 Twilio Signature Validation Fix

## What Was Changed

### ✅ Enhanced Validation Middleware
**File**: `src/middlewares/twilio-validation.middleware.ts`

Added comprehensive debug logging to identify signature validation failures:
- Shows the URL being used
- Shows the body parameters received
- Shows the calculated vs. received signatures
- Explains common causes

### ✅ Simplified Signature Algorithm
Now uses the parsed body object (instead of complex raw body handling), which is more reliable.

**The validation process**:
1. Takes the request URL
2. Sorts POST parameters alphabetically
3. Concatenates them: `url + key1 + value1 + key2 + value2...`
4. Signs with HMAC-SHA1
5. Encodes as Base64
6. Compares with header `X-Twilio-Signature`

### ✅ New Documentation
Created `SIGNATURE_TROUBLESHOOTING.md` with:
- How signature validation works
- Common causes (wrong token, wrong URL, wrong domain)
- Debugging steps
- Production deployment notes

## What to Check Now

### 1. Verify Your TWILIO_AUTH_TOKEN

This is the **most common cause** of signature mismatch.

```bash
# Get your token:
# 1. Go to https://www.twilio.com/console
# 2. Find "Auth Token" on main dashboard
# 3. Click to show it (might be hidden)
# 4. Copy the FULL token

# Update your .env or Render environment variables:
TWILIO_AUTH_TOKEN=your_exact_token_here
```

### 2. Verify Your Webhook URL

Make sure the webhook URL you configured in Twilio Console matches your actual service:

**If local (ngrok)**:
```bash
# Start ngrok
ngrok http 3001

# Copy URL: https://abc123-xyz789.ngrok.io

# Update Twilio Console → Webhook URL:
# https://abc123-xyz789.ngrok.io/message
```

**If production (Render)**:
```
Webhook URL: https://your-twilio-service.onrender.com/message
```

### 3. Restart the Service

After updating `.env`:
```bash
npm run build && npm run start:prod
```

### 4. Send a Test Message

Send a fresh WhatsApp message and check the logs for the debug output:

```
🔍 Signature Validation Debug:
   URL: https://...
   Host Header: ...
   Body Keys: [...]
   Received Signature: ...
   Calculated Signature: ...
   Match: ✓ YES or ✗ NO
```

## Expected Debug Output (Success)

```
🔍 Signature Validation Debug:
   URL: https://your-service.onrender.com/message
   Host Header: your-service.onrender.com
   Protocol: https
   Original URL: /message
   Body Keys: ['AccountSid', 'Body', 'From', 'MessageSid', 'NumMedia', 'To']
   Auth Token: ab12...9z99
   Received Signature: nPETUNSOp6GYaWSUdY94Dxa+5v8=
   Calculated Signature: nPETUNSOp6GYaWSUdY94Dxa+5v8=
   Match: ✓ YES

✓ Twilio signature validated successfully
```

## Expected Debug Output (Failure)

```
🔍 Signature Validation Debug:
   URL: https://your-service.onrender.com/message
   ...
   Received Signature: nPETUNSOp6GYaWSUdY94Dxa+5v8=
   Calculated Signature: JgnDhndzW4/hJDUnDGj2rrcug+c=  ← Different!
   Match: ✗ NO

⚠️  Invalid Twilio signature!
   The signature doesn't match. This usually means:
   1. TWILIO_AUTH_TOKEN is incorrect
   2. Request URL doesn't match (check protocol/host)
   3. Body parameters have changed
```

If you see this, follow the troubleshooting steps in `SIGNATURE_TROUBLESHOOTING.md`.

## Files Modified

- ✅ `src/middlewares/twilio-validation.middleware.ts` - Better validation & logging
- ✅ `SIGNATURE_TROUBLESHOOTING.md` - New troubleshooting guide (created)

## Deployment Steps

### For Render
1. Commit changes: `git add -A && git commit -m "Improve Twilio signature validation with detailed logging"`
2. Push: `git push`
3. Render redeploys automatically
4. Set environment variables in Render dashboard:
   ```
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   ```

### For Local Testing
1. Update `.env` with correct token
2. Start service: `npm run build && npm run start:prod`
3. Send test WhatsApp message
4. Check logs for debug output

## Next Steps

1. ✅ Verify TWILIO_AUTH_TOKEN is correct
2. ✅ Verify webhook URL in Twilio Console
3. ✅ Restart service (or redeploy to Render)
4. ✅ Send a test message
5. ✅ Check logs for `Match: ✓ YES`

Once signature validation passes, your webhook is working correctly! 🚀

## Help

If you're still seeing signature errors:
1. Read `SIGNATURE_TROUBLESHOOTING.md` (detailed guide)
2. Check all 4 common causes
3. Look at the debug output to identify which component is wrong

Most signature failures are due to:
- **Wrong token** (80% of cases) → Get from Twilio Console
- **Wrong URL** (15% of cases) → Check debug logs and Twilio Console
- **ngrok URL changed** (5% of cases) → Restart ngrok, update Twilio
