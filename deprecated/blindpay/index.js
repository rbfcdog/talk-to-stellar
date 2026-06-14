/**
 * BlindPay PIX → Stellar Payin Flow  (Complete Production Flow)
 *
 * Full lifecycle:
 *   0. Accept Terms of Service (browser-based — one-time per instance)
 *   1. Create a customer (KYC)
 *   2. Generate Stellar keypair + fund + trustline
 *   3. Register blockchain wallet with BlindPay
 *   4. Create PIX Payin Quote (BRL → USDC)
 *   5. Initiate the Payin (returns PIX code + QR)
 *   6. Show payment page + poll until USDC lands in Stellar wallet
 *
 * ─── Usage ────────────────────────────────────────────────────────────────
 *
 *   DEV (testnet, USDB — auto-completes after ~30s):
 *     node --env-file=.env index.js [amount_brl_cents]
 *     node --env-file=.env index.js 10000
 *
 *   PRODUCTION (mainnet, USDC — real PIX, real money):
 *     node --env-file=.env index.js 10000 --prod
 *
 *   Resume from saved state:
 *     node --env-file=.env index.js 10000 --resume
 *
 * ─── Prerequisites ────────────────────────────────────────────────────────
 *
 *   1. BlindPay account + instance + API key
 *   2. Accept TOS once (the script guides you through this)
 *   3. npm install @stellar/stellar-sdk
 *
 *   For PRODUCTION (--prod):
 *   - BlindPay production instance (supports Stellar mainnet + USDC)
 *   - Stellar mainnet account with USDC trustline already established
 *   - Set BLINDPAY_STELLAR_ACCOUNT in .env (or script generates a new one)
 *   - Real BRL → PIX payment will be required
 *
 * ─── .env ─────────────────────────────────────────────────────────────────
 *
 *   BLINDPAY_API_KEY=your_key
 *   BLINDPAY_INSTANCE_ID=in_xxxxxxxxxxxx                    # 15 chars
 *   BLINDPAY_INSTANCE_TYPE=development|production           # optional, auto-detected
 *   BLINDPAY_STELLAR_NETWORK=mainnet|testnet                # default: testnet for dev, mainnet for prod
 *   BLINDPAY_STELLAR_SECRET=S...                            # optional existing key
 *   BLINDPAY_HTTP_PORT=3333                                 # optional
 *   BLINDPAY_STATE_FILE=./.blindpay-state.json              # optional
 */

import http from "http";
import { exec } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import {
  Keypair,
  Horizon,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
} from "@stellar/stellar-sdk";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── CLI args ────────────────────────────────────────────────────────────────

const args              = process.argv.slice(2);
const isProd            = args.includes("--prod");
const isTestnetExplicit = args.includes("--testnet");
const doResume          = args.includes("--resume");
const requestAmountCents = parseInt(args.find(a => /^\d+$/.test(a)) || "10000", 10);

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY      = process.env.BLINDPAY_API_KEY;
const INSTANCE_ID  = process.env.BLINDPAY_INSTANCE_ID;
const INSTANCE_TYPE = process.env.BLINDPAY_INSTANCE_TYPE || (isProd ? "production" : "development");
const STELLAR_SECRET = process.env.BLINDPAY_STELLAR_SECRET || null;

const BASE_URL       = "https://api.blindpay.com/v1";
const HTTP_PORT      = parseInt(process.env.BLINDPAY_HTTP_PORT || "3333", 10);
const STATE_FILE     = process.env.BLINDPAY_STATE_FILE || resolve(__dirname, ".blindpay-state.json");

// Derive effective network config
const effectiveNetwork = isTestnetExplicit
  ? "testnet"
  : isProd
    ? "mainnet"
    : INSTANCE_TYPE === "production"
      ? "mainnet"
      : "testnet";

const TOKEN       = INSTANCE_TYPE === "production" ? "USDC" : "USDB";
const CHAIN       = effectiveNetwork === "mainnet" ? "stellar" : "stellar_testnet";

// USDC issuer on Stellar mainnet
const USDC_ISSUER_MAINNET = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const HORIZON_URL = effectiveNetwork === "mainnet"
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";

