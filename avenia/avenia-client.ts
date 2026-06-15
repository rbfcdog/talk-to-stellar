// Avenia API Client — Sandbox
// Base: https://api.sandbox.avenia.io:10952/v2

const BASE_URL = "https://api.sandbox.avenia.io:10952/v2";

export type AveniaConfig = {
  email: string;
  password: string;
  name?: string;
  accountType?: string;
  accessToken?: string;
  refreshToken?: string;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};

export type AveniaError = {
  error: string;
  extraInfo?: string;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    let parsed: AveniaError;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { error: text || `HTTP ${res.status}` };
    }
    throw parsed;
  }

  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function createAccount(config: AveniaConfig): Promise<void> {
  return request("/auth/create", {
    method: "POST",
    body: JSON.stringify({
      email: config.email,
      password: config.password,
      confirmPassword: config.password,
      name: config.name || "TalkToStellar",
      accountType: config.accountType || "INDIVIDUAL",
    }),
  });
}

export async function login(
  email: string,
  password: string,
): Promise<{ success: true }> {
  // Login sends an email token to the inbox.
  // Returns 200 OK on success (token sent to email).
  await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return { success: true };
}

export function validateLogin(
  email: string,
  emailToken: string,
): Promise<TokenPair> {
  return request<TokenPair>("/auth/validate-login", {
    method: "POST",
    body: JSON.stringify({ email, emailToken }),
  });
}

export function refreshToken(refreshToken: string): Promise<TokenPair> {
  return request<TokenPair>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export function withAuth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// Run if called directly
async function main() {
  const email = process.env.AVENIA_EMAIL || "team.talktostellar@gmail.com";
  const password =
    process.env.AVENIA_PASSWORD || "Avenia@2026Strong!";

  console.log(`Avenia Sandbox Client`);
  console.log(`Base: ${BASE_URL}`);
  console.log(`Email: ${email}`);
  console.log();

  // Step 1: Create account
  console.log("1. Creating account...");
  try {
    await createAccount({ email, password });
    console.log("   OK — account created (201)");
  } catch (err) {
    console.log("   Create error:", (err as AveniaError).error || err);
  }

  // Step 2: Login
  console.log("2. Logging in...");
  try {
    await login(email, password);
    console.log("   OK — email token sent to inbox");
  } catch (err) {
    const e = err as AveniaError;
    console.log(`   Login error: ${e.error}${e.extraInfo ? ` (${e.extraInfo})` : ""}`);
    console.log();
    console.log("   >>> Provide the email token to continue:");
    console.log("   >>>   npx tsx avenia/avenia-client.ts validate <email-token>");
  }

  // Step 3 (if token provided)
  const token = process.argv[2];
  const tokenArg = process.argv[3];
  if (token === "validate" && tokenArg) {
    console.log();
    console.log("3. Validating login...");
    try {
      const tokens = await validateLogin(email, tokenArg);
      console.log("   OK — tokens received:");
      console.log("   accessToken:", tokens.accessToken.slice(0, 30) + "...");
      console.log("   refreshToken:", tokens.refreshToken.slice(0, 30) + "...");
    } catch (err) {
      console.log("   Validate error:", (err as AveniaError).error || err);
    }
  }

  if (token === "refresh" && tokenArg) {
    console.log();
    console.log("4. Refreshing token...");
    try {
      const tokens = await refreshToken(tokenArg);
      console.log("   OK — new tokens:");
      console.log("   accessToken:", tokens.accessToken.slice(0, 30) + "...");
      console.log("   refreshToken:", tokens.refreshToken.slice(0, 30) + "...");
    } catch (err) {
      console.log("   Refresh error:", (err as AveniaError).error || err);
    }
  }
}

// Only run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("avenia-client.ts") || process.argv[1]?.endsWith("avenia-client.js")) {
  main().catch(console.error);
}

export default {
  createAccount,
  login,
  validateLogin,
  refreshToken,
  withAuth,
};
