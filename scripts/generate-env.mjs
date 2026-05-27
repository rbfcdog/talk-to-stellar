#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  frontendUrl: "http://localhost:3000",
  backendUrl: "http://localhost:3001",
  telegramUrl: "",
  network: "testnet",
  appName: "TalkToStellar",
  visibleAssets: "TESOURO,USDC,CETES,XLM",
  passkeyTimeoutMs: "180000",
  passkeyChallengeTtlSeconds: "900",
  passkeyUserVerification: "preferred",
  telegramProfileSetup: "false",
};

function usage() {
  return `Generate service env files with shared secrets.

Usage:
  npm run env:generate -- --write-dir .env.generated
  npm run env:generate -- --frontend-url http://localhost:3000 --backend-url http://localhost:3001 --write-dir .env.generated
  npm run env:generate -- --frontend-url https://app.example.com --backend-url https://api.example.com --telegram-url https://telegram.example.com --write-dir .env.generated

Options:
  --frontend-url <url>             Public frontend origin. Default: ${DEFAULTS.frontendUrl}
  --backend-url <url>              Public backend origin. Default: ${DEFAULTS.backendUrl}
  --telegram-url <url>             Public Telegram adapter origin. Optional.
  --network <testnet|mainnet>      Stellar/Defindex network. Default: ${DEFAULTS.network}
  --app-name <name>                Passkey RP name. Default: ${DEFAULTS.appName}
  --visible-assets <codes>         Public asset list. Default: ${DEFAULTS.visibleAssets}
  --telegram-profile-setup <bool>  Whether Telegram service updates profile on boot. Default: false
  --passkey-verifier <C...>        Optional OpenZeppelin WebAuthn/P-256 verifier contract.
  --passkey-context-rule-id <id>   Optional existing smart account context rule id.
  --enable-apy-execution           Set DEFINDEX_ENABLE_EXECUTION=true and DEFINDEX_COMPLIANCE_APPROVED=true.
  --write-dir <dir>                Write backend.env, frontend.env, telegram.env and README.md.
  --single-file <path>             Write all sections into one file.
  --force                          Allow overwriting output files.
  --help                           Show this help.
`;
}

function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function parseArgs(argv) {
  const options = {
    ...DEFAULTS,
    passkeyVerifier: "",
    passkeyContextRuleId: "",
    writeDir: "",
    singleFile: "",
    force: false,
    enableApyExecution: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg === "--enable-apy-execution") {
      options.enableApyExecution = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const key = rawKey.trim();
    const value = inlineValue !== undefined ? inlineValue : argv[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value === undefined || String(value).startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    assignOption(options, key, String(value));
  }

  return options;
}

function assignOption(options, key, value) {
  const normalized = key.toLowerCase();
  if (["frontend-url", "frontend", "app-url"].includes(normalized)) options.frontendUrl = value;
  else if (["backend-url", "backend", "api-url"].includes(normalized)) options.backendUrl = value;
  else if (["telegram-url", "telegram"].includes(normalized)) options.telegramUrl = value;
  else if (normalized === "network") options.network = value;
  else if (["app-name", "rp-name"].includes(normalized)) options.appName = value;
  else if (["visible-assets", "assets"].includes(normalized)) options.visibleAssets = value;
  else if (normalized === "telegram-profile-setup") options.telegramProfileSetup = value;
  else if (["passkey-verifier", "verifier", "p256-verifier"].includes(normalized)) options.passkeyVerifier = value;
  else if (["passkey-context-rule-id", "context-rule-id", "rule-id"].includes(normalized)) options.passkeyContextRuleId = value;
  else if (["write-dir", "out-dir"].includes(normalized)) options.writeDir = value;
  else if (["single-file", "out"].includes(normalized)) options.singleFile = value;
  else throw new Error(`Unknown option --${key}`);
}

function cleanOrigin(value, name, { allowEmpty = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw && allowEmpty) return "";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL origin. Received: ${raw || "(empty)"}`);
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${name} must not include user info, query, or hash.`);
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error(`${name} must be only the base URL, without a path.`);
  }
  return parsed.origin.replace(/\/+$/, "");
}

function rpIdFromFrontend(frontendOrigin) {
  const parsed = new URL(frontendOrigin);
  return parsed.hostname;
}

function normalizeNetwork(value) {
  const network = String(value || "").trim().toLowerCase();
  if (network === "mainnet" || network === "public") return "mainnet";
  if (network === "testnet") return "testnet";
  throw new Error("--network must be testnet or mainnet.");
}

function boolText(value, fallback = "false") {
  const text = String(value || fallback).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(text) ? "true" : "false";
}

