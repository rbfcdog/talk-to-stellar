/**
 * BlindPay PIX → Stellar Payin Flow  (Production-ready)
 *
 * This script walks through the full payin process:
 *   0. Generate a fresh Stellar keypair (public + secret key)
 *   1. Create a PIX Payin Quote (USDC)
 *   2. Initiate the Payin
 *   3. Open a local webpage showing the QR code + PIX Copia e Cola code
 *   4. Poll until stablecoins land in the wallet
 *
 * Prerequisites:
 *   npm install @stellar/stellar-sdk
 *
 * Setup:
 *   Copy .env.example to .env and fill in your values, then run:
 *   node --env-file=.env index.js
 */

import http from "http";
import { exec } from "child_process";
import { Keypair } from "@stellar/stellar-sdk";

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY     = process.env.BLINDPAY_API_KEY;
const INSTANCE_ID = process.env.BLINDPAY_INSTANCE_ID;

const BASE_URL  = "https://api.blindpay.com/v1";
const HTTP_PORT = 3333;

if (!API_KEY || !INSTANCE_ID) {
  console.error(`
Missing environment variables. Create a .env file with:

  BLINDPAY_API_KEY=your_key
  BLINDPAY_INSTANCE_ID=in_xxxxxxxxxxxx

Then run:

  node --env-file=.env index.js
`);
  process.exit(1);
}

// ─── Step 0: Generate Stellar Keypair ────────────────────────────────────────

function generateStellarKeypair() {
  const keypair = Keypair.random();
  const publicKey = keypair.publicKey();
  const secretKey = keypair.secret();

  console.log("═══════════════════════════════════════════════════════");
  console.log("  ✨ New Stellar Wallet Generated");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Public key:  ${publicKey}`);
  console.log(`  Secret key:  ${secretKey}`);
  console.log("═══════════════════════════════════════════════════════");
  console.log("  ⚠️  Save your secret key somewhere safe — it will");
  console.log("      NOT be shown again and cannot be recovered.");
  console.log("═══════════════════════════════════════════════════════\n");

  return { publicKey, secretKey };
}

// ─── Local HTTP Server (shows QR code + PIX code in browser) ─────────────────

let pixPageHtml = "<p>Waiting for payin to be initiated...</p>";

function startPixServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(pixPageHtml);
  });
  server.listen(HTTP_PORT, () => {
    console.log(`\n🌐 PIX payment page running at http://localhost:${HTTP_PORT}`);
  });
  return server;
}

