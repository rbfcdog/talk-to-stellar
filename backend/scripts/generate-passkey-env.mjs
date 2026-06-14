#!/usr/bin/env node

import { writeFileSync } from "node:fs";

const DEFAULTS = {
  origin: "http://localhost:3000",
  rpName: "TalkToStellar",
  challengeTtlSeconds: "900",
  operationTimeoutMs: "180000",
  userVerification: "preferred",
  network: "testnet",
};

function usage() {
  return `Generate passkey/WebAuthn envs from the exact frontend URL.

Usage:
  npm run passkey:env -- --origin http://localhost:3000
  npm run passkey:env -- --origin https://app.example.com
  npm run passkey:env -- --origin https://app.example.com --verifier C... --context-rule-id 1
  npm run passkey:env -- --smart-account-only --network testnet
  npm run passkey:env -- --smart-account-only --network testnet --verifier C... --context-rule-id 1
  npm run passkey:env -- --origin https://app.example.com --write .env.passkey

Options:
  --origin <url>              Exact frontend origin opened by users. Default: ${DEFAULTS.origin}
  --rp-name <name>            Name shown by browser passkey prompt. Default: ${DEFAULTS.rpName}
  --challenge-ttl <seconds>   WebAuthn challenge TTL. Default: ${DEFAULTS.challengeTtlSeconds}
  --timeout-ms <ms>           Browser operation timeout. Default: ${DEFAULTS.operationTimeoutMs}
  --user-verification <mode>  preferred|required|discouraged. Default: ${DEFAULTS.userVerification}
  --network <network>         testnet|mainnet. Default: ${DEFAULTS.network}
  --verifier <C...>           Soroban WebAuthn/P-256 verifier contract address.
  --context-rule-id <id>      Existing OpenZeppelin smart account context rule id.
  --smart-account-only        Output only PASSKEY_SMART_ACCOUNT_NETWORK, verifier, and context rule id.
  --write <path>              Write output to a file instead of stdout.
  --help                      Show this help.
`;
}

function parseArgs(argv) {
  const options = { ...DEFAULTS, verifier: "", contextRuleId: "", write: "", smartAccountOnly: false };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--smart-account-only") {
      options.smartAccountOnly = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
      const key = rawKey.trim();
      const value = inlineValue !== undefined ? inlineValue : argv[index + 1];
      if (inlineValue === undefined) index += 1;
      if (value === undefined || String(value).startsWith("--")) {
        throw new Error(`Missing value for --${key}`);
      }
      assignOption(options, key, String(value));
      continue;
    }
    positional.push(arg);
  }

  if (positional[0] && options.origin === DEFAULTS.origin) {
    options.origin = positional[0];
  }

  return options;
}

function assignOption(options, key, value) {
  const normalized = key.toLowerCase();
  if (normalized === "origin" || normalized === "frontend-url" || normalized === "url") options.origin = value;
  else if (normalized === "rp-name" || normalized === "name") options.rpName = value;
  else if (normalized === "challenge-ttl" || normalized === "challenge-ttl-seconds") options.challengeTtlSeconds = value;
  else if (normalized === "timeout-ms" || normalized === "operation-timeout-ms") options.operationTimeoutMs = value;
  else if (normalized === "user-verification") options.userVerification = value;
  else if (normalized === "network") options.network = value;
  else if (normalized === "verifier" || normalized === "p256-verifier" || normalized === "p256-verifier-address") options.verifier = value;
  else if (normalized === "context-rule-id" || normalized === "rule-id") options.contextRuleId = value;
  else if (normalized === "smart-account-only") options.smartAccountOnly = ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
  else if (normalized === "write" || normalized === "out" || normalized === "output") options.write = value;
  else throw new Error(`Unknown option --${key}`);
}

function parseOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`Invalid --origin URL: ${value}`);
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("--origin must be only the frontend origin, without user info, query, or hash.");
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error("--origin must not include a path. Use the base URL, for example https://app.example.com");
  }

  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(isLocalhost && parsed.protocol === "http:")) {
    throw new Error("Production passkeys require HTTPS. Only localhost may use http://.");
  }

  return {
    origin: parsed.origin,
    rpId: parsed.hostname,
    isLocalhost,
  };
}

