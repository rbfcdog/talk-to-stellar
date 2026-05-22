#!/usr/bin/env node

import crypto from "node:crypto";

const frontendBaseUrl = (
  process.env.USER_FLOW_FRONTEND_URL ||
  process.env.FRONTEND_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");
const backendBaseUrl = (
  process.env.USER_FLOW_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:3001"
).replace(/\/$/, "");
const language = process.env.USER_FLOW_LANGUAGE || "pt-BR";
const sessionId = process.env.USER_FLOW_SESSION_ID || "";
const sessionToken = process.env.USER_FLOW_SESSION_TOKEN || "";
const repeatCount = Math.max(1, Math.min(Number(process.env.USER_FLOW_REPEAT || 1) || 1, 20));
const runDirectAgent = process.env.USER_FLOW_SKIP_DIRECT_AGENT !== "1";
const includeLlmPrompts = process.env.USER_FLOW_INCLUDE_LLM === "1";
const requestTimeoutMs = Math.max(5000, Math.min(Number(process.env.USER_FLOW_TIMEOUT_MS || 30000) || 30000, 120000));

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
  /Cannot read properties/i,
  /undefined is not/i,
  /Unhandled/i,
  /erro desconhecido/i,
  /unknown error/i,
  /private key/i,
  /seed phrase/i,
  /secret key/i,
];

const chatForbiddenPatterns = [
  /\bXLM\b/i,
  /trustline/i,
  /Horizon/i,
  /\bissuer\b/i,
  /public key|chave publica|chave pública/i,
  /session_id|session token|session_token/i,
  /Supabase/i,
];

const pages = [
  "/",
  "/chat",
  "/login",
  "/login?expired=1",
  "/create-account",
  "/pix-on?amount=10&asset=BRL&from=chat&flow=fund_and_pay&recipient=Ana%20Silva&auto_pay_after_ramp=1",
  "/pix-off?amount=5&asset=BRL&from=chat",
  "/pix-ramp?mode=onramp&amount=10&asset=BRL&from=chat",
  "/pay-anyone?amount=10&asset=USDC",
  "/claim-payment",
  "/confirm-payment",
  "/receipt",
  "/mainnet",
  "/transactions",
];

