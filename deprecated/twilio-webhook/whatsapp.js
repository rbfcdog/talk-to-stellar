require("dotenv").config();
const express = require("express");
const twilio = require("twilio");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public-wa"));

// ─── In-memory log ────────────────────────────────────────────────────────────
const events = [];
function log(type, data) {
  const entry = { type, data, ts: new Date().toISOString() };
  events.unshift(entry);
  if (events.length > 100) events.pop();
  console.log(`[${type}]`, JSON.stringify(data));
  return entry;
}

const BACKEND_BASE = (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');

function normalizeWhatsAppPhone(from) {
  return String(from || '').replace(/^whatsapp:/i, '').replace(/\D+/g, '');
}

// ─── Auto-reply logic — edit this! ───────────────────────────────────────────
async function getReply(incomingMsg, from) {
  const msg = (incomingMsg || "").toLowerCase().trim();
  const phone = normalizeWhatsAppPhone(from);

  if (msg.startsWith('recuperar conta')) {
    try {
      const initRes = await fetch(`${BACKEND_BASE}/api/external/recovery-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const payload = await initRes.json();
      if (!initRes.ok || !payload.success) {
        return `Nao consegui iniciar recuperacao agora: ${payload.message || 'erro desconhecido'}.`;
      }

      const devHint = payload.dev_otp ? ` (dev otp: ${payload.dev_otp})` : '';
      return `Enviamos um codigo OTP para seu WhatsApp. Responda neste formato: codigo 123456 pin 4321${devHint}`;
    } catch (error) {
      return 'Nao consegui iniciar a recuperacao agora. Tente novamente em instantes.';
    }
  }

  const recoveryMatch = msg.match(/codigo\s*(\d{6})\s*pin\s*([^\s]+)/i);
  if (recoveryMatch) {
    const otp = recoveryMatch[1];
    const newPassword = recoveryMatch[2];

    try {
      const completeRes = await fetch(`${BACKEND_BASE}/api/external/recovery-complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          otp,
          new_password: newPassword,
        }),
      });
      const payload = await completeRes.json();
      if (!completeRes.ok || !payload.success) {
        return `Falha na recuperacao: ${payload.message || 'codigo invalido'}`;
      }
      return 'Conta recuperada com sucesso. Sua nova senha/PIN ja esta ativa.';
    } catch {
      return 'Nao consegui concluir a recuperacao agora. Tente novamente.';
    }
  }

  if (msg === "oi" || msg === "ola" || msg === "olá" || msg === "hi" || msg === "hello")
    return `Olá! 👋 Bem-vindo! Como posso te ajudar?\n\nDigite *ajuda* para ver as opções.`;

  if (msg === "ajuda" || msg === "help")
    return `📋 *Menu de opções:*\n\n1️⃣ Digite *horario* — ver horários\n2️⃣ Digite *contato* — falar com alguém\n3️⃣ Digite *oi* — recomeçar\n\nComo posso ajudar?`;

  if (msg === "horario" || msg === "horário")
    return `🕐 *Horários de atendimento:*\n\nSeg–Sex: 09h às 18h\nSáb: 09h às 13h\nDom: Fechado`;

  if (msg === "contato")
    return `📞 *Fale com a gente:*\n\nEmail: contato@empresa.com\nWhatsApp: esse mesmo número 😄`;

  // Default fallback
  return `Recebi sua mensagem: "${incomingMsg}" ✅\n\nDigite *ajuda* para ver as opções.`;
}

// ─── Webhook: inbound WhatsApp message ───────────────────────────────────────
app.post("/webhook/whatsapp", async (req, res) => {
  const { From, Body, MediaUrl0, MediaContentType0, ProfileName, NumMedia } = req.body;

  log("inbound", {
    from: From,
    name: ProfileName || "—",
    body: Body,
    media: MediaUrl0 || null,
    mediaType: MediaContentType0 || null,
  });

  const reply = await getReply(Body, From);

  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(reply);

  res.type("text/xml");
  res.send(twiml.toString());
});

// ─── Webhook: message status updates ─────────────────────────────────────────
app.post("/webhook/whatsapp/status", (req, res) => {
  const { MessageSid, MessageStatus, To, ErrorCode } = req.body;
  log("status", { sid: MessageSid, status: MessageStatus, to: To, error: ErrorCode || null });
  res.sendStatus(204);
});

// ─── API: send outbound WhatsApp message ─────────────────────────────────────
app.post("/api/send", async (req, res) => {
  const { to, body } = req.body;
  const sid  = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_WHATSAPP_NUMBER; // whatsapp:+55...

  if (!sid || sid.startsWith("ACxxx"))
    return res.status(400).json({ error: "Twilio credentials not set in .env" });

  try {
    const client = twilio(sid, token);
    const msg = await client.messages.create({
      from,
      to: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
      body,
    });
    log("outbound", { to, body, sid: msg.sid, status: msg.status });
    res.json({ ok: true, sid: msg.sid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── API: event log for dashboard ────────────────────────────────────────────
app.get("/api/events", (_req, res) => res.json(events));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime().toFixed(1) + "s", events: events.length })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const num = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+55...";
  console.log(`
╔══════════════════════════════════════════╗
║   WhatsApp Webhook Server — Twilio       ║
╚══════════════════════════════════════════╝

  🟢 Running on http://localhost:${PORT}
  📱 Sender: ${num}

  Endpoints:
    POST /webhook/whatsapp         ← inbound messages
    POST /webhook/whatsapp/status  ← delivery status
    GET  /api/events               ← event log (dashboard)
    POST /api/send                 ← send outbound message

  Dashboard → http://localhost:${PORT}

  Next: run ngrok in another terminal
    ngrok http ${PORT}
`);
});
