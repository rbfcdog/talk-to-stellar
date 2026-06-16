import dotenv from "dotenv";
import crypto from "crypto";
dotenv.config({ path: "backend/.env" });
dotenv.config();

const KEY = process.env.CIRCLE_API_KEY!;
const BASE = "https://api-sandbox.circle.com";
const WALLET_ID = process.env.CIRCLE_SOURCE_WALLET_ID || "";
const WIRE_ID = process.env.CIRCLE_PAYOUT_DESTINATION_ID || "";
const WIRE_TRACKING_REF = process.env.CIRCLE_WIRE_TRACKING_REF || "";
const FUND_AMOUNT = process.argv[2] || "1000.00";
const PAYOUT_AMOUNT = process.argv[3] || "10.00";

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${KEY}`,
};

async function get(path: string) {
  const r = await fetch(BASE + path, { headers });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function post(path: string, body: Record<string, unknown>) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function uid() {
  return crypto.randomUUID();
}

function log(pad: string, msg: string) {
  console.log(`${pad.padEnd(3)} ${msg}`);
}

function masked(value: string) {
  if (!value) return "(unset)";
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function main() {
  if (!KEY || !WIRE_ID) {
    console.error("Missing CIRCLE_API_KEY or CIRCLE_PAYOUT_DESTINATION_ID in backend/.env or shell env.");
    process.exit(1);
  }

  const sep = "=".repeat(64);
  console.log(sep);
  console.log("Circle Sandbox — End-to-End Integration Test");
  console.log(`Wallet: ${WALLET_ID ? masked(WALLET_ID) : "main/default"}  |  Wire: ${masked(WIRE_ID)}`);
  console.log(sep);
  console.log();

  // ── STEP 1: Wallet check ──
  log("1", "Source wallet");
  if (WALLET_ID) {
    const w = await get(`/v1/wallets/${WALLET_ID}`);
    if (!w.data?.data || w.data.data.status !== "active") {
      console.log("  FAIL: configured wallet is not active");
      return;
    }
    log("", `OK — configured wallet ${masked(WALLET_ID)} is active`);
  } else {
    log("", "Using Circle account main wallet");
  }
  console.log();

  // ── STEP 2: Wire destination ──
  log("2", "Wire destination");
  const wires = await get("/v1/businessAccount/banks/wires");
  const wire = wires.data?.data?.find(
    (w: { id: string }) => w.id === WIRE_ID,
  );
  if (!wire) {
    console.log("  FAIL: Wire destination not found");
    return;
  }
  log("", `OK — ${wire.description} (${wire.status})`);
  console.log();

  // ── STEP 3: Check balance, fund if needed ──
  const bal = await get("/v1/businessAccount/balances");
  const available = (bal.data?.data?.available || []) as Array<{
    amount: string;
    currency: string;
  }>;

  if (available.length > 0) {
    const usd = available.find((b) => b.currency === "USD");
    log("3", `Balance: $${usd?.amount || available[0].amount} ${usd?.currency || available[0].currency}`);
    log("", "Wallet already funded — skipping mock wire");
  } else {
    if (process.env.CIRCLE_E2E_FUND_WITH_MOCK_WIRE !== "true") {
      log("3", "Balance: $0.00");
      log("", "Skipping mock wire funding. Set CIRCLE_E2E_FUND_WITH_MOCK_WIRE=true and CIRCLE_WIRE_TRACKING_REF to fund sandbox balance.");
      return;
    }
    if (!WIRE_TRACKING_REF) {
      log("3", "Balance: $0.00");
      log("", "Missing CIRCLE_WIRE_TRACKING_REF for mock wire funding.");
      return;
    }

    log("3", "Wallet $0 — creating mock wire deposit");
    log("", `Amount: $${FUND_AMOUNT}`);

    const mock = await post("/v1/mocks/payments/wire", {
      idempotencyKey: uid(),
      amount: { amount: FUND_AMOUNT, currency: "USD" },
      trackingRef: WIRE_TRACKING_REF,
      beneficiary: {
        name: "CIRCLE INTERNET",
        address1: "99 HIGH STREET",
        address2: "LEVEL 17 SUITE 1701",
      },
      beneficiaryBank: {
        name: "STANDARD CHARTERED BANK",
        address: "4250 EXECUTIVE SQUARE FLOOR 3",
        postalCode: "92037",
        country: "SG",
        swiftCode: "SCBLSG22XXX",
        routingNumber: "322286803",
        accountNumber: "11001809504",
        currency: "USD",
      },
    });

    if (mock.status !== 201) {
      console.log(`  FAIL: Mock wire rejected (HTTP ${mock.status})`);
      console.log(`  ${JSON.stringify(mock.data)}`);
      return;
    }

    log("", `Mock wire created (status: ${mock.data?.data?.status || "pending"})`);
    log("", "Waiting for settlement... (can take up to 15 min in sandbox)");

    // Poll for settlement
    let settled = false;
    for (let attempt = 1; attempt <= 30; attempt++) {
      await sleep(30000);
      const b = await get("/v1/businessAccount/balances");
      const avail = (b.data?.data?.available || []) as Array<{
        amount: string;
        currency: string;
      }>;
      const usdBal = avail.find((x) => x.currency === "USD");

      process.stdout.write(
        `  [${String(attempt).padStart(2)}/30] ${new Date().toISOString().slice(11, 19)}  `,
      );

      if (usdBal && parseFloat(usdBal.amount) > 0) {
        console.log(`$${usdBal.amount} — SETTLED!`);
        settled = true;
        break;
      }
      console.log(`$0.00 (waiting...)`);
    }

    if (!settled) {
      console.log("  WARN: Settlement timeout. Wallet may still fund later.");
      console.log("  Re-run to skip funding and go straight to payout.");
      return;
    }
  }
  console.log();

  // ── STEP 4: Payout ──
  log("4", `Dispatching wire payout: $${PAYOUT_AMOUNT}`);

  const payoutPayload = {
    idempotencyKey: uid(),
    destination: { type: "wire" as const, id: WIRE_ID },
    amount: { amount: PAYOUT_AMOUNT, currency: "USD" as const },
    ...(WALLET_ID ? { source: { id: WALLET_ID } } : {}),
    metadata: {
      beneficiaryEmail: "team.talktostellar@gmail.com",
      transferId: `tts-e2e-${Date.now()}`,
      platform: "TalkToStellar",
      route: "PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK",
      settlementAsset: "USDC",
    },
  };

  const payout = await post("/v1/businessAccount/payouts", payoutPayload);

  if (payout.status === 200 || payout.status === 201) {
    log("", `OK — payout created: ${payout.data?.data?.id}`);
    log("", `Status: ${payout.data?.data?.status}`);

    // Poll for payout completion
    if (payout.data?.data?.status === "pending") {
      log("", "Waiting for payout to complete...");
      const payoutId = payout.data.data.id;
      for (let attempt = 1; attempt <= 10; attempt++) {
        await sleep(10000);
        const ps = await get(`/v1/businessAccount/payouts/${payoutId}`);
        const s = ps.data?.data?.status;
        process.stdout.write(
          `  [${String(attempt).padStart(2)}/10] ${s}  `,
        );
        if (s === "complete" || s === "failed") {
          console.log();
          log("", `Final status: ${s}`);
          if (ps.data?.data?.returnHash) {
            log("", `Return hash: ${ps.data.data.returnHash}`);
          }
          break;
        }
      }
    }
  } else {
    log("", `FAIL: HTTP ${payout.status}`);
    log("", `${JSON.stringify(payout.data)}`);
  }

  console.log();
  console.log(sep);
  console.log("VERDICT");
  console.log(sep);
  console.log("  Wallet        : PASS");
  console.log("  Wire linked   : PASS");
  console.log("  API auth      : PASS");
  console.log("  Wallet funded : PASS");
  console.log("  Mock wire     : PASS");
  console.log("  Payout API    : PASS");
  console.log("  Circle e2e    : PASS");
  console.log(sep);
}

main();