const loggedOutPromptScenarios = [
  {
    name: "greeting asks for account access",
    prompt: "ola",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "explicit login asks for account access",
    prompt: "login",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "create account asks for account access",
    prompt: "criar conta",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "balance asks for account access",
    prompt: "saldo",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "contacts asks for account access",
    prompt: "contatos",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "technical balance still asks for account access",
    prompt: "qual meu saldo tecnico em xlm?",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "PIX add-money asks for account access",
    prompt: "quero colocar 10 reais via pix",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "PIX-to-recipient does not leak internals while logged out",
    prompt: "quero mandar 10 brl em pix pra ana silva",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "PIX off-ramp asks for account access",
    prompt: "sacar 5 reais por pix",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "own PIX destination asks for account access",
    prompt: "mandar 12 reais para meu pix",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "normal payment asks for account access",
    prompt: "enviar 5 dolares para Ana",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "payment link asks for account access",
    prompt: "criar link de pagamento de 25 reais",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "conversion asks for account access",
    prompt: "converter 10 reais para dolares",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "history asks for account access",
    prompt: "historico",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
  {
    name: "receipt asks for account access",
    prompt: "quero comprovante",
    mustMatch: [/criar sua conta|create your account|entrar na sua conta|sign in/i, /\/r\/|\/create-account|\/login/i],
    expectedOnboarding: true,
  },
];

const directAgentPromptScenarios = [
  {
    name: "direct PIX add-money route",
    prompt: "quero colocar 10 reais via pix",
    mustMatch: [/pix/i, /\/pix-on|\/r\//i, /10/i],
    mustNotMatch: [/criar sua conta|create your account/i],
    expectedSuccess: true,
  },
  {
    name: "direct PIX add-money without amount asks amount",
    prompt: "quero colocar dinheiro via pix",
    mustMatch: [/qual valor|how much/i],
    expectedSuccess: false,
  },
  {
    name: "direct PIX recipient route preserves recipient",
    prompt: "quero mandar 10 brl em pix pra ana silva",
    mustMatch: [/pix/i, /ana silva/i, /\/pix-on|\/r\//i, /10/i],
    mustNotMatch: [/criar sua conta|create your account/i],
    expectedSuccess: true,
  },
  {
    name: "direct PIX recipient route with typo still routes",
    prompt: "quero fazer uma trasacao pra ana silva de 10 brl na qual eu pago via pix",
    mustMatch: [/pix/i, /ana silva/i, /\/pix-on|\/r\//i, /10/i],
    expectedSuccess: true,
  },
  {
    name: "direct PIX off-ramp route",
    prompt: "sacar 5 reais por pix",
    mustMatch: [/pix/i, /\/pix-off|\/r\//i, /5/i],
    mustNotMatch: [/criar sua conta|create your account/i],
    expectedSuccess: true,
  },
  {
    name: "direct PIX own-destination routes as withdrawal",
    prompt: "mandar 12 reais para meu pix",
    mustMatch: [/pix/i, /\/pix-off|\/r\//i, /12/i],
    expectedSuccess: true,
  },
  {
    name: "direct PIX off-ramp without amount asks amount",
    prompt: "quero sacar via pix",
    mustMatch: [/qual valor|how much/i],
    expectedSuccess: false,
  },
  {
    name: "direct USDC out of account routes as PIX off-ramp",
    prompt: "quero mandar 10 usdc pra fora da minha conta",
    mustMatch: [/pix/i, /\/pix-off|\/r\//i, /10/i],
    expectedSuccess: true,
  },
  {
    name: "direct login request returns access link",
    prompt: "quero acessar minha conta",
    mustMatch: [/entrar|sign in|criar conta|create/i, /\/r\/|\/login|\/create-account/i],
  },
  {
    name: "direct onboarding request returns access link",
    prompt: "quero criar conta",
    mustMatch: [/entrar|sign in|criar conta|create/i, /\/r\/|\/login|\/create-account/i],
  },
  {
    name: "direct language switch to English",
    prompt: "English",
    mustMatch: [/English|Done|respond/i],
    expectedSuccess: true,
  },
];

const directAgentMultiTurnScenarios = [
  {
    name: "direct PIX off-ramp amount follow-up returns link",
    prompts: ["quero sacar via pix", "5"],
    steps: [
      { mustMatch: [/qual valor|how much/i], expectedSuccess: false },
      { mustMatch: [/pix/i, /\/pix-off|\/r\//i, /5/i], expectedSuccess: true },
    ],
  },
];

const llmPromptScenarios = [
  {
    name: "LLM price quote prompt",
    prompt: "qual cotacao do dolar agora",
    mustMatch: [/estimativa|estimate|1 US\$|R\$/i],
  },
  {
    name: "LLM BRL USDC quote prompt",
    prompt: "estimativa brl usdc agora",
    mustMatch: [/estimativa|estimate|US\$|R\$/i],
  },
  {
    name: "LLM mainnet request stays account-gated or routes to console",
    prompt: "quero configurar minha carteira mainnet",
    mustMatch: [/mainnet|\/mainnet|entrar|sign in|criar conta|create|\/r\/|\/login|\/create-account/i],
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

function assertNoChatForbidden(content, label) {
  for (const pattern of chatForbiddenPatterns) {
    if (pattern.test(content)) {
      fail(`${label}: leaked user-facing technical term matching ${pattern}`);
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

function assertPayloadExpectations(payload, scenario, label) {
  if (typeof scenario.expectedSuccess === "boolean" && Boolean(payload.success) !== scenario.expectedSuccess) {
    fail(`${label}: expected success=${scenario.expectedSuccess}, got ${payload.success}`);
  }
  if (typeof scenario.expectedOnboarding === "boolean" && Boolean(payload.onboardingRequired) !== scenario.expectedOnboarding) {
    fail(`${label}: expected onboardingRequired=${scenario.expectedOnboarding}, got ${payload.onboardingRequired}`);
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

async function fetchWithTimeout(url, options = {}, label = "request") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${label}: timed out or failed after ${requestTimeoutMs}ms (${message})`);
  } finally {
    clearTimeout(timeout);
  }
}

async function checkPage(path) {
  const response = await fetchWithTimeout(`${frontendBaseUrl}${path}`, { cache: "no-store" }, `GET ${path}`);
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

  const response = await fetchWithTimeout(`${frontendBaseUrl}/api/chat`, {
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
  }, `${mode} prompt "${scenario.prompt}"`);
  const payload = await readJson(response);
  const content = String(payload.content || payload.message || payload.error || payload.raw || "");
  if (!response.ok) {
    fail(`${mode} prompt "${scenario.prompt}": expected 2xx, got ${response.status}: ${content}`);
  }
  if (!content.trim()) {
    fail(`${mode} prompt "${scenario.prompt}": empty assistant response`);
  }
  assertNoRawError(content, `${mode} prompt "${scenario.prompt}"`);
  assertNoChatForbidden(content, `${mode} prompt "${scenario.prompt}"`);
  assertMatches(content, scenario.mustMatch, `${mode} prompt "${scenario.prompt}"`);
  assertNotMatches(content, scenario.mustNotMatch, `${mode} prompt "${scenario.prompt}"`);
  assertPayloadExpectations(payload, scenario, `${mode} prompt "${scenario.prompt}"`);
  return {
    status: response.status,
    action: payload.action || null,
    intent: payload.intent || null,
    onboardingRequired: Boolean(payload.onboardingRequired),
    preview: content.replace(/\s+/g, " ").slice(0, 160),
  };
}

async function postAgentDirectScenario(scenario, repeatIndex = 0) {
  const requestSessionId = crypto.randomUUID();
  const response = await fetchWithTimeout(`${backendBaseUrl}/api/agent/query`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": `user-flow-direct-${repeatIndex}-${crypto.randomUUID()}`,
    },
    body: JSON.stringify({
      session_id: requestSessionId,
      language,
      query: scenario.prompt,
    }),
  }, `direct-agent prompt "${scenario.prompt}"`);
  const payload = await readJson(response);
  const content = String(payload.message || payload.content || payload.error || payload.raw || "");
  if (!response.ok) {
    fail(`direct-agent prompt "${scenario.prompt}": expected 2xx, got ${response.status}: ${content}`);
  }
  if (!content.trim()) {
    fail(`direct-agent prompt "${scenario.prompt}": empty assistant response`);
  }
  assertNoRawError(content, `direct-agent prompt "${scenario.prompt}"`);
  assertNoChatForbidden(content, `direct-agent prompt "${scenario.prompt}"`);
  assertMatches(content, scenario.mustMatch, `direct-agent prompt "${scenario.prompt}"`);
  assertNotMatches(content, scenario.mustNotMatch, `direct-agent prompt "${scenario.prompt}"`);
  assertPayloadExpectations(payload, scenario, `direct-agent prompt "${scenario.prompt}"`);
  return {
    status: response.status,
    action: payload.action || null,
    intent: payload.intent || null,
    success: payload.success,
    preview: content.replace(/\s+/g, " ").slice(0, 160),
  };
}

async function postAgentDirectMultiTurnScenario(scenario, repeatIndex = 0) {
  const requestSessionId = crypto.randomUUID();
  const previews = [];
  let lastPayload = null;
  for (let index = 0; index < scenario.prompts.length; index += 1) {
    const prompt = scenario.prompts[index];
    const step = scenario.steps[index] || {};
    const response = await fetchWithTimeout(`${backendBaseUrl}/api/agent/query`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `user-flow-direct-multiturn-${repeatIndex}-${index}-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        session_id: requestSessionId,
        language,
        query: prompt,
      }),
    }, `direct-agent multiturn "${scenario.name}" step ${index + 1}`);
    const payload = await readJson(response);
    const content = String(payload.message || payload.content || payload.error || payload.raw || "");
    if (!response.ok) {
      fail(`direct-agent multiturn "${scenario.name}" step ${index + 1}: expected 2xx, got ${response.status}: ${content}`);
    }
    if (!content.trim()) {
      fail(`direct-agent multiturn "${scenario.name}" step ${index + 1}: empty assistant response`);
    }
    assertNoRawError(content, `direct-agent multiturn "${scenario.name}" step ${index + 1}`);
    assertNoChatForbidden(content, `direct-agent multiturn "${scenario.name}" step ${index + 1}`);
    assertMatches(content, step.mustMatch, `direct-agent multiturn "${scenario.name}" step ${index + 1}`);
    assertNotMatches(content, step.mustNotMatch, `direct-agent multiturn "${scenario.name}" step ${index + 1}`);
    assertPayloadExpectations(payload, step, `direct-agent multiturn "${scenario.name}" step ${index + 1}`);
    previews.push(content.replace(/\s+/g, " ").slice(0, 120));
    lastPayload = payload;
  }
  return {
    status: 200,
    action: lastPayload?.action || null,
    intent: lastPayload?.intent || null,
    success: lastPayload?.success,
    preview: previews.join(" | "),
  };
}

async function main() {
  const results = [];

  for (const page of pages) {
    const result = await checkPage(page);
    results.push({ type: "page", name: page, ...result });
  }

  for (let repeat = 0; repeat < repeatCount; repeat += 1) {
    for (const scenario of loggedOutPromptScenarios) {
      const result = await postChatScenario(scenario, "logged-out");
      results.push({ type: "chat", repeat: repeat + 1, name: scenario.name, ...result });
    }
  }

  if (runDirectAgent) {
    const scenarios = includeLlmPrompts
      ? [...directAgentPromptScenarios, ...llmPromptScenarios]
      : directAgentPromptScenarios;
    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      for (const scenario of scenarios) {
        const result = await postAgentDirectScenario(scenario, repeat);
        results.push({ type: "agent-direct", repeat: repeat + 1, name: scenario.name, ...result });
      }
      for (const scenario of directAgentMultiTurnScenarios) {
        const result = await postAgentDirectMultiTurnScenario(scenario, repeat);
        results.push({ type: "agent-direct-multiturn", repeat: repeat + 1, name: scenario.name, ...result });
      }
    }
  } else {
    results.push({
      type: "agent-direct",
      name: "direct agent prompt scenarios",
      status: "skipped",
      preview: "USER_FLOW_SKIP_DIRECT_AGENT=1",
    });
  }

  if (sessionId && sessionToken) {
    for (let repeat = 0; repeat < repeatCount; repeat += 1) {
      for (const scenario of authenticatedPromptScenarios) {
        const result = await postChatScenario(scenario, "authenticated");
        results.push({ type: "chat-auth", repeat: repeat + 1, name: scenario.name, ...result });
      }
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
    backendBaseUrl,
    language,
    repeatCount,
    requestTimeoutMs,
    includeLlmPrompts,
    checked: results.length,
    results,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    frontendBaseUrl,
    backendBaseUrl,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
