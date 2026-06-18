# Avenia Auth Flow

**Base URL**: `https://api.sandbox.avenia.io:10952/v2`

## Flow

### 1. Create Account

```bash
curl -X POST "https://api.sandbox.avenia.io:10952/v2/auth/create" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "team.talktostellar@gmail.com",
    "password": "Avenia@2026Strong!",
    "confirmPassword": "Avenia@2026Strong!",
    "name": "TalkToStellar",
    "accountType": "INDIVIDUAL"
  }'
```

**Response**: `HTTP 201` — account created (empty body).

### 2. Login

```bash
curl -X POST "https://api.sandbox.avenia.io:10952/v2/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "team.talktostellar@gmail.com",
    "password": "Avenia@2026Strong!"
  }'
```

**Expected**: Email token sent to inbox.  
**Actual**: `{"error":"DoesNotExistError: user does not exist"}`

> After login succeeds, an email token is sent to the registered email inbox.

### 3. Validate Login

```bash
curl -X POST "https://api.sandbox.avenia.io:10952/v2/auth/validate-login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "team.talktostellar@gmail.com",
    "emailToken": "000000"
  }'
```

**Response**: `accessToken` + `refreshToken` JWT pair.

### 4. Refresh Token

```bash
curl -X POST "https://api.sandbox.avenia.io:10952/v2/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "eyJ..."}'
```

**Response**: New `accessToken` + `refreshToken` pair.

## Known Endpoints (discovered)

| Method | Path | Status | Notes |
|--------|------|--------|-------|
| POST | `/v2/auth/create` | 201 | Creates account, needs: email, password, confirmPassword, name, accountType=INDIVIDUAL |
| POST | `/v2/auth/login` | 200/error | Returns token via email |
| POST | `/v2/auth/validate-login` | 200/error | Exchanges emailToken for accessToken+refreshToken |
| POST | `/v2/auth/refresh` | 200/error | Rotates tokens |

## Issue

Account creation returns HTTP 201, but subsequent login returns `DoesNotExistError: user does not exist`. This suggests either:

1. The sandbox account requires email verification/activation before login
2. The `create` endpoint creates an account entity but not a user entity
3. Additional fields are required on create that the API doesn't validate for
