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

  const selectSessionFields = "session_id, user_id, email, session_token, public_key, phone_number, pix_key, password_hash, session_password_hash, created_at, last_activity, updated_at";
  const candidates = new Map<string, any>();

  async function collectByField(field: "email" | "user_id", value: string) {
    const lookupValue = normalizeEmail(value);
    if (!lookupValue) return;
    const { data, error } = await supabase
      .from("agent_sessions")
      .select(selectSessionFields)
      .ilike(field, lookupValue)
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error) {
      throw new Error(`Failed to resolve Google session: ${error.message || JSON.stringify(error)}`);
    }

    for (const row of data || []) {
      const sessionId = String((row as any)?.session_id || "").trim();
      if (sessionId) candidates.set(sessionId, row);
    }
  }

  async function collectBySessionId(sessionId: string) {
    const normalizedSessionId = String(sessionId || "").trim();
    if (!normalizedSessionId) return;
    const { data, error } = await supabase
      .from("agent_sessions")
      .select(selectSessionFields)
      .eq("session_id", normalizedSessionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to resolve Google mapped session: ${error.message || JSON.stringify(error)}`);
    }

    if (data?.session_id) candidates.set(String(data.session_id), data);
  }

  await collectByField("email", normalized);
  await collectByField("user_id", normalized);

  try {
    const mapped = await externalService.checkExternalAccount("google", normalized);
    if (mapped?.session_id) {
      await collectBySessionId(String(mapped.session_id));
    }
    if (mapped?.user_id) {
      await collectByField("user_id", String(mapped.user_id));
      await collectByField("email", String(mapped.user_id));
    }
    const mappedData = mapped?.data && typeof mapped.data === "object" ? mapped.data as Record<string, unknown> : {};
    const mappedEmail = normalizeEmail(mappedData.email || mappedData.user_id || mappedData.userId);
    if (mappedEmail) {
      await collectByField("email", mappedEmail);
      await collectByField("user_id", mappedEmail);
    }
  } catch (error: any) {
    const message = String(error?.message || "").toLowerCase();
    const missingExternalAccounts =
      message.includes("external_accounts") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("relation"));
    if (!missingExternalAccounts) throw error;
  }

  return selectGoogleSessionCandidate(Array.from(candidates.values()));
}

export function sessionHasPin(session: any): boolean {
  return Boolean(
    String(session?.session_password_hash || "").trim() ||
    String(session?.password_hash || "").trim()
  );
}

export function selectGoogleSessionCandidate(sessions: any[]): any | null {
  const ordered = (sessions || []).filter(Boolean).sort((a: any, b: any) => {
    const aTime = new Date(a?.updated_at || a?.last_activity || a?.created_at || 0).getTime();
    const bTime = new Date(b?.updated_at || b?.last_activity || b?.created_at || 0).getTime();
    return bTime - aTime;
  });

  return ordered.find(sessionHasPin) || ordered.find((session) => !isSessionExpired(session)) || ordered[0] || null;
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

export function googleExistingLoginPayload(input: { email: string; displayName: string; reason: string; language?: string }) {
  const isPt = String(input.language || "").trim().toLowerCase().startsWith("pt");
  return {
    success: true,
    provider: "google",
    existing_account: true,
    requires_login: true,
    login_required: true,
    requires_pin_setup: false,
    email: input.email,
    user_id: input.email,
    display_name: input.displayName,
    reason: input.reason,
    message: isPt
      ? "Conta encontrada. Entre com seu PIN ou use Esqueci o PIN para receber o link de configuração por e-mail."
      : "Account found. Sign in with your PIN or use Forgot PIN to receive the setup link by email.",
  };
}

async function rememberGoogleMapping(input: { email: string; sessionId: string; userId: string; displayName?: string; picture?: string }) {
  try {
    await externalService.repo.createMapping({
      provider: "google",
      provider_user_id: input.email,
      session_id: input.sessionId,
      user_id: input.userId,
      data: {
        email: input.email,
        name: input.displayName || undefined,
        display_name: input.displayName || undefined,
        picture: input.picture || undefined,
        source: "google",
        email_verified: true,
        linked_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    const message = String(error?.message || "").toLowerCase();
    const missingExternalAccounts =
      message.includes("external_accounts") &&
      (message.includes("schema cache") || message.includes("does not exist") || message.includes("relation"));
    if (!missingExternalAccounts) {
      console.warn("[auth-google] could not persist Google mapping:", error instanceof Error ? error.message : String(error));
    }
  }
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
      return res.status(200).json(googleExistingLoginPayload({
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
    await rememberGoogleMapping({
      email,
      sessionId,
      userId,
      displayName,
      picture: String(google?.picture || "").trim(),
    });

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