function validateSorobanContract(value, label) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^C[A-Z2-7]{10,}$/.test(text)) {
    throw new Error(`${label} must be a Soroban contract address starting with C.`);
  }
  return text;
}

function validateRuleId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (!/^\d+$/.test(text)) throw new Error("--passkey-context-rule-id must be an integer.");
  return text;
}

function section(title, lines) {
  return [`# ${title}`, ...lines, ""].join("\n");
}

function buildFiles(options) {
  const frontendOrigin = cleanOrigin(options.frontendUrl, "--frontend-url");
  const backendOrigin = cleanOrigin(options.backendUrl, "--backend-url");
  const telegramOrigin = cleanOrigin(options.telegramUrl, "--telegram-url", { allowEmpty: true });
  const network = normalizeNetwork(options.network);
  const stellarNetwork = network === "mainnet" ? "PUBLIC" : "TESTNET";
  const passkeyVerifier = validateSorobanContract(options.passkeyVerifier, "--passkey-verifier");
  const passkeyContextRuleId = validateRuleId(options.passkeyContextRuleId);
  const smartAccountEnabled = passkeyVerifier && passkeyContextRuleId ? "true" : "false";
  const apyExecution = options.enableApyExecution ? "true" : "false";

  const jwtSecret = randomHex(32);
  const pinPepper = randomHex(32);
  const internalSecret = randomHex(32);
  const agentIngestSecret = randomHex(32);
  const telegramNotifySecret = randomHex(32);
  const etherfuseWebhookSecret = randomHex(32);
  const evolutionWebhookSecret = randomHex(32);

  const frontend = [
    `AGENT_API_URL=${backendOrigin}/api/agent/query`,
    `NEXT_PUBLIC_AGENT_API_URL=${backendOrigin}/api/agent/query`,
    `NEXT_PUBLIC_BACKEND_URL=${backendOrigin}`,
    `NEXT_PUBLIC_FRONTEND_URL=${frontendOrigin}`,
    `NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES=${options.visibleAssets}`,
    "NEXT_PUBLIC_PASSKEY_ENABLED=true",
  ].join("\n") + "\n";

  const backend = [
    "# Generated secrets. Keep this file server-side only.",
    "NODE_ENV=production",
    "PORT=3001",
    `JWT_SECRET=${jwtSecret}`,
    `PIN_PEPPER=${pinPepper}`,
    "",
    "# Fill these from Supabase/OpenAI dashboards.",
    "SUPABASE_URL=",
    "SUPABASE_SERVICE_ROLE_KEY=",
    "SUPABASE_ANON_KEY=",
    "OPENAI_API_KEY=",
    "",
    "# Public URLs.",
    `FRONTEND_URL=${frontendOrigin}`,
    `PUBLIC_APP_URL=${frontendOrigin}`,
    `CREATE_ACCOUNT_BASE=${frontendOrigin}`,
    `PAYMENT_CONFIRM_BASE=${frontendOrigin}`,
    `PUBLIC_BACKEND_URL=${backendOrigin}`,
    `CORS_ORIGINS=${frontendOrigin},http://localhost:3000,http://127.0.0.1:3000`,
    "",
    "# Internal service auth. Use the same values in adapters where noted.",
    `INTERNAL_API_SECRET=${internalSecret}`,
    `RAMP_SANDBOX_INTERNAL_SECRET=${internalSecret}`,
    `AGENT_INGEST_SECRET=${agentIngestSecret}`,
    `TELEGRAM_NOTIFY_SECRET=${telegramNotifySecret}`,
    `TELEGRAM_NOTIFY_URL=${telegramOrigin ? `${telegramOrigin}/notify` : ""}`,
    "TELEGRAM_BOT_TOKEN=",
    "",
    "# Stellar/testnet assets. TESOURO is the real product asset for reais.",
    `STELLAR_NETWORK=${stellarNetwork}`,
    `STELLAR_HORIZON_URL=${network === "mainnet" ? "https://horizon.stellar.org" : "https://horizon-testnet.stellar.org"}`,
    "STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org",
    "STELLAR_FRIENDBOT_TIMEOUT_MS=5000",
    "STELLAR_SECRET_KEY=",
    "STELLAR_PUBLIC_KEY=",
    "USDC_ASSET_CODE=USDC",
    "USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
    "USDC_ASSET_ISSUER=",
    "ENABLE_TESOURO_ASSET=true",
    "TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4",
    "TESOURO_DISTRIBUTOR_PUBLIC=",
    "TESOURO_DISTRIBUTOR_SECRET=",
    "ENABLE_CETES_ASSET=true",
    "ENABLE_EURC_ASSET=false",
    "EURC_ISSUER=",
    "EURC_ISSUER_PUBLIC=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
    "EURC_ISSUER_TESTNET=",
    `TTS_VISIBLE_ASSET_CODES=${options.visibleAssets}`,
    "",
    "# Quotes, conversion, and product fees.",
    "BRL_USDC_QUOTE_SOURCE=binance",
    "BRL_USDC_QUOTE_SYMBOL=USDCBRL",
    "BRL_USDC_QUOTE_TIMEOUT_MS=8000",
    "ONBOARDING_AUTO_CONVERT_TO_USDC=true",
    "QUOTE_TTL_SECONDS=30",
    "TALKTOSTELLAR_SPREAD_BPS=30",
    "TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=",
    "TALKTOSTELLAR_SPREAD_MIN_USDC=0.01",
    "TALKTOSTELLAR_SPREAD_MIN_BRL=0.05",
    "STELLAR_ENFORCE_TRUSTED_PATH_ASSETS=false",
    "",
    "# PIX / Etherfuse. Fill API key from Etherfuse dashboard.",
    "ETHERFUSE_API_KEY=",
    "ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com",
    "ETHERFUSE_BLOCKCHAIN=stellar",
    `ETHERFUSE_WEBHOOK_SECRET=${etherfuseWebhookSecret}`,
    "",
    "# APY / Defindex. Fill API key and vaults after discovery.",
    "DEFINDEX_API_KEY=",
    "DEFINDEX_BASE_URL=https://api.defindex.io",
    `DEFINDEX_NETWORK=${network}`,
    "DEFINDEX_TIMEOUT_MS=30000",
    `DEFINDEX_ENABLE_EXECUTION=${apyExecution}`,
    `DEFINDEX_COMPLIANCE_APPROVED=${apyExecution}`,
    "DEFINDEX_ALLOW_MAINNET_EXECUTION=false",
    "DEFINDEX_USDC_VAULT=",
    "DEFINDEX_CETES_VAULT=",
    "CETES_ISSUER_TESTNET=",
    "DEFINDEX_XLM_VAULT=",
    "DEFINDEX_TESOURO_VAULT=",
    "DEFINDEX_VAULTS_JSON=",
    "",
    "# Passkey / OpenZeppelin metadata.",
    `PASSKEY_RP_ID=${rpIdFromFrontend(frontendOrigin)}`,
    `PASSKEY_ORIGIN=${frontendOrigin}`,
    `PASSKEY_RP_NAME=${options.appName}`,
    `PASSKEY_CHALLENGE_TTL_SECONDS=${DEFAULTS.passkeyChallengeTtlSeconds}`,
    `PASSKEY_OPERATION_TIMEOUT_MS=${DEFAULTS.passkeyTimeoutMs}`,
    `PASSKEY_USER_VERIFICATION=${DEFAULTS.passkeyUserVerification}`,
    `PASSKEY_SMART_ACCOUNT_ENABLED=${smartAccountEnabled}`,
    `PASSKEY_SMART_ACCOUNT_NETWORK=${network}`,
    `PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=${passkeyVerifier}`,
    `PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=${passkeyContextRuleId}`,
    "",
    "# WhatsApp/Evolution optional adapter.",
    "EVOLUTION_API_URL=",
    "EVOLUTION_API_KEY=",
    "EVOLUTION_INSTANCE=",
    `EVOLUTION_WEBHOOK_SECRET=${evolutionWebhookSecret}`,
    `EVOLUTION_AGENT_URL=${backendOrigin}/api/agent/query`,
    "EVOLUTION_AGENT_TIMEOUT_MS=120000",
    "EVOLUTION_CONTENT_DEDUPE_TTL_MS=90000",
    "EVOLUTION_SEND_FAILURE_FALLBACK=false",
    "",
    "# Payout/international optional providers. Keep mock until provider is approved.",
    "PAYOUT_PROVIDER=mock",
    "CIRCLE_API_KEY=",
    "CIRCLE_PAYOUT_CREATE_URL=",
    "BRIDGE_API_KEY=",
    "BRIDGE_PAYOUT_CREATE_URL=",
    "ENABLE_REAL_PAYOUT_EXECUTION=false",
    "",
    "# Runtime limits and summaries.",
    "LOG_LEVEL=info",
    "LOG_FILE=",
    "RATE_LIMIT_WINDOW_MS=60000",
    "RATE_LIMIT_MAX=300",
    "SENSITIVE_RATE_LIMIT_WINDOW_MS=60000",
    "SENSITIVE_RATE_LIMIT_MAX=30",
    "ENABLE_DAILY_SUMMARY=true",
    "DAILY_SUMMARY_TIMEZONE=America/Sao_Paulo",
    "DAILY_SUMMARY_HOUR_LOCAL=9",
  ].join("\n") + "\n";

  const telegram = [
    "# Fill TELEGRAM_BOT_TOKEN with the BotFather token before starting the service.",
    "TELEGRAM_BOT_TOKEN=",
    `TELEGRAM_AGENT_URL=${backendOrigin}/api/agent/query`,
    "TELEGRAM_BOT_MODE=webhook",
    "TELEGRAM_BOT_USERNAME=",
    "TELEGRAM_HEALTH_PORT=3005",
    "TELEGRAM_SESSION_PREFIX=telegram",
    "TELEGRAM_WEBHOOK_PATH=/webhook/telegram",
    `TELEGRAM_WEBHOOK_URL=${telegramOrigin}`,
    `TELEGRAM_PROFILE_SETUP=${boolText(options.telegramProfileSetup, "false")}`,
    "TELEGRAM_PROFILE_PHOTO_PATH=",
    "TELEGRAM_SHORT_DESCRIPTION=TalkToStellar account assistant for balance, PIX, conversion, APY review, and withdrawals.",
    "TELEGRAM_DESCRIPTION=TalkToStellar helps you check balances, add or withdraw with PIX, convert currencies, review APY options, manage contacts, and send payments from Telegram.",
    `AGENT_INGEST_SECRET=${agentIngestSecret}`,
    `TELEGRAM_NOTIFY_SECRET=${telegramNotifySecret}`,
  ].join("\n") + "\n";

  const readme = [
    "# Generated env files",
    "",
    "Copy each file into the deploy environment for that service:",
    "",
    "- `backend.env`: backend/Railway/API service.",
    "- `frontend.env`: frontend/Vercel service.",
    "- `telegram.env`: Telegram adapter service.",
    "",
    "Generated secrets are already consistent across services:",
    "",
    "- `AGENT_INGEST_SECRET` matches backend and Telegram.",
    "- `TELEGRAM_NOTIFY_SECRET` matches backend and Telegram.",
    "- `INTERNAL_API_SECRET` and `RAMP_SANDBOX_INTERNAL_SECRET` match inside backend.",
    "",
    "You still must fill provider credentials manually:",
    "",
    "- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`.",
    "- `OPENAI_API_KEY`.",
    "- `TELEGRAM_BOT_TOKEN`.",
    "- `ETHERFUSE_API_KEY`.",
    "- `DEFINDEX_API_KEY` and vault addresses.",
    "- Stellar operational keys when the backend signs operations.",
    "",
    "To discover Defindex vault addresses after setting `DEFINDEX_API_KEY`, run:",
    "",
    "```bash",
    "npm --prefix backend run defindex:env -- --network testnet",
    "```",
    "",
    "For passkey only, the generated values are enough. For OpenZeppelin on-chain execution, deploy the verifier/smart account first and rerun with `--passkey-verifier C... --passkey-context-rule-id 1`.",
    "",
  ].join("\n");

  const all = [
    section("backend.env", backend.trimEnd().split("\n")),
    section("frontend.env", frontend.trimEnd().split("\n")),
    section("telegram.env", telegram.trimEnd().split("\n")),
  ].join("\n");

  return { backend, frontend, telegram, readme, all };
}

function writeOutput(file, content, force) {
  try {
    writeFileSync(file, content, {
      encoding: "utf8",
      flag: force ? "w" : "wx",
    });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(`${file} already exists. Use --force to overwrite.`);
    }
    throw error;
  }
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    process.exit(0);
  }

  const files = buildFiles(options);
  if (options.writeDir) {
    const outDir = path.resolve(process.cwd(), options.writeDir);
    mkdirSync(outDir, { recursive: true });
    writeOutput(path.join(outDir, "backend.env"), files.backend, options.force);
    writeOutput(path.join(outDir, "frontend.env"), files.frontend, options.force);
    writeOutput(path.join(outDir, "telegram.env"), files.telegram, options.force);
    writeOutput(path.join(outDir, "README.md"), files.readme, options.force);
    process.stdout.write(`Wrote env files to ${outDir}\n`);
  } else if (options.singleFile) {
    const outFile = path.resolve(process.cwd(), options.singleFile);
    writeOutput(outFile, files.all, options.force);
    process.stdout.write(`Wrote ${outFile}\n`);
  } else {
    process.stdout.write(files.all);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${usage()}`);
  process.exit(1);
}