const NETWORK_PASSPHRASE = effectiveNetwork === "mainnet"
  ? Networks.PUBLIC
  : Networks.TESTNET;

const STELLAR_EXPLORER = effectiveNetwork === "mainnet"
  ? "https://stellar.expert/explorer/public/account/"
  : "https://stellar.expert/explorer/testnet/account/";

if (!API_KEY || !INSTANCE_ID) {
  console.error(`
Missing required environment variables. Create a .env file with:
  BLINDPAY_API_KEY=your_key
  BLINDPAY_INSTANCE_ID=in_xxxxxxxxxxxx
`);
  process.exit(1);
}

// ─── State Persistence ───────────────────────────────────────────────────────

function loadState() {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, "utf-8")); }
    catch { /* corrupted, ignore */ }
  }
  return {};
}

function saveState(updates) {
  const state = { ...loadState(), ...updates, updatedAt: new Date().toISOString() };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function clearState() {
  if (existsSync(STATE_FILE)) writeFileSync(STATE_FILE, "{}");
}

// ─── HTTP Helpers ────────────────────────────────────────────────────────────

async function api(path, { method = "GET", body, isTos = false } = {}) {
  const url = isTos
    ? `https://api.blindpay.com/v1/e${path}`
    : `${BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    const err = new Error(`API ${res.status} ${method} ${path}: ${json.message || text}`);
    err.status = res.status;
    err.body   = json;
    throw err;
  }
  return json;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Stellar Helpers ─────────────────────────────────────────────────────────

function generateStellarKeypair() {
  const keypair  = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();
  return { publicKey, secretKey };
}

async function getStellarAccount(publicKey) {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function hasTrustline(publicKey, assetCode, assetIssuer) {
  const account = await getStellarAccount(publicKey);
  if (!account) return false;
  return account.balances.some(
    b => b.asset_code === assetCode && b.asset_issuer === assetIssuer
  );
}

async function fundAndCreateTrustline(secretKey, publicKey, assetCode, assetIssuer) {
  const server = new Horizon.Server(HORIZON_URL);
  const keypair = Keypair.fromSecret(secretKey);

  const account = await getStellarAccount(publicKey);

  if (!account) {
    // Account doesn't exist on-chain yet
    if (effectiveNetwork === "testnet") {
      console.log("   Funding account via Friendbot...");
      const fbRes = await fetch(
        `https://friendbot.stellar.org?addr=${publicKey}`
      );
      if (!fbRes.ok) {
        const fbJson = await fbRes.json();
        throw new Error(`Friendbot failed: ${fbJson.detail || fbRes.status}`);
      }
      console.log("   ✓ Funded!");
      await sleep(3000); // Wait for Horizon to index
    } else {
      throw new Error(
        `Stellar mainnet account ${publicKey} does not exist. ` +
        `Fund it with at least 1.5 XLM first, then re-run.`
      );
    }
  }

  // Add trustline if needed
  const needsTrustline = effectiveNetwork === "mainnet" ||
    (assetCode !== "USDB"); // USDB issuer unknown for testnet, skip trustline on dev

  if (needsTrustline && assetIssuer) {
    const hasTL = await hasTrustline(publicKey, assetCode, assetIssuer);
    if (!hasTL) {
      console.log(`   Creating trustline for ${assetCode}...`);
      const loadedAccount = await server.loadAccount(publicKey);
      const tx = new TransactionBuilder(loadedAccount, {
        fee: "1000",
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(
          Operation.changeTrust({
            asset: new Asset(assetCode, assetIssuer),
          })
        )
        .setTimeout(30)
        .build();

      tx.sign(keypair);
      const result = await server.submitTransaction(tx);
      console.log(`   ✓ Trustline created! TX: ${result.hash}`);
      await sleep(3000);
    } else {
      console.log(`   ✓ Trustline for ${assetCode} already exists.`);
    }
  }
}

// ─── Local HTTP Server ───────────────────────────────────────────────────────

let pixPageHtml = "<p>Waiting for payin to be initiated...</p>";
let tosAccepted  = false;
let capturedTosId = null;

function startLocalServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${HTTP_PORT}`);

    if (url.pathname === "/callback" && url.searchParams.has("tos_id")) {
      capturedTosId = url.searchParams.get("tos_id");
      tosAccepted   = true;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(htmlPage("✓ Terms of Service Accepted",
        `<p>TOS ID: <code>${capturedTosId}</code></p>
         <p>You may close this window and return to the terminal.</p>`));
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(pixPageHtml);
  });

  server.listen(HTTP_PORT, () => {
    console.log(`🌐 Local server: http://localhost:${HTTP_PORT}`);
  });
  return server;
}