function validateOptions(options) {
  const challengeTtl = Number(options.challengeTtlSeconds);
  if (!Number.isInteger(challengeTtl) || challengeTtl < 60 || challengeTtl > 86400) {
    throw new Error("--challenge-ttl must be an integer between 60 and 86400 seconds.");
  }

  const timeoutMs = Number(options.operationTimeoutMs);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 30000 || timeoutMs > 600000) {
    throw new Error("--timeout-ms must be an integer between 30000 and 600000 milliseconds.");
  }

  const verification = String(options.userVerification).trim().toLowerCase();
  if (!["preferred", "required", "discouraged"].includes(verification)) {
    throw new Error("--user-verification must be preferred, required, or discouraged.");
  }
  options.userVerification = verification;

  const network = String(options.network).trim().toLowerCase();
  if (!["testnet", "mainnet"].includes(network)) {
    throw new Error("--network must be testnet or mainnet.");
  }
  options.network = network;

  const verifier = String(options.verifier || "").trim();
  if (verifier && !/^C[A-Z2-7]{10,}$/.test(verifier)) {
    throw new Error("--verifier must be a Soroban contract address starting with C.");
  }
  options.verifier = verifier;

  const contextRuleId = String(options.contextRuleId || "").trim();
  if (contextRuleId && !/^\d+$/.test(contextRuleId)) {
    throw new Error("--context-rule-id must be an integer id created on the smart account.");
  }
  options.contextRuleId = contextRuleId;
}

function buildEnv(options) {
  const { origin, rpId, isLocalhost } = parseOrigin(options.origin);
  validateOptions(options);

  if (options.smartAccountOnly) {
    return [
      `PASSKEY_SMART_ACCOUNT_NETWORK=${options.network}`,
      `PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=${options.verifier}`,
      `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=${options.contextRuleId}`,
      "",
    ].join("\n");
  }

  const smartAccountReady = Boolean(options.verifier && options.contextRuleId);
  const smartAccountEnabled = smartAccountReady ? "true" : "false";
  const warningLines = [];

  if (!smartAccountReady) {
    warningLines.push("# Smart account stays disabled because verifier C... and context rule id were not supplied.");
    warningLines.push("# This is correct for passkey-only browser registration/login.");
  }
  if (!isLocalhost && !origin.startsWith("https://")) {
    warningLines.push("# WARNING: production origins must be HTTPS for browser passkeys.");
  }

  return [
    "# Generated by backend/scripts/generate-passkey-env.mjs",
    `# Frontend origin: ${origin}`,
    "",
    "# Frontend env",
    "NEXT_PUBLIC_PASSKEY_ENABLED=true",
    "",
    "# Backend env",
    `PASSKEY_RP_ID=${rpId}`,
    `PASSKEY_ORIGIN=${origin}`,
    `PASSKEY_RP_NAME=${options.rpName}`,
    `PASSKEY_CHALLENGE_TTL_SECONDS=${options.challengeTtlSeconds}`,
    `PASSKEY_OPERATION_TIMEOUT_MS=${options.operationTimeoutMs}`,
    `PASSKEY_USER_VERIFICATION=${options.userVerification}`,
    `PASSKEY_SMART_ACCOUNT_ENABLED=${smartAccountEnabled}`,
    `PASSKEY_SMART_ACCOUNT_NETWORK=${options.network}`,
    `PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=${options.verifier}`,
    `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=${options.contextRuleId}`,
    "",
    ...warningLines,
    "",
  ].join("\n");
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }

  const output = buildEnv(options);
  if (options.write) {
    writeFileSync(options.write, output, { encoding: "utf8", flag: "w" });
    process.stdout.write(`Wrote ${options.write}\n`);
  } else {
    process.stdout.write(output);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
  process.exit(1);
}
