/**
 * DentPeg PIX Deposit Server
 *
 * One-click PIX payment page. User enters amount → gets QR code →
 * pays via PIX from their bank app → server polls until confirmed →
 * DentPeg sends DePix/USDT/USDC to your configured wallet.
 *
 * ─── Endpoints ──────────────────────────────────────────────────────────
 *
 *   GET  /                     Frontend (PIX payment page)
 *   GET  /api/status           Server config + profile info
 *   POST /api/deposit          Create a PIX deposit (returns QR + code)
 *   GET  /api/deposit/:id      Poll deposit status
 *   GET  /api/deposits         List recent deposits
 *   GET  /api/payout-config    Show current payout mode
 *   PUT  /api/payout-config    Set payout mode (USDT/USDC on BSC/ETH/SOL)
 *   POST /api/webhook          Register a webhook URL
 *   GET  /api/profile          Account info
 *   POST /api/withdrawal       Create withdrawal (DePix → PIX)
 *
 * ─── Payout Modes ─────────────────────────────────────────────────────
 *
 *   DEPIX        → Liquid Network (default, auto-configured)
 *   USDT_BSC     → USDT on BSC (BEP-20)
 *   USDT_ETH     → USDT on Ethereum (ERC-20)
 *   USDC_BSC     → USDC on BSC (BEP-20)
 *   USDC_ETH     → USDC on Ethereum (ERC-20)
 *   USDT_SOLANA  → USDT on Solana (SPL)
 *   USDC_SOLANA  → USDC on Solana (SPL)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import express from "express";
import cors from "cors";
import QRCode from "qrcode";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY     = process.env.DENTPEG_API_KEY;
const PORT        = parseInt(process.env.PORT || "3334", 10);
const BASE_URL    = "https://api.dentpeg.com/api/v1";
const POLL_MS     = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);
const WH_SECRET   = process.env.DENTPEG_WEBHOOK_SECRET || null;
const STATE_FILE  = resolve(__dirname, ".dentpeg-state.json");

// Payout config (where tokens go after PIX is paid)
const PAYOUT_TYPE    = process.env.DENTPEG_PAYOUT_TYPE || "DEPIX";
const PAYOUT_ADDRESS = process.env.DENTPEG_PAYOUT_ADDRESS || null;

// ═══════════════════════════════════════════════════════════════════════════

let apiKeyValid = true;
if (!API_KEY || API_KEY === "dpx_your_api_key_here") {
  console.warn("⚠️  DENTPEG_API_KEY not set. The frontend works but API calls will fail.");
  console.warn("   1. Go to https://app.dentpeg.com → sign up");
  console.warn("   2. Go to Desenvolvedores → create API key");
  console.warn("   3. Set DENTPEG_API_KEY=dpx_... in dentpeg/.env");
  console.warn("   4. Restart: npm start\n");
  apiKeyValid = false;
}

// ─── State ───────────────────────────────────────────────────────────────────

function loadState() {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, "utf-8")); } catch {}
  }
  return {};
}
function saveState(updates) {
  writeFileSync(STATE_FILE, JSON.stringify({ ...loadState(), ...updates }, null, 2));
}

// ─── DentPeg API ─────────────────────────────────────────────────────────────

async function api(path, { method = "GET", body } = {}) {
  if (!apiKeyValid) {
    throw Object.assign(new Error("API key not configured. Set DENTPEG_API_KEY in .env"), { status: 401 });
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    const err = new Error(`${res.status}: ${json.message || text}`);
    err.status = res.status;
    err.body   = json;
    throw err;
  }
  return json;
}

// ─── Express App ─────────────────────────────────────────────────────────────

process.on("unhandledRejection", (r) => console.error("UNHANDLED:", r?.message));
process.on("uncaughtException", (e) => {
  console.error("CRASH:", e.message);
  if (e.code !== "EADDRINUSE") process.exit(1);
});

const app = express();
app.use(cors());
app.use(express.json());

// ─── Frontend ────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(getFrontendHTML());
});

// ─── API: Status + Profile ───────────────────────────────────────────────────

app.get("/api/status", async (req, res) => {
  try {
    const profile = await api("/profile");
    const payout   = await api("/payout-config").catch(() => ({}));
    res.json({
      ok: true,
      profile: profile.user || profile,
      payout: {
        type: payout.payoutType || PAYOUT_TYPE,
        address: payout.usdtAddress || payout.savedAddresses?.[payout.payoutType] || PAYOUT_ADDRESS,
        isActive: payout.isActive ?? true,
      },
      baseUrl: BASE_URL,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Profile ────────────────────────────────────────────────────────────

app.get("/api/profile", async (req, res) => {
  try {
    const data = await api("/profile");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Create Deposit ─────────────────────────────────────────────────────

app.post("/api/deposit", async (req, res) => {
  try {
    const { amountInCents } = req.body;
    const cents = parseInt(amountInCents);

    if (!cents || cents < 100) {
      return res.status(400).json({ error: "Minimum deposit: R$1.00 (100 cents)" });
    }

    const data = await api("/deposits", {
      method: "POST",
      body: { amountInCents: cents },
    });

    const dep = data.deposit;

    // Generate QR code data URL from the pix code
    let qrDataUrl = null;
    if (dep.qrCode) {
      try {
        qrDataUrl = await QRCode.toDataURL(dep.qrCode, {
          width: 300,
          margin: 2,
          color: { dark: "#000000", light: "#ffffff" },
        });
      } catch {}
    }

    // Track in history
    const state = loadState();
    const history = state.history || [];
    history.unshift({
      id: dep.id,
      amountInCents: dep.amountInCents,
      status: dep.status,
      createdAt: dep.createdAt,
    });
    saveState({ history: history.slice(0, 100) });

    res.json({
      ok: true,
      deposit: {
        id: dep.id,
        status: dep.status,
        amountInCents: dep.amountInCents,
        amountBRL: (dep.amountInCents / 100).toFixed(2),
        feeCents: dep.feeCents,
        feeBRL: (dep.feeCents / 100).toFixed(2),
        netCents: dep.netCents,
        netBRL: (dep.netCents / 100).toFixed(2),
        feePercent: dep.feePercent,
        pixCode: dep.qrCode,
        pixQrImage: dep.qrImageUrl || qrDataUrl,
        qrDataUrl,
        expiration: dep.expiration,
        createdAt: dep.createdAt,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.body });
  }
});

// ─── API: Deposit Status ─────────────────────────────────────────────────────

app.get("/api/deposit/:id", async (req, res) => {
  try {
    const data = await api(`/deposits/${req.params.id}`);
    const dep = data.deposit;
    res.json({
      id: dep.id,
      status: dep.status,
      amountInCents: dep.amountInCents,
      amountBRL: (dep.amountInCents / 100).toFixed(2),
      feeCents: dep.feeCents,
      netCents: dep.netCents,
      netBRL: (dep.netCents / 100).toFixed(2),
      pixCode: dep.qrCode,
      expiration: dep.expiration,
      createdAt: dep.createdAt,
      updatedAt: dep.updatedAt,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ─── API: List Deposits ──────────────────────────────────────────────────────

app.get("/api/deposits", async (req, res) => {
  try {
    const page  = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const data  = await api(`/statement?page=${page}&limit=${limit}&types=DEPOSIT`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Payout Config ──────────────────────────────────────────────────────

app.get("/api/payout-config", async (req, res) => {
  try {
    const data = await api("/payout-config");
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/payout-config", async (req, res) => {
  try {
    const data = await api("/payout-config", {
      method: "PUT",
      body: req.body,
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.body });
  }
});

// ─── API: Webhook Registration ───────────────────────────────────────────────

app.post("/api/webhook", async (req, res) => {
  try {
    const data = await api("/webhooks", {
      method: "POST",
      body: {
        url: req.body.url,
        events: req.body.events || ["deposit.confirmed", "deposit.expired", "deposit.error"],
      },
    });
    saveState({ webhookSecret: data.webhook?.secret });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.body });
  }
});

// ─── API: Webhook Receiver (for DentPeg to call) ─────────────────────────────

app.post("/api/webhook/receive", async (req, res) => {
  const secret = WH_SECRET || loadState().webhookSecret;
  const event  = req.body;

  const processEvent = () => {
    console.log(`📨 Webhook: ${event.event} → ${event.data?.depositId || "?"}`);
    const state = loadState();
    const history = state.history || [];
    history.unshift({ type: "webhook", event: event.event, depositId: event.data?.depositId, at: new Date().toISOString() });
    saveState({ history: history.slice(0, 100) });
    res.json({ received: true });
  };

  if (secret) {
    const crypto = await import("crypto").catch(() => null);
    if (crypto) {
      const signature = req.headers["x-webhook-signature"];
      const payload   = JSON.stringify(event);
      const expected  = crypto.createHmac("sha256", secret).update(payload).digest("hex");
      if (signature !== expected) {
        return res.status(401).json({ error: "Invalid signature" });
      }
    }
  }
  processEvent();
});

// ─── API: Withdrawal (DePix → PIX) ─────────────────────────────────────────

app.post("/api/withdrawal", async (req, res) => {
  try {
    const data = await api("/withdrawals", {
      method: "POST",
      body: {
        pixKeyType: req.body.pixKeyType || "CPF",
        pixKey: req.body.pixKey,
        netCents: parseInt(req.body.netCents),
      },
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message, details: err.body });
  }
});

// ─── Frontend HTML ───────────────────────────────────────────────────────────

function getFrontendHTML() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PIX · DentPeg</title>
  <style>
    :root {
      --green: #00b06c;
      --red: #e74c3c;
      --blue: #2563eb;
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
    .header .sub a { color: var(--blue); }
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
      outline: none;
      transition: border 0.15s;
    }
    .form-group input:focus { border-color: var(--green); }
    .hint { font-size: 11px; color: var(--muted); margin-top: 4px; }
    .preset-btns {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .preset-btn {
      padding: 6px 14px;
      border: 1px solid #ddd;
      border-radius: 20px;
      background: #fff;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
      color: #555;
    }
    .preset-btn:hover { border-color: var(--green); color: var(--green); }
    .preset-btn.active { background: var(--green); color: #fff; border-color: var(--green); }
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
    .result { display: none; margin-top: 24px; }
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
    .qr-section { text-align: center; margin-bottom: 20px; }
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
    .steps { list-style: none; padding: 0; }
    .steps li {
      font-size: 14px;
      color: #555;
      padding: 8px 0;
      padding-left: 28px;
      position: relative;
    }
    .steps li::before { content: "○"; position: absolute; left: 0; color: var(--muted); font-size: 14px; }
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
    .progress.error-box { background: #fff3cd; color: #856404; }
    .meta { font-size: 11px; color: #bbb; text-align: center; margin-top: 16px; }
    .meta code { font-size: 11px; }
    .payout-info {
      background: #f0f7ff;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12px;
      color: #555;
      margin-bottom: 16px;
      text-align: center;
    }
    .payout-info strong { color: #111; }
  </style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>Gerar PIX</h1>
    <div class="sub" id="payoutInfo">Carregando destino...</div>
    <div id="stellarNote" style="display:none;margin-top:8px;padding:6px 12px;background:#fff3cd;border-radius:6px;font-size:11px;color:#856404;text-align:center;">
      ⚠️ DentPeg não entrega em Stellar. Para PIX → USDC na Stellar use <b>BlindPay</b> (pasta blindpay/)
    </div>
  </div>

  <div id="stepInput">
    <div class="preset-btns" id="presets">
      <button class="preset-btn" onclick="setAmount(10)">R$10</button>
      <button class="preset-btn" onclick="setAmount(50)">R$50</button>
      <button class="preset-btn" onclick="setAmount(100)">R$100</button>
      <button class="preset-btn active" onclick="setAmount(200)">R$200</button>
      <button class="preset-btn" onclick="setAmount(500)">R$500</button>
    </div>
    <div class="form-group">
      <label>Valor em Reais (BRL)</label>
      <input type="number" id="amountInput" value="200" min="1" step="0.01" placeholder="Ex: 200">
      <div class="hint">Mínimo: R$1.00 · Taxa: ~1.99%</div>
    </div>
    <button class="btn btn-primary" id="generateBtn" onclick="createDeposit()">
      Gerar PIX
    </button>
    <div id="statusBar" class="status-bar"></div>
  </div>

  <div id="stepResult" class="result">
    <div class="amount-display">
      <div class="fiat" id="resultFiat">R$ 0.00</div>
      <div class="convert" id="resultConvert"></div>
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
      <li id="stepPay" class="current">Pagar R$ <span id="stepPayAmount">0.00</span> via PIX</li>
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
let depositId = null;
let pollTimer = null;

async function init() {
  try {
    const r = await fetch(API + "/api/status");
    const s = await r.json();
    const el = document.getElementById("payoutInfo");
    const note = document.getElementById("stellarNote");

    if (s.error) {
      el.innerHTML = '<span style="color:#e74c3c">⚠ API key não configurada</span>';
      note.style.display = "block";
      return;
    }

    if (s.payout && s.payout.type) {
      const networks = {
        DEPIX: "Liquid Network", USDC_BSC: "BSC", USDC_ETH: "Ethereum",
        USDC_SOLANA: "Solana", USDT_BSC: "BSC", USDT_ETH: "Ethereum",
        USDT_SOLANA: "Solana"
      };
      el.innerHTML = 'Recebendo <strong>' + s.payout.type.replace(/_/g,' ') + '</strong> na <strong>' +
        (networks[s.payout.type] || s.payout.type) + '</strong>';
      note.style.display = "block";
    } else {
      el.textContent = 'PIX → recebimento automático';
    }
  } catch(e) {
    document.getElementById("payoutInfo").textContent = 'Erro ao carregar...';
  }
}

function setAmount(val) {
  document.getElementById("amountInput").value = val;
  document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
  event.target.classList.add("active");
}

async function createDeposit() {
  const amount = document.getElementById("amountInput").value;
  const btn = document.getElementById("generateBtn");
  const bar = document.getElementById("statusBar");

  if (!amount || parseFloat(amount) <= 0) return;

  btn.disabled = true;
  bar.className = "status-bar info";
  bar.textContent = "Gerando PIX...";

  try {
    const r = await fetch(API + "/api/deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountInCents: Math.round(parseFloat(amount) * 100) })
    });
    const data = await r.json();

    if (!r.ok || data.error) {
      bar.className = "status-bar error";
      bar.textContent = "Erro: " + (data.error || "desconhecido");
      if (data.details) bar.textContent += " " + JSON.stringify(data.details);
      btn.disabled = false;
      return;
    }

    const d = data.deposit;
    depositId = d.id;

    // Show result
    document.getElementById("stepInput").style.display = "none";
    document.getElementById("stepResult").classList.add("show");
    bar.style.display = "none";

    document.getElementById("resultFiat").textContent = "R$ " + d.amountBRL;
    document.getElementById("resultConvert").textContent =
      "Taxa: R$ " + d.feeBRL + " (" + (d.feePercent * 100).toFixed(2) + "%) · Líquido: R$ " + d.netBRL;
    document.getElementById("stepPayAmount").textContent = d.amountBRL;

    document.getElementById("pixCodeBox").textContent = d.pixCode;

    if (d.qrDataUrl) {
      document.getElementById("qrImage").src = d.qrDataUrl;
      document.getElementById("qrSection").style.display = "block";
    } else if (d.pixQrImage) {
      document.getElementById("qrImage").src = d.pixQrImage;
      document.getElementById("qrSection").style.display = "block";
    } else {
      document.getElementById("qrSection").style.display = "none";
    }

    document.getElementById("metaInfo").innerHTML =
      'ID: <code>' + d.id + '</code> · Expira: ' + new Date(d.expiration).toLocaleTimeString();

    startPolling();

  } catch(e) {
    bar.className = "status-bar error";
    bar.textContent = "Erro: " + e.message;
    btn.disabled = false;
  }
}

function startPolling() {
  const box = document.getElementById("progressBox");
  box.style.display = "block";
  box.className = "progress";
  box.innerHTML = "<strong>Aguardando pagamento PIX...</strong>Verifique seu app bancário";

  let count = 0;
  pollTimer = setInterval(async () => {
    count++;
    try {
      const r = await fetch(API + "/api/deposit/" + depositId);
      const d = await r.json();

      if (d.status === "under_review" || d.status === "pending_pix2fa") {
        box.innerHTML = "<strong>" + statusLabel(d.status) + "</strong>Processando pagamento...";
        document.getElementById("stepConfirm").classList.add("current");
      }

      if (d.status === "depix_sent") {
        clearInterval(pollTimer);
        box.innerHTML = "<strong>✅ Pagamento confirmado!</strong>" +
          "R$ " + d.netBRL + " recebidos.";
        document.getElementById("stepConfirm").classList.remove("current");
        document.getElementById("stepConfirm").classList.add("done");
        document.getElementById("stepConfirm").textContent = "Confirmado! R$ " + d.netBRL;
        document.getElementById("stepPay").classList.remove("current");
        document.getElementById("stepPay").classList.add("done");
        document.getElementById("newBtn").style.display = "block";
      }

      if (["expired", "canceled", "error", "refunded"].includes(d.status)) {
        clearInterval(pollTimer);
        box.className = "progress error-box";
        box.innerHTML = "<strong>❌ " + statusLabel(d.status) + "</strong>";
        document.getElementById("stepConfirm").classList.remove("current");
        document.getElementById("stepConfirm").classList.add("error");
        document.getElementById("newBtn").style.display = "block";
      }

      // Update pending status text
      if (d.status === "pending") {
        document.getElementById("stepConfirm").textContent =
          "Aguardando pagamento (" + (count * 5) + "s)...";
      }
    } catch(e) {
      console.error(e);
    }
  }, 5000);
}

function statusLabel(s) {
  const labels = {
    pending: "⏳ Aguardando pagamento",
    pending_pix2fa: "🔐 Aguardando 2FA",
    under_review: "🔍 Em análise",
    depix_sent: "✅ Confirmado",
    expired: "⌛ Expirado",
    canceled: "🚫 Cancelado",
    refunded: "↩️ Estornado",
    error: "❌ Erro"
  };
  return labels[s] || s;
}

function copyPix() {
  const code = document.getElementById("pixCodeBox").textContent;
  if (!code) return;
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
  document.getElementById("stepConfirm").classList.remove("done","error","current");
  document.getElementById("stepConfirm").textContent = "Aguardando confirmação...";
  document.getElementById("stepPay").classList.remove("done");
  document.getElementById("stepPay").classList.add("current");
  depositId = null;
}

init();
</script>
</body>
</html>`;
}

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  DentPeg  |  PIX Deposit Server");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  🌐 Frontend:  http://localhost:${PORT}`);
  console.log(`  📡 API:       http://localhost:${PORT}/api/status`);
  console.log("");

  // Verify API key works
  if (apiKeyValid) {
    try {
      const profile = await api("/profile");
      const name = profile.user?.name || profile.user?.email || "?";
      const status = profile.user?.status || "?";
      console.log(`  ✓ Conta:      ${name} (${status})`);
    } catch (err) {
      console.log(`  ✗ API key:    ${err.message}`);
    }
  }

  console.log("\n  Abra http://localhost:" + PORT + " no navegador\n");
});