function htmlPage(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;color:#333}</style>
</head><body><div><h2 style="color:#00b06c">${title}</h2>${body}</div></body></html>`;
}

function buildPixPage({ pixCode, pixQrCode, fiatAmount, stablecoinAmount, payinId, token }) {
  const qrSection = pixQrCode
    ? `<img src="data:image/png;base64,${pixQrCode}" alt="PIX QR" style="width:260px;height:260px;margin:0 auto 24px;display:block">`
    : "";

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Pagar via PIX</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}.card{background:#fff;border-radius:16px;padding:40px 36px;max-width:480px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center}h1{font-size:22px;font-weight:700;color:#111;margin-bottom:6px}.subtitle{font-size:14px;color:#666;margin-bottom:28px}.amount{font-size:36px;font-weight:800;color:#00b06c;margin-bottom:4px}.converts{font-size:13px;color:#999;margin-bottom:28px}.qr-wrap{background:#f9f9f9;border:1px solid #eee;border-radius:12px;padding:24px;margin-bottom:24px}.label{font-size:12px;font-weight:600;color:#888;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px}.pix-code-box{background:#f4f4f4;border:1px solid #e0e0e0;border-radius:8px;padding:12px 14px;font-size:11px;color:#333;word-break:break-all;text-align:left;margin-bottom:10px;line-height:1.6}.copy-btn{display:inline-block;background:#111;color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:600;cursor:pointer;transition:background .15s}.copy-btn:hover{background:#333}.copy-btn.copied{background:#00b06c}.footer{font-size:12px;color:#bbb;margin-top:28px}.payin-id{font-family:monospace;font-size:11px;color:#ccc;margin-top:6px}.steps{text-align:left;margin-bottom:28px}.steps li{font-size:14px;color:#555;margin-bottom:8px;padding-left:4px}.steps li::marker{color:#00b06c;font-weight:700}</style></head><body>
<div class="card"><h1>Pague com PIX</h1><p class="subtitle">Após o pagamento, você receberá ${token} na Stellar.</p>
<div class="amount">R$ ${(fiatAmount / 100).toFixed(2)}</div><div class="converts">→ ${(stablecoinAmount / 100).toFixed(2)} ${token} na Stellar (${effectiveNetwork})</div>
<div class="qr-wrap"><div class="label">Escaneie o QR Code</div>${qrSection}<div class="label" style="margin-top:16px">ou use o PIX Copia e Cola</div>
<div class="pix-code-box" id="pixCode">${pixCode}</div><button class="copy-btn" id="copyBtn" onclick="copyPix()">Copiar código PIX</button></div>
<ol class="steps"><li>Abra o app do seu banco</li><li>Escolha pagar via PIX</li><li>Escaneie o QR code ou cole o código</li><li>Confirme o pagamento de <strong>R$ ${(fiatAmount / 100).toFixed(2)}</strong></li></ol>
<div class="footer">Aguardando confirmação do pagamento...<div class="payin-id">Payin ID: ${payinId}</div></div></div>
<script>function copyPix(){const c=document.getElementById("pixCode").innerText;navigator.clipboard.writeText(c).then(()=>{const b=document.getElementById("copyBtn");b.textContent="Copiado! ✓";b.classList.add("copied");setTimeout(()=>{b.textContent="Copiar código PIX";b.classList.remove("copied")},2000)})}</script>
</body></html>`;
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open"
            : process.platform === "win32"  ? "start"
            : "xdg-open";
  exec(`${cmd} "${url}"`).unref();
}

// ─── Steps ───────────────────────────────────────────────────────────────────