function buildPixPage({ pixCode, pixQrCode, fiatAmount, stablecoinAmount, payinId }) {
  const qrSection = pixQrCode
    ? `<img src="data:image/png;base64,${pixQrCode}" alt="PIX QR Code" style="width:260px;height:260px;display:block;margin:0 auto 24px;" />`
    : `<p style="color:#888;font-size:14px;">(QR code not returned by API)</p>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pagar via PIX · BlindPay</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 40px 36px;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      text-align: center;
    }
    .logo { font-size: 13px; color: #888; margin-bottom: 24px; letter-spacing: 1px; text-transform: uppercase; }
    h1 { font-size: 22px; font-weight: 700; color: #111; margin-bottom: 6px; }
    .subtitle { font-size: 14px; color: #666; margin-bottom: 28px; }
    .amount {
      font-size: 36px; font-weight: 800; color: #00b06c;
      margin-bottom: 4px;
    }
    .converts {
      font-size: 13px; color: #999; margin-bottom: 28px;
    }
    .qr-wrap {
      background: #f9f9f9;
      border: 1px solid #eee;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .label {
      font-size: 12px; font-weight: 600; color: #888;
      text-transform: uppercase; letter-spacing: 0.8px;
      margin-bottom: 10px;
    }
    .pix-code-box {
      background: #f4f4f4;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 12px 14px;
      font-size: 11px;
      color: #333;
      word-break: break-all;
      text-align: left;
      margin-bottom: 10px;
      line-height: 1.6;
    }
    .copy-btn {
      display: inline-block;
      background: #111;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 10px 22px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .copy-btn:hover { background: #333; }
    .copy-btn.copied { background: #00b06c; }
    .footer { font-size: 12px; color: #bbb; margin-top: 28px; }
    .payin-id { font-family: monospace; font-size: 11px; color: #ccc; margin-top: 6px; }
    .steps { text-align: left; margin-bottom: 28px; }
    .steps li { font-size: 14px; color: #555; margin-bottom: 8px; padding-left: 4px; }
    .steps li::marker { color: #00b06c; font-weight: 700; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">BlindPay · PIX → Stellar</div>
    <h1>Pague com PIX</h1>
    <p class="subtitle">Após o pagamento, você receberá USDC na sua carteira Stellar.</p>

    <div class="amount">R$ ${(fiatAmount / 100).toFixed(2)}</div>
    <div class="converts">→ ${(stablecoinAmount / 100).toFixed(2)} USDC na Stellar</div>

    <div class="qr-wrap">
      <div class="label">Escaneie o QR Code</div>
      ${qrSection}
      <div class="label" style="margin-top:16px;">ou use o PIX Copia e Cola</div>
      <div class="pix-code-box" id="pixCode">${pixCode}</div>
      <button class="copy-btn" id="copyBtn" onclick="copyPix()">Copiar código PIX</button>
    </div>

    <ol class="steps">
      <li>Abra o app do seu banco</li>
      <li>Escolha pagar via PIX</li>
      <li>Escaneie o QR code ou cole o código acima</li>
      <li>Confirme o pagamento de <strong>R$ ${(fiatAmount / 100).toFixed(2)}</strong></li>
    </ol>

    <div class="footer">
      Aguardando confirmação do pagamento...
      <div class="payin-id">Payin ID: ${payinId}</div>
    </div>
  </div>

  <script>
    function copyPix() {
      const code = document.getElementById("pixCode").innerText;
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById("copyBtn");
        btn.textContent = "Copiado! ✓";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Copiar código PIX";
          btn.classList.remove("copied");
        }, 2000);
      });
    }
  </script>
</body>
</html>`;
}

function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open"
            : process.platform === "win32"  ? "start"
            : "xdg-open";
  exec(`${cmd} ${url}`);
}

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
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
    console.error(`\n❌ API error [${res.status}] ${method} ${path}`);
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  return json;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Steps ───────────────────────────────────────────────────────────────────

/*
async function createReceiver() {
  console.log("\n[1/4] Creating receiver...");
  const res = await api("POST", `/instances/${INSTANCE_ID}/receivers`, {
    type: "individual",
    kyc_type: "standard",
    first_name: "João",
    last_name: "Silva",
    email: "joao.silva@example.com",
    tax_id: "12345678901",
    document_type: "cpf",
    document_number: "12345678901",
    country: "BR",
    date_of_birth: "1990-01-01T00:00:00.000Z",
    address_line_1: "Av. Paulista, 1000",
    city: "São Paulo",
    state_province_region: "SP",
    postal_code: "01310000",
    id_doc_country: "BR",
    id_doc_type: "ID_CARD",
    selfie_file: process.env.BLINDPAY_SELFIE_FILE || "dev-selfie-file-id",
    id_doc_front_file: process.env.BLINDPAY_ID_DOC_FRONT_FILE || "dev-id-front-file-id",
    id_doc_back_file: process.env.BLINDPAY_ID_DOC_BACK_FILE || "dev-id-back-file-id",
  });

  console.log(`✅ Receiver created: ${res.id} (KYC status: ${res.kyc_status})`);
  return res.id;
}

async function addStellarWallet(receiverId, publicKey) {
  console.log("\n[2/4] Registering Stellar wallet with BlindPay...");

  const res = await api(
    "POST",
    `/instances/${INSTANCE_ID}/receivers/${receiverId}/blockchain-wallets`,
    {
      address: publicKey,
      chain: "stellar",
      is_account_abstraction: true,
    }
  );

  console.log(`✅ Blockchain wallet registered: ${res.id}`);
  console.log(`   Address: ${res.address}`);
  return res.id;
}
*/

