# Twilio Signature Validation Troubleshooting

## Issue: Invalid Twilio Signature

**Error**: `Invalid Twilio signature. Expected: X, Got: Y`

## How Signature Validation Works

Twilio signs every webhook request using your Auth Token. The signature is calculated as:

```
1. Get the request URL (protocol + host + path)
   Example: https://your-service.onrender.com/message

2. Get all POST parameters in alphabetical order
   Example: Body=hello, From=whatsapp:+1234567890, etc.

3. Concatenate: URL + key1 + value1 + key2 + value2 + ...
4. Sign with HMAC-SHA1 using your TWILIO_AUTH_TOKEN
5. Encode as Base64
```

When Twilio sends the request, it includes the signature in the `X-Twilio-Signature` header.

## Common Causes of Signature Mismatch

### 1. ❌ Wrong TWILIO_AUTH_TOKEN

**Most common cause!**

The token in your `.env` doesn't match the one in Twilio Console.

**Fix**:
```bash
# 1. Go to https://www.twilio.com/console
# 2. Copy your Auth Token from the main dashboard (shows as ... by default)
# 3. Update .env:
TWILIO_AUTH_TOKEN=your_exact_token_here

# 4. Restart the service
npm run build && npm run start:prod
```

**To verify the token**:
- The token should be a long random string (e.g., `abc123def456ghi789jkl012mno`)
- It should be exactly what's shown in your Twilio Console
- Don't add extra spaces or quotes

### 2. ❌ Wrong Request URL

The URL that Twilio uses to calculate the signature doesn't match your webhook URL.

**Example Problem**:
- Twilio Console Webhook URL: `https://your-service.onrender.com/message`
- Server receives request from: `https://your-service.onrender.com:443/message` (different port)
- URLs don't match → signature fails

**Fix**:
Check the debug output in your logs:
```
🔍 Signature Validation Debug:
   URL: https://your-service.onrender.com/message
   Host Header: your-service.onrender.com
   Protocol: https
```

Make sure the URL in logs matches what you configured in Twilio Console **exactly** (including protocol).

### 3. ❌ Using ngrok or localhost but misconfigured

If testing locally with ngrok:

**Problem**:
- ngrok creates a temporary URL like `https://abc123-xyz789.ngrok.io`
- If the URL changes, signature validation fails
- If you restart ngrok, you get a new URL and must update Twilio

**Fix**:
```bash
# 1. Start ngrok
ngrok http 3001

# 2. Copy the URL (e.g., https://abc123-xyz789.ngrok.io)

# 3. Update Twilio Console IMMEDIATELY with the new webhook URL:
#    https://abc123-xyz789.ngrok.io/message

# 4. Make sure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set in .env

# 5. Test the webhook

# Don't close ngrok while testing!
```

### 4. ❌ Development mode skipping validation

If `TWILIO_AUTH_TOKEN` is not set in `.env`, signature validation is skipped in development:

```
⚠️  TWILIO_AUTH_TOKEN not set. Skipping signature validation in development.
```

This is intentional - but means Twilio might still reject requests if it tries to validate on its end.

**Fix**:
```bash
# Always set TWILIO_AUTH_TOKEN, even in development
TWILIO_AUTH_TOKEN=your_token
```

## How to Debug

### Step 1: Check the Logs

When a signature fails, you should see:

```
🔍 Signature Validation Debug:
   URL: https://your-domain.com/message
   Host Header: your-domain.com
   Protocol: https
   Original URL: /message
   Body Keys: ['AccountSid', 'Body', 'From', 'MessageSid', 'NumMedia', 'To']
   Auth Token: ab12...9z99
   Received Signature: nPETUNSOp6GYaWSUdY94Dxa+5v8=
   Signature String (first 150 chars): https://your-domain.com/messageAccountSidACxxxxx...
   Calculated Signature: JgnDhndzW4/hJDUnDGj2rrcug+c=
   Match: ✗ NO

⚠️  Invalid Twilio signature!
   The signature doesn't match. This usually means:
   1. TWILIO_AUTH_TOKEN is incorrect
   2. Request URL doesn't match (check protocol/host)
   3. Body parameters have changed
```

### Step 2: Verify Each Component

**A. Verify TWILIO_AUTH_TOKEN:**

```bash
# Check what's currently set
echo $TWILIO_AUTH_TOKEN

# Get the correct one from Twilio Console:
# 1. Go to https://www.twilio.com/console
# 2. Find "Auth Token" (might be hidden, click to show)
# 3. Copy the FULL token
```

**B. Verify the URL matches Twilio Console:**

In debug output, check:
```
URL: https://your-domain.com/message
```

This should match EXACTLY what you set in:
- Twilio Console → Messaging → Services → WhatsApp → Webhook URL

**C. Verify body parameters are being received:**

In debug output, check:
```
Body Keys: ['AccountSid', 'Body', 'From', 'MessageSid', 'NumMedia', 'To']
```

All these parameters should be present.

### Step 3: Generate a Test Signature

You can manually verify the signature by using this formula:

```python
import hmac, hashlib, base64

url = "https://your-domain.com/message"
token = "your_twilio_auth_token"
params = {
    'AccountSid': 'AC12345...',
    'From': 'whatsapp:+1234567890',
    'To': 'whatsapp:+0987654321',
    'Body': 'Hello',
    'MessageSid': 'SMxxxxxxx',
    'NumMedia': '0'
}

# Build signature string (params in alphabetical order)
data = url
for key in sorted(params.keys()):
    data += key + params[key]

# Calculate HMAC-SHA1
signature = base64.b64encode(
    hmac.new(token.encode(), data.encode(), hashlib.sha1).digest()
).decode()

print(f"Expected signature: {signature}")
# Compare with what Twilio sent in X-Twilio-Signature header
```

## Checklist for Fixing

- [ ] 1. Verify TWILIO_AUTH_TOKEN is exactly correct (copy from Twilio Console)
- [ ] 2. Verify webhook URL in Twilio Console matches the one in logs
- [ ] 3. If using ngrok: Restart ngrok gets new URL? Update Twilio Console
- [ ] 4. Did you restart the service after changing .env? Restart it
- [ ] 5. Check logs - do all parameters appear in "Body Keys"?
- [ ] 6. Send a fresh test message (not cached)

## If Still Failing

1. **Enable verbose logging** - Check what signature string is being built
2. **Regenerate your Twilio Auth Token**:
   - Go to Twilio Console → Settings → Auth Token
   - Click "Regenerate" (warning: this invalidates old token)
   - Copy the new token
   - Update .env
   - Restart service

3. **Check Twilio's webhook logs**:
   - Twilio Console → Messaging → Services → Logs
   - Look for your webhook attempts
   - See if Twilio is getting any response

## Production Deployment

When deploying to production:

1. **Set environment variables in Render/Cloud Platform**:
   ```
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token (NEVER use ngrok URL here!)
   ```

2. **Update Twilio webhook URL** to your production domain:
   ```
   https://your-twilio-service.onrender.com/message
   ```

3. **Don't change the URL later** - if you do, update Twilio Console immediately

4. **Check logs in cloud dashboard** if signature validation still fails

## Quick Reference

| Issue | Solution |
|-------|----------|
| Token wrong | Get from Twilio Console, copy exactly |
| URL wrong | Check debug logs, match Twilio Console |
| Using ngrok | Update Twilio after restart |
| Still failing | Regenerate token in Twilio Console |
| Validation skipped | Set TWILIO_AUTH_TOKEN in .env |