async function step0_acceptTOS() {
  const state = loadState();
  if (state.tosId) {
    console.log(`✓ TOS already accepted: ${state.tosId}`);
    return state.tosId;
  }

  console.log("\n[0/5] Accepting BlindPay Terms of Service...");
  console.log("   (One-time per instance — stored in state file)\n");

  const res = await api(`/instances/${INSTANCE_ID}/tos`, {
    method: "POST",
    body: {
      redirect_url: `http://localhost:${HTTP_PORT}/callback`,
      idempotency_key: randomUUID(),
    },
    isTos: true,
  });

  console.log(`   Opening browser for TOS acceptance...`);
  openBrowser(res.url);

  console.log("   Waiting for TOS acceptance (timeout: 5 minutes)...");

  const start = Date.now();
  while (!tosAccepted) {
    if (Date.now() - start > 300_000) {
      console.error("❌ Timed out waiting for TOS acceptance.");
      process.exit(1);
    }
    await sleep(1000);
  }

  console.log(`   ✓ TOS accepted: ${capturedTosId}`);
  saveState({ tosId: capturedTosId });
  return capturedTosId;
}

async function step1_createCustomer(tosId) {
  const state = loadState();
  if (state.customerId) {
    console.log(`✓ Customer already exists: ${state.customerId}`);
    return state.customerId;
  }

  console.log("\n[1/5] Creating customer (KYC)...");

  const body = {
    type: "individual",
    kyc_type: "standard",
    first_name: "João",
    last_name: "Silva",
    email: "joao.silva@example.com",
    tax_id: "47376226990",
    document_type: "cpf",
    document_number: "47376226990",
    country: "BR",
    date_of_birth: "1990-01-01T00:00:00.000Z",
    address_line_1: "Av. Paulista, 1000",
    city: "São Paulo",
    state_province_region: "SP",
    postal_code: "01310000",
    id_doc_country: "BR",
    id_doc_type: "ID_CARD",
    selfie_file: "https://picsum.photos/id/237/200/300",
    id_doc_front_file: "https://picsum.photos/id/237/200/300",
    id_doc_back_file: "https://picsum.photos/id/237/200/300",
    tos_id: tosId,
  };

  const res = await api(`/instances/${INSTANCE_ID}/customers`, {
    method: "POST",
    body,
  });

  console.log(`   ✓ Customer created: ${res.id}`);

  // Wait for KYC approval
  if (res.kyc_status === "verifying" || !res.kyc_status) {
    console.log("   Waiting for KYC approval...");
    for (let i = 0; i < 12; i++) {
      await sleep(5000);
      try {
        const customer = await api(`/instances/${INSTANCE_ID}/customers/${res.id}`);
        if (customer.kyc_status === "approved") {
          console.log("   ✓ KYC approved!");
          break;
        }
        if (customer.kyc_status === "rejected") {
          console.error(`❌ KYC rejected: ${customer.kyc_warnings || "no details"}`);
          process.exit(1);
        }
      } catch { /* ignore 404s during creation window */ }
      if (i === 11) console.warn("   ⚠ KYC still verifying after 60s. Continuing...");
    }
  }

  saveState({ customerId: res.id });
  return res.id;
}

