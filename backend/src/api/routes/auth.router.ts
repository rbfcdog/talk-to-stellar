import express from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../../config/supabase";
import { AgentRepository } from "../repository/core/agent.repository";
import ExternalService from "../services/core/external.service";
import { isSessionExpired } from "../../utils/session-expiry";
import { publicErrorMessage } from "../../utils/public-error";

const router = express.Router();
const agentRepository = new AgentRepository(supabase);
const externalService = new ExternalService(supabase as any);

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function getGoogleClientId(): string {
  return String(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim();
}

async function verifyGoogleIdToken(idToken: string): Promise<any> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`, {
  });
  const payload = (await response.json().catch(() => ({}))) as any;
  if (!response.ok) {
    throw new Error(String(payload?.error_description || payload?.error || "Invalid Google token."));
  }
  const clientId = getGoogleClientId();
  if (clientId && String(payload?.aud || "") !== clientId) {
    throw new Error("Google token audience does not match the configured client.");
  }
  const issuer = String(payload?.iss || "").trim();
  if (!["accounts.google.com", "https://accounts.google.com"].includes(issuer)) {
    throw new Error("Google token issuer is invalid.");
  }
  if (String(payload?.email_verified || "").toLowerCase() !== "true") {
    throw new Error("Google email is not verified.");
  }
  return payload;
}

async function findReusableSession(email: string): Promise<any | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("agent_sessions")
    .select("session_id, user_id, email, session_token, public_key, phone_number, pix_key, password_hash, session_password_hash, created_at, last_activity, updated_at")
    .ilike("email", normalized)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve Google session: ${error.message || JSON.stringify(error)}`);
  }

  if (!data || isSessionExpired(data)) return null;
  return data;
}

export function sessionHasPin(session: any): boolean {
  return Boolean(
    String(session?.session_password_hash || "").trim() ||
    String(session?.password_hash || "").trim()
  );
}

function googlePinSetupPayload(input: { email: string; displayName: string; reason: string; language?: string }) {
  const onboard = externalService.createOnboardUrl("google", input.email, {
    email: input.email,
    name: input.displayName || undefined,
    display_name: input.displayName || undefined,
    source: "google",
    language: input.language || undefined,
    email_verified: true,
    email_verification_source: "google_oauth",
  });

  return {
    success: true,
    provider: "google",
    requires_pin_setup: true,
    email: input.email,
    user_id: input.email,
    display_name: input.displayName,
    reason: input.reason,
    token: onboard.token,
    creationUrl: onboard.url,
    message: "Create your PIN to finish Google sign-in.",
  };
}

router.post("/google", async (req, res) => {
  try {
    const idToken = String(req.body?.credential || req.body?.id_token || req.body?.idToken || "").trim();
    if (!idToken) {
      return res.status(400).json({ success: false, message: "Google credential is required." });
    }

    if (!getGoogleClientId()) {
      return res.status(503).json({
        success: false,
        message: "GOOGLE_CLIENT_ID is not configured on the server.",
      });
    }

    const google = await verifyGoogleIdToken(idToken);
    const email = normalizeEmail(google?.email);
    const displayName = String(google?.name || google?.given_name || google?.email || "").trim();
    const language = String(req.body?.language || req.body?.lang || req.body?.locale || "").trim();
    if (!email) {
      return res.status(400).json({ success: false, message: "Google account email not found." });
    }

    const existing = await findReusableSession(email);
    if (!existing) {
      return res.status(200).json(googlePinSetupPayload({
        email,
        displayName,
        language,
        reason: "google_account_not_linked",
      }));
    }

    if (!sessionHasPin(existing)) {
      return res.status(200).json(googlePinSetupPayload({
        email,
        displayName,
        language,
        reason: "pin_setup_required",
      }));
    }

    const sessionId = String(existing?.session_id || uuidv4()).trim();
    const sessionToken = crypto.randomUUID();
    const userId = String(existing?.user_id || email).trim();
    const sessionData = {
      session_token: sessionToken,
      user_id: userId,
      email,
      public_key: existing?.public_key || undefined,
      phone_number: existing?.phone_number || undefined,
      pix_key: existing?.pix_key || undefined,
      password_hash: existing?.password_hash || undefined,
      session_password_hash: existing?.session_password_hash || undefined,
      email_verified: true,
      email_verified_at: new Date().toISOString(),
      email_verification_source: "google_oauth",
      created_at: existing?.created_at || new Date().toISOString(),
      last_activity: new Date().toISOString(),
    };

    await agentRepository.saveSession(sessionId, sessionData as any);

    return res.status(200).json({
      success: true,
      provider: "google",
      session_id: sessionId,
      session_token: sessionToken,
      email,
      user_id: userId,
      display_name: displayName,
      picture: String(google?.picture || "").trim() || undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(401).json({
      success: false,
      message: publicErrorMessage(message, "Google sign-in failed."),
    });
  }
});

export default router;
