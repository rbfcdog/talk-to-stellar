import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("external channel login", () => {
  it("keeps resolved WhatsApp and Telegram login password-only without requiring email entry", () => {
    const text = source("app/login/login-client.tsx");

    expect(text).toContain('["whatsapp", "phone", "telegram"].includes(externalProvider)');
    expect(text).toContain("const useExternalPinOnlyLogin = hasExternalContext && isExternalLoginOnlyContext && Boolean(externalResolvedLogin)");
    expect(text).toContain("!loginEmail");
    expect(text).toContain("email: loginEmail || undefined");
    expect(text).toContain("const externalSessionScope = externalProvider ===");
    expect(text).toContain("session_scope: externalSessionScope");
    expect(text).toContain("...externalSessionContext");
  });

  it("offers email password/PIN recovery from login and preserves external token context", () => {
    const text = source("app/login/login-client.tsx");
    const securityProxy = source("app/api/security/[...path]/route.ts");
    const dictionary = source("lib/i18n.tsx");
    const securePinGate = source("components/shared/secure-pin-gate.tsx");

    expect(text).toContain('fetch("/api/security/reset-pin-init"');
    expect(text).toContain("forgot_pin: true");
    expect(text).toContain("login_recovery: true");
    expect(text).toContain("token: canUseExternalRecovery ? externalToken : undefined");
    expect(text).toContain("provider_user_id: hasExternalContext ? externalProviderUserId : getBrowserId()");
    expect(text).toContain("login_forgot_pin");
    expect(dictionary).toContain('login_forgot_pin: "Forgot password or PIN?"');
    expect(dictionary).toContain('login_forgot_pin: "Esqueci senha ou PIN"');
    expect(securityProxy).toContain('proxyBackendApi(req, "api/security"');
    expect(securePinGate).toContain('fetch("/api/security/reset-pin-init"');
    expect(securePinGate).toContain("forgot_pin: true");
  });

  it("does not auto-redirect external signup links to the PIN login screen", () => {
    const createText = source("app/create-account/create-account-client.tsx");

    expect(createText).not.toContain("window.location.replace(loginHref)");
    expect(createText).toContain("const loginHref = useMemo");
    expect(createText).toContain("I already have an account");
  });

  it("locks the create-account phone field to the WhatsApp token number", () => {
    const createText = source("app/create-account/create-account-client.tsx");

    expect(createText).toContain("const lockedWhatsAppPhoneNumber = useMemo");
    expect(createText).toContain("tokenPayload?.provider_user_id");
    expect(createText).toContain("setPhoneNumber(formatInternationalPhoneInput(lockedWhatsAppPhoneNumber))");
    expect(createText).toContain("disabled={Boolean(lockedWhatsAppPhoneNumber)}");
  });

  it("uses a session-linked setup page for create-account Passkey QR", () => {
    const createText = source("app/create-account/create-account-client.tsx");

    expect(createText).toContain('new URL(`${window.location.origin}/setup-passkey`)');
    expect(createText).toContain('purpose: "create_account_passkey_qr"');
    expect(createText).toContain("session_id: result.sessionId");
    expect(createText).not.toContain('new URL(`${window.location.origin}/login`)');
    expect(createText).not.toContain("setPasskeyQrTargetUrl(passkeySetupRedirectUrl)");
  });

  it("syncs language toggles to the backend preference endpoint", () => {
    const i18nText = source("lib/i18n.tsx");
    const routeText = source("app/api/chat/language/route.ts");

    expect(i18nText).toContain("syncLanguagePreference");
    expect(i18nText).toContain('fetch("/api/chat/language"');
    expect(i18nText).toContain("currentClientSessionScope");
    expect(routeText).toContain("/api/agent/language");
    expect(routeText).toContain("readSessionCookies");
  });
});