async function step2_setupStellar() {
  const state = loadState();
  if (state.stellarPublicKey && state.walletId) {
    console.log(`✓ Stellar wallet ready: ${state.walletId}`);
    console.log(`   Public key: ${state.stellarPublicKey}`);
    return { stellarPublicKey: state.stellarPublicKey, walletId: state.walletId };
  }

  console.log(`\n[2/5] Setting up Stellar wallet (${effectiveNetwork})...`);

  // Generate or use existing keypair
  let keypair;
  if (STELLAR_SECRET) {
    keypair = Keypair.fromSecret(STELLAR_SECRET);
    console.log(`   Using existing Stellar account: ${keypair.publicKey()}`);
  } else if (state.stellarPublicKey) {
    console.log(`   Using saved public key: ${state.stellarPublicKey}`);
  } else {
    keypair = Keypair.random();
    console.log(`   ✨ Generated new Stellar ${effectiveNetwork} keypair`);
  }

  const stellarPublicKey = keypair
    ? keypair.publicKey()
    : state.stellarPublicKey;

  const stellarSecret = keypair ? keypair.secret() : STELLAR_SECRET;

  if (stellarSecret) {
    // Fund and establish trustline
    console.log(`   Checking account and trustline for ${TOKEN}...`);
    const assetIssuer = effectiveNetwork === "mainnet" ? USDC_ISSUER_MAINNET : null;
    await fundAndCreateTrustline(stellarSecret, stellarPublicKey, TOKEN, assetIssuer);
  }

  saveState({
    stellarPublicKey,
    ...(stellarSecret ? { stellarSecret } : {}),
  });

  // Register blockchain wallet with BlindPay
  console.log("\n[3/5] Registering blockchain wallet with BlindPay...");

  const walletRes = await api(
    `/instances/${INSTANCE_ID}/customers/${loadState().customerId}/blockchain-wallets`,
    {
      method: "POST",
      body: {
        address: stellarPublicKey,
        network: CHAIN,
        name: `Stellar ${effectiveNetwork === "mainnet" ? "Mainnet" : "Testnet"}`,
        is_account_abstraction: true,
      },
    }
  );

  console.log(`   ✓ Blockchain wallet registered: ${walletRes.id}`);
  console.log(`   Network:  ${CHAIN}`);
  console.log(`   Address:  ${walletRes.address}`);

  saveState({ walletId: walletRes.id, walletAddress: walletRes.address });
  return { stellarPublicKey, walletId: walletRes.id };
}

async function step4_createPayinQuote(walletId) {
  const state = loadState();
  if (state.quoteId && state.payinId && state.payinStatus !== "failed") {
    console.log(`✓ Quote already exists: ${state.quoteId}`);
    return {
      quoteId: state.quoteId,
      fiatAmount: state.fiatAmount,
      stablecoinAmount: state.stablecoinAmount,
    };
  }

  console.log(`\n[4/5] Creating PIX → ${TOKEN} payin quote...`);
  console.log(`   Requested: R$ ${(requestAmountCents / 100).toFixed(2)}`);

  const res = await api(`/instances/${INSTANCE_ID}/payin-quotes`, {
    method: "POST",
    body: {
      blockchain_wallet_id: walletId,
      payment_method: "pix",
      currency_type: "sender",
      token: TOKEN,
      request_amount: requestAmountCents,
      cover_fees: false,
    },
  });

  console.log(`   ✓ Quote created: ${res.id}`);
  console.log(`   Send (BRL):       R$ ${(res.sender_amount / 100).toFixed(2)}`);
  console.log(`   Receive (${TOKEN}):   ${(res.receiver_amount / 100).toFixed(2)} ${TOKEN}`);
  console.log(`   Expires:          5 minutes`);

  saveState({
    quoteId: res.id,
    fiatAmount: res.sender_amount,
    stablecoinAmount: res.receiver_amount,
  });

  return {
    quoteId: res.id,
    fiatAmount: res.sender_amount,
    stablecoinAmount: res.receiver_amount,
  };
}

async function step5_initiatePayin(quoteId) {
  const state = loadState();
  if (state.payinId && state.payinStatus !== "failed") {
    console.log(`✓ Payin already initiated: ${state.payinId} (${state.payinStatus})`);
    return { id: state.payinId, status: state.payinStatus, pix_code: state.pixCode };
  }

  console.log("\n[5/5] Initiating payin...");

  const res = await api(`/instances/${INSTANCE_ID}/payins/evm`, {
    method: "POST",
    body: { payin_quote_id: quoteId },
  });

  console.log(`   ✓ Payin initiated: ${res.id}`);
  console.log(`   Status: ${res.status}`);

  const pixCode = res.pix_code;
  if (pixCode === "<development>") {
    console.log("   ℹ Dev instance — PIX step simulated, auto-complete in ~30s");
  }

  saveState({
    payinId: res.id,
    payinStatus: res.status,
    pixCode: pixCode,
  });

  return { id: res.id, status: res.status, pix_code: pixCode, ...res };
}

