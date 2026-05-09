require("dotenv").config();
const express = require("express");
const twilio = require("twilio");
const path = require("path");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));

// ─── In-memory log store (resets on server restart) ──────────────────────────
const eventLog = [];
function addEvent(type, data) {
  const entry = { type, data, ts: new Date().toISOString() };
  eventLog.unshift(entry); // newest first
  if (eventLog.length > 100) eventLog.pop();
  return entry;
}

// ─── Signature validation middleware ─────────────────────────────────────────
function validateTwilio(req, res, next) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || authToken === "your_auth_token_here") {
    console.warn("⚠️  Skipping Twilio signature validation (no auth token set)");
    return next();
  }
  const valid = twilio.validateRequest(
    authToken,
    req.headers["x-twilio-signature"] || "",
    `${req.protocol}://${req.get("host")}${req.originalUrl}`,
    req.body
  );
  if (!valid) {
    console.error("❌ Invalid Twilio signature — request rejected");
    return res.status(403).send("Forbidden");
  }
  next();
}

// ─── SMS Webhook ──────────────────────────────────────────────────────────────
app.post("/webhook/sms", validateTwilio, (req, res) => {
  const { From, To, Body, MessageSid, NumMedia } = req.body;

  const event = addEvent("sms", { from: From, to: To, body: Body, sid: MessageSid, numMedia: NumMedia });
  console.log(`📱 SMS | From: ${From} | Body: "${Body}"`);

  // Reply with TwiML
  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>✅ Webhook received! You said: "${Body}"</Message>
</Response>`);
});

// ─── Voice Webhook ─────────────────────────────────────────────────────────────
app.post("/webhook/voice", validateTwilio, (req, res) => {
  const { From, To, CallSid, CallStatus, Direction } = req.body;

  addEvent("voice", { from: From, to: To, callSid: CallSid, status: CallStatus, direction: Direction });
  console.log(`📞 Call | From: ${From} | Status: ${CallStatus}`);

  res.set("Content-Type", "text/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Hello! Your webhook is working perfectly. Goodbye!</Say>
  <Hangup/>
</Response>`);
});

// ─── Voice Status Callback ────────────────────────────────────────────────────
app.post("/webhook/voice/status", (req, res) => {
  const { CallSid, CallStatus, Duration, From, To } = req.body;

  addEvent("voice_status", { callSid: CallSid, status: CallStatus, duration: Duration, from: From, to: To });
  console.log(`📞 Call status | SID: ${CallSid} | Status: ${CallStatus} | Duration: ${Duration}s`);

  res.sendStatus(204);
});

// ─── API: get event log (used by the dashboard) ───────────────────────────────
app.get("/api/events", (req, res) => {
  res.json(eventLog);
});

// ─── API: send an outbound SMS for testing ────────────────────────────────────
app.post("/api/send-sms", async (req, res) => {
  const { to, body } = req.body;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || accountSid.startsWith("ACxxx")) {
    return res.status(400).json({ error: "Twilio credentials not configured in .env" });
  }

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({ to, from, body });
    addEvent("outbound_sms", { to, body, sid: message.sid, status: message.status });
    console.log(`📤 Outbound SMS sent to ${to} | SID: ${message.sid}`);
    res.json({ success: true, sid: message.sid });
  } catch (err) {
    console.error("Send SMS error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime().toFixed(1) + "s", events: eventLog.length });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Twilio Webhook Server running on http://localhost:${PORT}`);
  console.log(`\n  Webhook endpoints:`);
  console.log(`    POST /webhook/sms          ← incoming SMS`);
  console.log(`    POST /webhook/voice        ← incoming calls`);
  console.log(`    POST /webhook/voice/status ← call status callbacks`);
  console.log(`\n  Dashboard: http://localhost:${PORT}`);
  console.log(`\n  ⚡ Point ngrok at port ${PORT} then configure Twilio Console.\n`);
});
