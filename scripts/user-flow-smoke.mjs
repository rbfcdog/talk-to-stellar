#!/usr/bin/env node

import crypto from "node:crypto";

const frontendBaseUrl = (
  process.env.USER_FLOW_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");
const language = process.env.USER_FLOW_LANGUAGE || "pt-BR";
const sessionId = process.env.USER_FLOW_SESSION_ID || "";
const sessionToken = process.env.USER_FLOW_SESSION_TOKEN || "";

const rawErrorPatterns = [
  /Agent API Error/i,
  /schema cache/i,
  /Could not find the table/i,
  /relation .* does not exist/i,
  /Check BACKEND_URL/i,
  /SUPABASE/i,
  /JWT_SECRET/i,
  /stack trace/i,
  /TypeError:/i,
  /ReferenceError:/i,
  /Unhandled/i,
  /private key/i,
  /seed phrase/i,
  /secret key/i,
];

const pages = [
  "/",
  "/chat",
  "/login",
  "/create-account",
  "/pix-on?amount=10&asset=BRL&from=chat&flow=fund_and_pay&recipient=Ana%20Silva&auto_pay_after_ramp=1",
  "/pay-anyone?amount=10&asset=USDC",
  "/transactions",
];

const loggedOutPromptScenarios = [
  {
    name: "greeting asks for account access",
    prompt: "ola",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
  },
  {
    name: "balance asks for account access",
    prompt: "saldo",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
  },
  {
    name: "contacts asks for account access",
    prompt: "contatos",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
  },
  {
    name: "PIX add-money asks for account access",
    prompt: "quero colocar 10 reais via pix",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
  },
  {
    name: "PIX-to-recipient does not leak internals while logged out",
    prompt: "quero mandar 10 brl em pix pra ana silva",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
  },
  {
    name: "conversion asks for account access",
    prompt: "converter 10 reais para dolares",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
  },
  {
    name: "history asks for account access",
    prompt: "historico",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
  },
];

const authenticatedPromptScenarios = [
  {
    name: "balance returns account balance copy",
    prompt: "saldo",
    mustMatch: [/saldo|balance/i],
    mustNotMatch: [/criar sua conta|create your account/i],
  },
  {
    name: "contacts returns recipients copy",
    prompt: "contatos",
    mustMatch: [/destinat[aá]rios|contatos|contacts|recipients/i],
    mustNotMatch: [/criar sua conta|create your account/i],
  },
  {
    name: "PIX add-money returns PIX route",
    prompt: "quero colocar 10 reais via pix",
    mustMatch: [/pix/i, /\/pix-on|\/r\//i, /10/i],
    mustNotMatch: [/criar sua conta|create your account/i],
  },
  {
    name: "PIX recipient payment preserves recipient and amount",
    prompt: "quero mandar 10 brl em pix pra ana silva",
    mustMatch: [/pix/i, /ana silva/i, /\/pix-on|\/r\//i, /10/i],
    mustNotMatch: [/criar sua conta|create your account/i],
  },
  {
    name: "payment link prompt returns Pay Anyone page",
    prompt: "criar link de pagamento de 25 reais",
    mustMatch: [/link de pagamento|payment link|\/pay-anyone/i, /25/i],
    mustNotMatch: [/criar sua conta|create your account/i],
  },
];

function fail(message) {
  throw new Error(message);
}

function assertNoRawError(content, label) {
  for (const pattern of rawErrorPatterns) {
    if (pattern.test(content)) {
      fail(`${label}: leaked raw/internal error matching ${pattern}`);
    }
  }
}

function assertMatches(content, patterns, label) {
  for (const pattern of patterns || []) {
    if (!pattern.test(content)) {
      fail(`${label}: response did not match ${pattern}. Response: ${content.slice(0, 500)}`);
    }
  }
}

function assertNotMatches(content, patterns, label) {
  for (const pattern of patterns || []) {
    if (pattern.test(content)) {
      fail(`${label}: response unexpectedly matched ${pattern}. Response: ${content.slice(0, 500)}`);
    }
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text || "{}");
  } catch {
    return { raw: text };
  }
}

async function checkPage(path) {
  const response = await fetch(`${frontendBaseUrl}${path}`, { cache: "no-store" });
  const body = await response.text();
  if (!response.ok) {
    fail(`GET ${path}: expected 2xx, got ${response.status}`);
  }
  assertNoRawError(body, `GET ${path}`);
  return { status: response.status };
}

async function postChatScenario(scenario, mode) {
  const isAuthenticated = mode === "authenticated";
  const requestSessionId = isAuthenticated ? sessionId : crypto.randomUUID();
  const browserId = isAuthenticated
    ? ""
    : `smoke-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
  const headers = {
    "content-type": "application/json",
    "idempotency-key": `user-flow-smoke-${mode}-${crypto.randomUUID()}`,
  };
  if (isAuthenticated) {
    headers.cookie = [
      `tts_session_id=${encodeURIComponent(sessionId)}`,
      `tts_session_token=${encodeURIComponent(sessionToken)}`,
    ].join("; ");
  }

  const response = await fetch(`${frontendBaseUrl}/api/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session_id: requestSessionId,
      source: "web",
      language,
      messages: [{ role: "user", content: scenario.prompt }],
      metadata: {
        language,
        browser_id: browserId,
      },
    }),
  });
  const payload = await readJson(response);
  const content = String(payload.content || payload.message || payload.error || payload.raw || "");
  if (!response.ok) {
    fail(`${mode} prompt "${scenario.prompt}": expected 2xx, got ${response.status}: ${content}`);
  }
  if (!content.trim()) {
    fail(`${mode} prompt "${scenario.prompt}": empty assistant response`);
  }
  assertNoRawError(content, `${mode} prompt "${scenario.prompt}"`);
  assertMatches(content, scenario.mustMatch, `${mode} prompt "${scenario.prompt}"`);
  assertNotMatches(content, scenario.mustNotMatch, `${mode} prompt "${scenario.prompt}"`);
  return {
    status: response.status,
    action: payload.action || null,
    intent: payload.intent || null,
    onboardingRequired: Boolean(payload.onboardingRequired),
    preview: content.replace(/\s+/g, " ").slice(0, 160),
  };
}

async function main() {
  const results = [];

  for (const page of pages) {
    const result = await checkPage(page);
    results.push({ type: "page", name: page, ...result });
  }

  for (const scenario of loggedOutPromptScenarios) {
    const result = await postChatScenario(scenario, "logged-out");
    results.push({ type: "chat", name: scenario.name, ...result });
  }

  if (sessionId && sessionToken) {
    for (const scenario of authenticatedPromptScenarios) {
      const result = await postChatScenario(scenario, "authenticated");
      results.push({ type: "chat-auth", name: scenario.name, ...result });
    }
  } else {
    results.push({
      type: "chat-auth",
      name: "authenticated prompt scenarios",
      status: "skipped",
      preview: "Set USER_FLOW_SESSION_ID and USER_FLOW_SESSION_TOKEN to validate logged-in chat prompts through the frontend proxy.",
    });
  }

  console.log(JSON.stringify({
    ok: true,
    frontendBaseUrl,
    language,
    checked: results.length,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    frontendBaseUrl,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
