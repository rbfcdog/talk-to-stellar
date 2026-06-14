/**
 * BlindPay PIX → Stellar Payin Server
 *
 * Express API + frontend for the complete PIX payin flow.
 *
 * ─── Endpoints ──────────────────────────────────────────────────────────
 *
 *   GET  /                  Frontend (PIX payment page)
 *   GET  /api/status        Server status + config info
 *   POST /api/tos/generate  Generate TOS acceptance URL
 *   GET  /api/tos/callback  TOS callback (BlindPay redirects here)
 *   POST /api/payin/quote   Create a payin quote
 *   POST /api/payin/execute Initiate payin from quote
 *   GET  /api/payin/:id     Poll payin status
 *   POST /api/payin/full    One-shot: create customer + wallet + quote + payin
 *
 * ─── Usage ─────────────────────────────────────────────────────────────
 *
 *   npm start               http://localhost:3333 (dev/testnet)
 *   npm run start:prod      http://localhost:3333 (production/mainnet)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import http from "http";
import { exec } from "child_process";
import express from "express";
import cors from "cors";
import QRCode from "qrcode";
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

const args       = process.argv.slice(2);
const isProd     = args.includes("--prod");
const isTestnet  = args.includes("--testnet");

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY      = process.env.BLINDPAY_API_KEY;
const INSTANCE_ID  = process.env.BLINDPAY_INSTANCE_ID;
const INSTANCE_TYPE = process.env.BLINDPAY_INSTANCE_TYPE || (isProd ? "production" : "development");
const STELLAR_SECRET = process.env.BLINDPAY_STELLAR_SECRET || null;

const PORT          = parseInt(process.env.BLINDPAY_HTTP_PORT || "3333", 10);
const BASE_URL      = "https://api.blindpay.com/v1";
const STATE_FILE    = resolve(__dirname, ".blindpay-state.json");

// Derive effective network
const effectiveNetwork = isTestnet
  ? "testnet"
  : isProd
    ? "mainnet"
    : INSTANCE_TYPE === "production"
      ? "mainnet"
      : "testnet";

const TOKEN  = INSTANCE_TYPE === "production" ? "USDC" : "USDB";
const CHAIN  = effectiveNetwork === "mainnet" ? "stellar" : "stellar_testnet";

const USDC_ISSUER_MAINNET = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const HORIZON_URL = effectiveNetwork === "mainnet"
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = effectiveNetwork === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
const STELLAR_EXPLORER = effectiveNetwork === "mainnet"
  ? "https://stellar.expert/explorer/public/account/"
  : "https://stellar.expert/explorer/testnet/account/";

if (!API_KEY || !INSTANCE_ID) {
  console.error("Missing BLINDPAY_API_KEY or BLINDPAY_INSTANCE_ID in .env");
  process.exit(1);
}

// ─── State ───────────────────────────────────────────────────────────────────

function loadState() {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, "utf-8")); } catch {}
  }
  return {};
}
function saveState(u) {
  const s = { ...loadState(), ...u, updatedAt: new Date().toISOString() };
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

// ─── BlindPay API ────────────────────────────────────────────────────────────

async function blindpay(path, { method = "GET", body, isTos = false } = {}) {
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
    const err = new Error(`${json.message || text}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

// ─── State management helpers ────────────────────────────────────────────────

function getExistingCustomerId() {
  return loadState().customerId || null;
}

function getExistingWalletId() {
  return loadState().walletId || null;
}

// ─── Stellar helpers ─────────────────────────────────────────────────────────

async function getStellarAccount(publicKey) {
  try {
    const res = await fetch(`${HORIZON_URL}/accounts/${publicKey}`);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function fundAndCreateTrustline(secretKey, publicKey) {
  const server = new Horizon.Server(HORIZON_URL);
  const keypair = Keypair.fromSecret(secretKey);
  const account = await getStellarAccount(publicKey);

  if (!account) {
    if (effectiveNetwork === "testnet") {
      const fbRes = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
      if (!fbRes.ok) throw new Error("Friendbot failed");
      await new Promise(r => setTimeout(r, 3000));
    } else {
      throw new Error(`Stellar mainnet account ${publicKey} not found. Fund it first.`);
    }
  }

  // Add trustline for USDC on mainnet
  if (effectiveNetwork === "mainnet") {
    const acc = await getStellarAccount(publicKey);
    if (!acc) throw new Error("Account not found");
    const hasTL = acc.balances.some(
      b => b.asset_code === "USDC" && b.asset_issuer === USDC_ISSUER_MAINNET
    );
    if (!hasTL) {
      const loaded = await server.loadAccount(publicKey);
      const tx = new TransactionBuilder(loaded, {
        fee: "1000",
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(Operation.changeTrust({
          asset: new Asset("USDC", USDC_ISSUER_MAINNET),
        }))
        .setTimeout(30)
        .build();
      tx.sign(keypair);
      await server.submitTransaction(tx);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// ─── Express App ─────────────────────────────────────────────────────────────

// Global error handlers — prevent server crash on unhandled rejections
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err.message);
  if (err.code === "EADDRINUSE") process.exit(1);
});

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend
app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(getFrontendHTML());
});

// ─── API: Status ─────────────────────────────────────────────────────────────

app.get("/api/status", (req, res) => {
  const state = loadState();
  res.json({
    instanceId: INSTANCE_ID,
    instanceType: INSTANCE_TYPE,
    network: effectiveNetwork,
    token: TOKEN,
    chain: CHAIN,
    hasTos: !!state.tosId,
    hasCustomer: !!state.customerId,
    hasWallet: !!state.walletId,
    stellarExplorer: STELLAR_EXPLORER,
  });
});

// ─── API: TOS ────────────────────────────────────────────────────────────────

app.get("/api/tos/generate", async (req, res) => {
  try {
    const state = loadState();
    if (state.tosId) {
      return res.json({ tosId: state.tosId, cached: true });
    }

    const result = await blindpay(`/instances/${INSTANCE_ID}/tos`, {
      method: "POST",
      body: {
        redirect_url: `http://localhost:${PORT}/api/tos/callback`,
        idempotency_key: randomUUID(),
      },
      isTos: true,
    });

    res.json({ url: result.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/tos/callback", (req, res) => {
  const tosId = req.query.tos_id;
  if (tosId && tosId.length === 15) {
    saveState({ tosId });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TOS Accepted</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;background:#f5f5f5}
.card{background:#fff;padding:48px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h2{color:#00b06c;margin-bottom:8px}p{color:#666}</style></head><body>
<div class="card"><h2>✓ Terms of Service Accepted</h2>
<p>TOS ID: <code>${tosId}</code></p>
<p>You may close this window and return to the app.</p></div>
<script>setTimeout(()=>window.close(),3000)</script></body></html>`);
  } else {
    res.status(400).send("Missing or invalid tos_id");
  }
});

// ─── API: Customer ───────────────────────────────────────────────────────────

app.post("/api/customer", async (req, res) => {
  try {
    const state = loadState();
    if (state.customerId) {
      return res.json({ customerId: state.customerId, cached: true });
    }
    if (!state.tosId) {
      return res.status(400).json({ error: "TOS not accepted yet. Open /api/tos/generate first." });
    }

    const body = req.body || {};
    const result = await blindpay(`/instances/${INSTANCE_ID}/customers`, {
      method: "POST",
      body: {
        type: body.type || "individual",
        kyc_type: body.kyc_type || "standard",
        first_name: body.first_name || "João",
        last_name: body.last_name || "Silva",
        email: body.email || "joao.silva@example.com",
        tax_id: body.tax_id || "47376226990",
        document_type: body.document_type || "cpf",
        document_number: body.document_number || "47376226990",
        country: body.country || "BR",
        date_of_birth: body.date_of_birth || "1990-01-01T00:00:00.000Z",
        address_line_1: body.address_line_1 || "Av. Paulista, 1000",
        city: body.city || "São Paulo",
        state_province_region: body.state_province_region || "SP",
        postal_code: body.postal_code || "01310000",
        id_doc_country: body.id_doc_country || "BR",
        id_doc_type: body.id_doc_type || "ID_CARD",
        selfie_file: body.selfie_file || "https://picsum.photos/id/237/200/300",
        id_doc_front_file: body.id_doc_front_file || "https://picsum.photos/id/237/200/300",
        id_doc_back_file: body.id_doc_back_file || "https://picsum.photos/id/237/200/300",
        tos_id: state.tosId,
      },
    });

    // Wait for KYC
    let kycStatus = result.kyc_status;
    for (let i = 0; i < 12; i++) {
      if (kycStatus === "approved") break;
      await new Promise(r => setTimeout(r, 5000));
      try {
        const cust = await blindpay(`/instances/${INSTANCE_ID}/customers/${result.id}`);
        kycStatus = cust.kyc_status;
        if (kycStatus === "rejected") {
          return res.status(400).json({ error: "KYC rejected", details: cust.kyc_warnings });
        }
      } catch {}
    }

    saveState({ customerId: result.id });
    res.json({ customerId: result.id, kycStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Full Payin (one-shot) ──────────────────────────────────────────────

app.post("/api/payin/full", async (req, res) => {
  try {
    const { amount, stellarSecret } = req.body || {};
    const amountCents = parseInt(amount) || 10000;
    const state = loadState();

    // Step 0: Ensure TOS
    if (!state.tosId) {
      return res.status(400).json({
        error: "TOS not accepted",
        action: "Open /api/tos/generate in your browser, accept the terms, then retry.",
      });
    }

    // Step 1: Ensure customer
    let customerId = state.customerId;
    if (!customerId) {
      const cust = await blindpay(`/instances/${INSTANCE_ID}/customers`, {
        method: "POST",
        body: {
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
          tos_id: state.tosId,
        },
      });
      customerId = cust.id;
      saveState({ customerId });
      // Brief wait for KYC
      await new Promise(r => setTimeout(r, 5000));
    }

    // Step 2: Ensure Stellar wallet
    let walletId = state.walletId;
    let stellarPublicKey = state.stellarPublicKey;
    if (!walletId) {
      let kp;
      const secret = stellarSecret || STELLAR_SECRET || state.stellarSecret;
      if (secret) {
        kp = Keypair.fromSecret(secret);
      } else {
        kp = Keypair.random();
        saveState({ stellarSecret: kp.secret() });
      }
      stellarPublicKey = kp.publicKey();

      // Fund + trustline (testnet only)
      if (effectiveNetwork === "testnet") {
        try {
          await fundAndCreateTrustline(kp.secret(), stellarPublicKey);
        } catch {}
      }

      // Register wallet
      const w = await blindpay(
        `/instances/${INSTANCE_ID}/customers/${customerId}/blockchain-wallets`,
        {
          method: "POST",
          body: {
            address: stellarPublicKey,
            network: CHAIN,
            name: `Stellar ${effectiveNetwork}`,
            is_account_abstraction: true,
          },
        }
      );
      walletId = w.id;
      saveState({ walletId, stellarPublicKey, walletAddress: w.address });
    }

    // Step 3: Create quote
    const quote = await blindpay(`/instances/${INSTANCE_ID}/payin-quotes`, {
      method: "POST",
      body: {
        blockchain_wallet_id: walletId,
        payment_method: "pix",
        currency_type: "sender",
        token: TOKEN,
        request_amount: amountCents,
        cover_fees: false,
      },
    });

    // Step 4: Initiate payin
    const payin = await blindpay(`/instances/${INSTANCE_ID}/payins/evm`, {
      method: "POST",
      body: { payin_quote_id: quote.id },
    });

    // Step 5: Generate QR code from pix_code
    let qrDataUrl = null;
    if (payin.pix_code && payin.pix_code !== "<development>") {
      try {
        qrDataUrl = await QRCode.toDataURL(payin.pix_code, {
          width: 300,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
      } catch {}
    }

    saveState({
      lastQuoteId: quote.id,
      lastPayinId: payin.id,
      lastPixCode: payin.pix_code,
    });

    res.json({
      success: true,
      payinId: payin.id,
      quoteId: quote.id,
      status: payin.status,
      pixCode: payin.pix_code,
      isRealPix: payin.pix_code !== "<development>",
      qrDataUrl,
      senderAmount: quote.sender_amount,
      receiverAmount: quote.receiver_amount,
      token: TOKEN,
      network: effectiveNetwork,
      stellarAddress: stellarPublicKey,
      stellarExplorer: `${STELLAR_EXPLORER}${stellarPublicKey}`,
      customerId,
      walletId,
      awaitTime: INSTANCE_TYPE === "production" ? "up to 5 minutes" : "~30 seconds (simulated)",
    });
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.body });
  }
});

// ─── API: Payin Status ───────────────────────────────────────────────────────

app.get("/api/payin/:id", async (req, res) => {
  try {
    const payin = await blindpay(`/instances/${INSTANCE_ID}/payins/${req.params.id}`);
    res.json({
      id: payin.id,
      status: payin.status,
      pixCode: payin.pix_code,
      tracking: {
        transaction: payin.tracking_transaction?.step,
        payment: payin.tracking_payment?.step,
        complete: payin.tracking_complete?.step,
      },
      txHash: payin.tracking_complete?.transaction_hash || null,
      senderAmount: payin.sender_amount,
      receiverAmount: payin.receiver_amount,
      token: payin.token,
      updatedAt: payin.updated_at,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Frontend HTML ───────────────────────────────────────────────────────────

function getFrontendHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PIX → Stellar · BlindPay</title>
  <style>
    :root {
      --green: #00b06c;
      --red: #e74c3c;
      --bg: #f5f5f5;
      --card: #fff;
      --text: #333;
      --muted: #888;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: var(--card);
      border-radius: 16px;
      padding: 40px 36px;
      max-width: 520px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.06);
    }
    .header {
      text-align: center;
      margin-bottom: 28px;
    }
    .header h1 { font-size: 22px; font-weight: 700; color: #111; margin-bottom: 4px; }
    .header .sub { font-size: 13px; color: var(--muted); }
    .form-group { margin-bottom: 20px; }
    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      color: #555;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .form-group input {
      width: 100%;
      padding: 12px 14px;
      border: 1.5px solid #e0e0e0;
      border-radius: 10px;
      font-size: 16px;
      transition: border 0.15s;
      outline: none;
    }
    .form-group input:focus { border-color: var(--green); }
    .hint { font-size: 11px; color: var(--muted); margin-top: 4px; }
    .btn {
      width: 100%;
      padding: 14px;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .btn-primary { background: #111; color: #fff; }
    .btn-primary:hover { background: #333; }
    .btn-primary:disabled { background: #ccc; cursor: not-allowed; }
    .status-bar {
      margin-top: 8px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      display: none;
    }
    .status-bar.info { background: #e3f2fd; color: #1565c0; display: block; }
    .status-bar.error { background: #ffebee; color: #c62828; display: block; }
    .result {
      display: none;
      margin-top: 24px;
    }
    .result.show { display: block; }
    .amount-display {
      text-align: center;
      margin-bottom: 20px;
    }
    .amount-display .fiat {
      font-size: 36px;
      font-weight: 800;
      color: var(--green);
    }
    .amount-display .convert {
      font-size: 14px;
      color: var(--muted);
      margin-top: 4px;
    }
    .qr-section {
      text-align: center;
      margin-bottom: 20px;
    }
    .qr-section img {
      width: 240px;
      height: 240px;
      border-radius: 8px;
      border: 1px solid #eee;
    }
    .pix-code-box {
      background: #f9f9f9;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 14px;
      font-size: 12px;
      color: #333;
      word-break: break-all;
      text-align: left;
      line-height: 1.7;
      margin-bottom: 10px;
      position: relative;
    }
    .copy-btn {
      display: inline-block;
      background: #111;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin-bottom: 20px;
    }
    .copy-btn.copied { background: var(--green); }
    .steps {
      list-style: none;
      padding: 0;
    }
    .steps li {
      font-size: 14px;
      color: #555;
      padding: 8px 0;
      padding-left: 28px;
      position: relative;
    }
    .steps li::before {
      content: "○";
      position: absolute;
      left: 0;
      color: var(--muted);
      font-size: 14px;
    }
    .steps li.done::before { content: "✓"; color: var(--green); }
    .steps li.current::before { content: "●"; color: var(--green); animation: pulse 1.5s infinite; }
    .steps li.error::before { content: "✗"; color: var(--red); }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
    .progress {
      margin-top: 20px;
      padding: 14px;
      background: #f0faf5;
      border-radius: 8px;
      text-align: center;
      font-size: 14px;
      color: var(--green);
    }
    .progress strong { display: block; font-size: 16px; }
    .meta { font-size: 11px; color: #bbb; text-align: center; margin-top: 16px; }
    .setup-warning {
      background: #fff3cd;
      border: 1px solid #ffc107;
      border-radius: 8px;
      padding: 12px;
      font-size: 13px;
      color: #856404;
      margin-bottom: 16px;
      text-align: center;
    }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>PIX → Stellar</h1>
    <div class="sub">Envie BRL via PIX · Receba ${TOKEN} na Stellar ${effectiveNetwork}</div>
  </div>

  <div id="setupWarning" class="setup-warning" style="display:none"></div>

  <!-- STEP 1: Input form -->
  <div id="stepInput">
    <div class="form-group">
      <label>Valor em Reais (BRL)</label>
      <input type="number" id="amountInput" value="100" min="1" step="0.01" placeholder="Ex: 100">
      <div class="hint" id="amountHint"></div>
    </div>
    <button class="btn btn-primary" id="generateBtn" onclick="generatePix()">
      Gerar PIX
    </button>
    <div id="statusBar" class="status-bar"></div>
  </div>

  <!-- STEP 2: Result (PIX code + QR) -->
  <div id="stepResult" class="result">
    <div class="amount-display">
      <div class="fiat" id="resultFiat">R$ 0.00</div>
      <div class="convert" id="resultConvert">→ 0.00 ${TOKEN} na Stellar</div>
    </div>

    <div class="qr-section" id="qrSection">
      <img id="qrImage" src="" alt="QR Code PIX">
    </div>

    <div style="text-align:center;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
      ou copie o código PIX
    </div>
    <div class="pix-code-box" id="pixCodeBox"></div>
    <button class="copy-btn" onclick="copyPix()">Copiar código PIX</button>

    <ol class="steps" id="stepsList">
      <li class="done">Abrir app do banco</li>
      <li id="stepPix" class="current">Pagar R$ <span id="stepPixAmount">0.00</span> via PIX</li>
      <li id="stepConfirm" class="">Aguardando confirmação...</li>
    </ol>

    <div class="progress" id="progressBox" style="display:none"></div>

    <button class="btn btn-primary" id="newBtn" onclick="resetForm()" style="display:none;margin-top:16px;">
      Novo PIX
    </button>
    <div class="meta" id="metaInfo"></div>
  </div>
</div>

<script>
const API = "";
let currentPayinId = null;
let pollTimer = null;

async function checkSetup() {
  try {
    const r = await fetch(API + "/api/status");
    const s = await r.json();
    if (!s.hasTos) {
      const w = document.getElementById("setupWarning");
      w.style.display = "block";
      w.innerHTML = '⚠️ <b>Termos de serviço não aceitos.</b> ' +
        '<a href="' + API + '/api/tos/generate" target="_blank" style="color:#856404;font-weight:600">Clique aqui</a> ' +
        'para aceitar os termos em uma nova aba. Depois recarregue esta página.';
      document.getElementById("generateBtn").disabled = true;
    }
  } catch(e) {}
}

async function generatePix() {
  const amount = document.getElementById("amountInput").value;
  const btn = document.getElementById("generateBtn");
  const bar = document.getElementById("statusBar");

  btn.disabled = true;
  bar.className = "status-bar info";
  bar.textContent = "Gerando PIX...";

  try {
    const r = await fetch(API + "/api/payin/full", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Math.round(parseFloat(amount) * 100) })
    });
    const data = await r.json();

    if (!r.ok || data.error) {
      bar.className = "status-bar error";
      bar.textContent = "Erro: " + (data.error || "unknown");
      if (data.action) bar.textContent += " " + data.action;
      if (data.details) bar.textContent += " " + JSON.stringify(data.details);
      btn.disabled = false;
      return;
    }

    // Hide input, show result
    document.getElementById("stepInput").style.display = "none";
    document.getElementById("stepResult").classList.add("show");
    bar.style.display = "none";

    document.getElementById("resultFiat").textContent =
      "R$ " + (data.senderAmount / 100).toFixed(2);
    document.getElementById("resultConvert").textContent =
      "→ " + (data.receiverAmount / 100).toFixed(2) + " " + data.token + " na Stellar " + data.network;
    document.getElementById("stepPixAmount").textContent =
      (data.senderAmount / 100).toFixed(2);

    if (data.isRealPix) {
      document.getElementById("pixCodeBox").textContent = data.pixCode;
      if (data.qrDataUrl) {
        document.getElementById("qrImage").src = data.qrDataUrl;
        document.getElementById("qrSection").style.display = "block";
      }
    } else {
      document.getElementById("pixCodeBox").textContent =
        "[SIMULADO] PIX de desenvolvimento — pagamento automático em ~30s";
      document.getElementById("qrSection").style.display = "none";
    }

    document.getElementById("metaInfo").innerHTML =
      'Payin: <code>' + data.payinId + '</code><br>' +
      (data.stellarAddress
        ? 'Carteira Stellar: <a href="' + data.stellarExplorer + '" target="_blank">' +
          data.stellarAddress.substring(0,8) + '…</a>'
        : '');

    currentPayinId = data.payinId;
    startPolling(data.awaitTime);

  } catch(e) {
    bar.className = "status-bar error";
    bar.textContent = "Erro: " + e.message;
    btn.disabled = false;
  }
}

function startPolling(awaitTime) {
  document.getElementById("progressBox").style.display = "block";
  document.getElementById("progressBox").innerHTML =
    "<strong>Aguardando pagamento</strong>" + awaitTime;
  document.getElementById("stepConfirm").classList.add("current");

  let count = 0;
  pollTimer = setInterval(async () => {
    count++;
    try {
      const r = await fetch(API + "/api/payin/" + currentPayinId);
      const d = await r.json();

      const box = document.getElementById("progressBox");
      box.innerHTML = "<strong>Status: " + d.status + "</strong>" +
        " tx:" + d.tracking.transaction +
        " pay:" + d.tracking.payment +
        " complete:" + d.tracking.complete;

      if (d.status === "completed") {
        clearInterval(pollTimer);
        box.innerHTML = "<strong>✅ Pagamento confirmado!</strong>" +
          (d.token || "${TOKEN}") + " enviado para Stellar.";
        if (d.txHash) box.innerHTML += "<br>TX: <code>" + d.txHash.substring(0,20) + "…</code>";
        document.getElementById("stepConfirm").classList.remove("current");
        document.getElementById("stepConfirm").classList.add("done");
        document.getElementById("stepConfirm").textContent = "Confirmado!";
        document.getElementById("newBtn").style.display = "block";
      }
      if (d.status === "failed" || d.status === "refunded" || d.status === "canceled") {
        clearInterval(pollTimer);
        box.innerHTML = "<strong>❌ " + d.status + "</strong>";
        document.getElementById("stepConfirm").classList.remove("current");
        document.getElementById("stepConfirm").classList.add("error");
        document.getElementById("newBtn").style.display = "block";
      }
    } catch(e) {
      document.getElementById("progressBox").textContent = "Erro ao verificar status...";
    }

    if (count > 72) { // 6 min timeout
      clearInterval(pollTimer);
      document.getElementById("progressBox").textContent = "Timeout — verifique o dashboard BlindPay.";
      document.getElementById("newBtn").style.display = "block";
    }
  }, 5000);
}

function copyPix() {
  const code = document.getElementById("pixCodeBox").textContent;
  if (!code || code.startsWith("[")) return;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector(".copy-btn");
    btn.textContent = "Copiado! ✓";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "Copiar código PIX"; btn.classList.remove("copied"); }, 2000);
  });
}

function resetForm() {
  clearInterval(pollTimer);
  document.getElementById("stepInput").style.display = "block";
  document.getElementById("stepResult").classList.remove("show");
  document.getElementById("generateBtn").disabled = false;
  currentPayinId = null;
}

checkSetup();
</script>
</body>
</html>`;
}

// ─── Start Server ────────────────────────────────────────────────────────────

// Pre-flight: if no TOS, generate URL and print it
const initialSetup = async () => {
  const state = loadState();
  if (!state.tosId) {
    console.log("\n⚠️  Terms of Service not yet accepted (one-time setup).");
    try {
      const result = await blindpay(`/instances/${INSTANCE_ID}/tos`, {
        method: "POST",
        body: {
          redirect_url: `http://localhost:${PORT}/api/tos/callback`,
          idempotency_key: randomUUID(),
        },
        isTos: true,
      });
      console.log("\n📋 Open this URL in your browser to accept the Terms of Service:");
      console.log(`   ${result.url}\n`);
      console.log("   After accepting, you'll be redirected back and the app will work.\n");
    } catch (err) {
      console.error("Failed to generate TOS URL:", err.message);
    }
  }
};

app.listen(PORT, async () => {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  BlindPay  |  PIX → Stellar Payin Server");
  console.log(`  Instance:  ${INSTANCE_ID} (${INSTANCE_TYPE})`);
  console.log(`  Network:   Stellar ${effectiveNetwork.toUpperCase()}`);
  console.log(`  Token:     ${TOKEN}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log(`\n🌐 Frontend: http://localhost:${PORT}`);
  console.log(`📡 API:       http://localhost:${PORT}/api/status`);
  console.log("");

  await initialSetup();
});