async function createPayinQuote(blockchainWalletId) {
  console.log("\n[1/3] Creating PIX → Stellar USDC payin quote...");

  // blockchain_wallet_id must be exactly 15 chars (a BlindPay wallet ID)
  const walletId = process.env.BLINDPAY_BLOCKCHAIN_WALLET_ID;
  if (!walletId || walletId.length !== 15) {
    console.error("\nMissing or invalid BLINDPAY_BLOCKCHAIN_WALLET_ID. It must be exactly 15 characters.");
    process.exit(1);
  }

  // request_amount is in cents: 10000 = R$100.00
  const res = await api("POST", `/instances/${INSTANCE_ID}/payin-quotes`, {
    blockchain_wallet_id: walletId,
    payment_method: "pix",
    currency_type: "receiver",
    token: "USDC",
    request_amount: 10000,       // R$100.00 in cents — change as needed
    cover_fees: false,           // receiver pays fees
  });

  console.log(`✅ Quote created: ${res.id}`);
  console.log(`   You send:        R$${(res.fiat_amount / 100).toFixed(2)} via PIX`);
  console.log(`   Receiver gets:   ${(res.stablecoin_amount / 100).toFixed(2)} USDC on Stellar`);
  console.log(`   Exchange rate:   ${res.exchange_rate}`);
  console.log(`   Expires in:      5 minutes`);
  return { quoteId: res.id, fiatAmount: res.fiat_amount, stablecoinAmount: res.stablecoin_amount };
}

async function initiatePayin(quoteId, fiatAmount, stablecoinAmount, pixServer) {
  console.log("\n[2/3] Initiating payin...");

  const res = await api("POST", `/instances/${INSTANCE_ID}/payins/evm`, {
    payin_quote_id: quoteId,
  });

  console.log(`✅ Payin initiated: ${res.id}`);
  console.log(`   Status: ${res.status}`);

  if (!res.pix_code) {
    console.warn("⚠️  No pix_code in response — check BlindPay dashboard.");
  } else {
    // Update the local server page and open the browser
    pixPageHtml = buildPixPage({
      pixCode: res.pix_code,
      pixQrCode: res.pix_qr_code || null,
      fiatAmount,
      stablecoinAmount,
      payinId: res.id,
    });

    const url = `http://localhost:${HTTP_PORT}`;
    console.log(`\n📲 Opening payment page in your browser: ${url}`);
    console.log(`   Scan the QR code or copy the PIX code to pay.`);
    openBrowser(url);
  }

  console.log(`\n⏳ Waiting for PIX payment (up to 5 minutes on production)...`);
  return res.id;
}

async function pollPayinStatus(payinId, pixServer) {
  console.log("\n[3/3] Polling payin status...");

  // Poll for up to 6 minutes (PIX has a 5-minute window in production)
  for (let i = 0; i < 72; i++) {
    await sleep(5000);
    const res = await api("GET", `/instances/${INSTANCE_ID}/payins/${payinId}`);
    process.stdout.write(`\r   Status: ${res.status}   (${((i + 1) * 5)}s elapsed)   `);

    if (res.status === "completed") {
      console.log(`\n\n🎉 Payin completed! USDC sent to your Stellar wallet.`);
      console.log(`   Blockchain TX: ${res.blockchain_tx_hash || "check dashboard"}`);
      pixServer.close();
      return;
    }
    if (res.status === "failed" || res.status === "refunded") {
      console.log(`\n\n❌ Payin ended with status: ${res.status}`);
      console.log(JSON.stringify(res, null, 2));
      pixServer.close();
      return;
    }
  }

  console.log(`\n\n⚠️  Timed out after 6 minutes. Check the BlindPay dashboard for status.`);
  pixServer.close();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════");
  console.log("  BlindPay  |  PIX → Stellar Payin (Production)");
  console.log(`  Instance: ${INSTANCE_ID}`);
  console.log("═══════════════════════════════════════════════════════\n");

  // Generate Stellar keypair — wallet ID comes from this
  const { publicKey } = generateStellarKeypair();

  const pixServer = startPixServer();

  // Use the public key as the wallet ID for payin
  const { quoteId, fiatAmount, stablecoinAmount } = await createPayinQuote();
  const payinId                            = await initiatePayin(quoteId, fiatAmount, stablecoinAmount, pixServer);
  await pollPayinStatus(payinId, pixServer);

  console.log(`\n✅ Done. Check your Stellar wallet on:`);
  console.log(`   https://stellar.expert/explorer/public/account/${publicKey}`);
}

main().catch(err => {
  console.error("\nFatal error:", err);
  process.exit(1);
});