# Deployment Guide - Twilio Webhook Service

## Understanding the Build Error

The error `Cannot find module '/opt/render/project/src/twilio-webhook/dist/server.js'` means:
- TypeScript files weren't compiled to JavaScript
- The `dist/` folder doesn't exist
- Render tried to run Node.js directly on TypeScript code

## How We Fixed It

### 1. Updated `render.yaml`
Added explicit build command:
```yaml
buildCommand: npm install --production=false && npm run build
startCommand: node dist/server.js
```

### 2. Updated `package.json`
Added fallback build in start script:
```json
"start": "npm run build && node dist/server.js",
"start:prod": "node dist/server.js"
```

### 3. Added `Procfile`
Backup configuration for Render:
```
web: npm run build && npm run start:prod
```

## Testing Locally (IMPORTANT!)

Before redeploying, test locally:

```bash
# 1. Clean build
rm -rf dist/
rm -rf node_modules/

# 2. Install dependencies
npm install

# 3. Build TypeScript
npm run build

# 4. Verify dist folder exists
ls -la dist/

# 5. Test the app
npm run start:prod
```

## Deployment Steps

### Option A: Using Render Dashboard (Recommended)

1. Connect your GitHub repo to Render
2. Click "Settings" on your Twilio Webhook service
3. Scroll to "Build Command" and verify it shows:
   ```
   npm install --production=false && npm run build
   ```
4. Verify "Start Command" shows:
   ```
   node dist/server.js
   ```
5. Click "Manual Deploy" → "Deploy latest commit"

### Option B: Using Git Push (if auto-deploy enabled)

```bash
# Make sure you have the updated files
git add -A
git commit -m "Fix: Update build configuration for Render"
git push
```

## Verifying the Deployment

After deployment, check:

```bash
# 1. Health check endpoint
curl https://your-twilio-service.onrender.com/health

# Should return:
# {
#   "status": "OK",
#   "service": "Twilio Webhook Service",
#   "timestamp": "2024-03-24T...",
#   "config": {
#     "agentApiUrl": "...",
#     "backendApiUrl": "...",
#     "port": 3001,
#     "environment": "production"
#   }
# }

# 2. Status endpoint
curl https://your-twilio-service.onrender.com/status
```

## Environment Variables

Set these in Render Dashboard → Environment Variables:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
AGENT_API_URL=http://your-agent-service.onrender.com/api/actions/query
BACKEND_API_URL=http://your-backend-service.onrender.com
PORT=3001
NODE_ENV=production
```

## Monitoring the Build

1. Go to Render Dashboard
2. Select your "twilio-webhook" service
3. Click "Logs" tab
4. Watch for:
   - ✅ `npm install` output
   - ✅ `npm run build` running TypeScript compiler
   - ✅ `dist/` folder being created
   - ✅ `Server started on port 3001`

## Common Issues

### Build Still Fails
- **Check Node version**: Render defaults to recent Node.js (should be fine)
- **Check for syntax errors**: Run `npm run build` locally
- **Check dependencies**: `npm install` locally to verify all packages exist

### dist/ folder empty after build
- TypeScript compilation failed
- Run `npm run build` locally to see actual error
- Fix the error, commit, and redeploy

### "Cannot find module" on startup
- Means TypeScript didn't compile
- Check build logs in Render dashboard
- Verify `npm run build` runs successfully

## Debugging on Render

1. Go to Render Dashboard → your service → Logs
2. Look for error messages during deployment
3. Common patterns:
   - `npm ERR!` = npm/dependency issue
   - `tsc error` = TypeScript compilation error
   - `Cannot find module` = Missing or misnamed file

## File Structure Verification

Make sure your local twilio-webhook folder has:

```
twilio-webhook/
├── src/
│   ├── app.ts
│   ├── config.ts
│   ├── server.ts
│   ├── types.ts
│   ├── controllers/
│   │   └── webhook.controller.ts
│   ├── services/
│   │   ├── agent-api.service.ts
│   │   └── twilio-api.service.ts
│   ├── routes/
│   │   └── webhook.router.ts
│   └── middlewares/
│       ├── twilio-validation.middleware.ts
│       ├── error-handler.middleware.ts
│       └── request-logger.middleware.ts
├── package.json
├── tsconfig.json
├── render.yaml ← IMPORTANT: Must exist
├── Procfile ← Backup config
└── .gitignore
```

## Future Deployments

After initial successful deployment, future pushes to main should:
1. Automatically trigger build
2. Run `npm install --production=false && npm run build`
3. Start with `node dist/server.js`
4. Service should be live in ~1-2 minutes

## If Redeployment Fails

1. **Manual clear cache**: Render Dashboard → Service Settings → Scroll down → "Clear Build Cache"
2. **Manual Deploy**: Click "Manual Deploy" → "Deploy latest commit"
3. **Check Logs**: Watch the deployment logs for specific errors

## Webhook URL for Twilio Console

Once deployed, use this URL in Twilio console:
```
https://your-twilio-webhook-service.onrender.com/message
```

Get your service URL from Render Dashboard (e.g., `https://twilio-webhook-abc123.onrender.com`)