async function step6_watchCompletion(payinId, fiatAmount, stablecoinAmount) {
  const state = loadState();
  if (state.payinStatus === "completed") {
    console.log("\n✓ Payin already completed!");
    return;
  }

  // Show PIX page
  const currentState = loadState();
  const pixCode = currentState.pixCode;

  if (pixCode && pixCode !== "<development>") {
    pixPageHtml = buildPixPage({
      pixCode,
      pixQrCode: null,
      fiatAmount,
      stablecoinAmount,
      payinId,
      token: TOKEN,
    });

    console.log(`\n${"─".repeat(55)}`);
    console.log(`  📲 PIX Payment`);
    console.log(`  Amount: R$ ${(fiatAmount / 100).toFixed(2)}`);
    console.log(`  PIX: ${pixCode.substring(0, 40)}...`);
    console.log(`  ℹ  Open http://localhost:${HTTP_PORT} for QR/copy`);
    console.log(`${"─".repeat(55)}`);
    openBrowser(`http://localhost:${HTTP_PORT}`);
  }

  console.log(`\n   Polling for completion (up to 6 min)...`);

  let lastStatus = state.payinStatus || "processing";
  for (let i = 0; i < 72; i++) {
    await sleep(5000);
    const res = await api(`/instances/${INSTANCE_ID}/payins/${payinId}`);

    const txStep   = res.tracking_transaction?.step || "?";
    const payStep  = res.tracking_payment?.step || "?";
    const compStep = res.tracking_complete?.step || "?";

    process.stdout.write(
      `\r   Status: ${res.status} | tx:${txStep} pay:${payStep} complete:${compStep} (${((i + 1) * 5)}s)   `
    );

    if (res.status !== lastStatus) {
      lastStatus = res.status;
      saveState({ payinStatus: res.status });
    }

    if (res.status === "completed") {
      const txHash = res.tracking_complete?.transaction_hash;
      console.log(`\n\n🎉 Payin completed!`);
      console.log(`   Amount: ${(stablecoinAmount / 100).toFixed(2)} ${TOKEN}`);
      if (txHash) console.log(`   TX:     ${txHash}`);
      saveState({ payinStatus: "completed", completedAt: new Date().toISOString() });
      return;
    }

    if (res.status === "failed" || res.status === "refunded" || res.status === "canceled") {
      console.log(`\n\n❌ Payin ${res.status}`);
      saveState({ payinStatus: res.status });
      return;
    }
  }

  console.log(`\n\n⚠ Timed out. Check BlindPay dashboard. Payin: ${payinId}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  BlindPay  |  PIX → Stellar Payin");
  console.log(`  Instance:  ${INSTANCE_ID} (${INSTANCE_TYPE})`);
  console.log(`  Network:   Stellar ${effectiveNetwork.toUpperCase()}`);
  console.log(`  Token:     ${TOKEN}`);
  console.log(`  Amount:    R$ ${(requestAmountCents / 100).toFixed(2)}`);
  if (doResume) console.log("  Mode:      RESUME");
  console.log("═══════════════════════════════════════════════════════\n");

  if (doResume && Object.keys(loadState()).length === 0) {
    console.log("No saved state found. Starting fresh.\n");
  }

  const server = startLocalServer();

  try {
    // Step 0: Accept TOS
    const tosId = await step0_acceptTOS();

    // Step 1: Create customer
    const customerId = await step1_createCustomer(tosId);

    // Steps 2+3: Setup Stellar + register wallet
    const { stellarPublicKey, walletId } = await step2_setupStellar();

    // Step 4: Create payin quote
    const { quoteId, fiatAmount, stablecoinAmount } =
      await step4_createPayinQuote(walletId);

    // Step 5: Initiate payin
    const payin = await step5_initiatePayin(quoteId);

    // Step 6: Watch for completion
    await step6_watchCompletion(payin.id, fiatAmount, stablecoinAmount);

    console.log(`\n🔍 Check wallet: ${STELLAR_EXPLORER}${stellarPublicKey}`);
    console.log("✅ Done.");
    clearState();
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (err.body) console.error(JSON.stringify(err.body, null, 2));
    console.error("\n   State saved. Run with --resume to retry.");
    server.close();
    process.exit(1);
  }

  server.close();
}

main().catch(err => {
  console.error("\nUnhandled:", err);
  process.exit(1);
});
