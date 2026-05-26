"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { getClientSession, saveClientSession } from "@/lib/session";

type SessionSnapshot = {
  authenticated: boolean;
  sessionId: string;
};

type BrowserSnapshot = {
  checked: boolean;
  webauthn: boolean;
  platformAuthenticator: boolean;
};

type StepState = {
  loading: boolean;
  message: string;
  error: string;
};

function compact(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return "not set";
  if (raw.length <= 18) return raw;
  return `${raw.slice(0, 8)}...${raw.slice(-6)}`;
}

function passkeyErrorMessage(error: unknown) {
  const name = String((error as any)?.name || "");
  const message = String(error instanceof Error ? error.message : error || "");
  const normalized = message.toLowerCase();

  if (name === "NotAllowedError") {
    return "A confirmacao foi cancelada ou expirou. Toque no botao e confirme no aparelho novamente.";
  }
  if (name === "SecurityError" || normalized.includes("rp id")) {
    return "A passkey precisa abrir no dominio configurado em PASSKEY_RP_ID/PASSKEY_ORIGIN.";
  }
  if (/session|token|unauthor|auth|login/i.test(message)) {
    return "Entre na conta neste mesmo navegador antes de registrar a passkey.";
  }
  return message || "Nao foi possivel concluir o teste de passkey.";
}

async function postPasskey(path: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/passkeys/${path}`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || "Passkey request failed.");
  }
  return payload;
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto border border-tts-border bg-tts-bg p-3 text-xs leading-5 text-tts-muted">
      {JSON.stringify(value || {}, null, 2)}
    </pre>
  );
}

function StatusLine({
  ready,
  label,
  value,
}: {
  ready: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border border-tts-border bg-tts-bg px-3 py-2">
      <span className="text-xs font-black uppercase tracking-[0.12em] text-tts-muted">{label}</span>
      <span className={`inline-flex items-center gap-2 text-sm font-black ${ready ? "text-tts-confirm" : "text-tts-gold"}`}>
        {ready ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  loading,
  onClick,
  icon,
  variant = "primary",
}: {
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
  icon: ReactNode;
  variant?: "primary" | "secondary";
}) {
  const classes = variant === "primary"
    ? "bg-tts-gold text-tts-deep hover:bg-tts-gold-lt"
    : "border border-tts-border bg-tts-surface text-tts-deep hover:border-tts-border2";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex min-h-12 items-center justify-center gap-2 px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-45 ${classes}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}

export default function PasskeyTestClient() {
  const [session, setSession] = useState<SessionSnapshot>({ authenticated: false, sessionId: "" });
  const [browser, setBrowser] = useState<BrowserSnapshot>({
    checked: false,
    webauthn: false,
    platformAuthenticator: false,
  });
  const [identity, setIdentity] = useState("");
  const [registerState, setRegisterState] = useState<StepState>({ loading: false, message: "", error: "" });
  const [authState, setAuthState] = useState<StepState>({ loading: false, message: "", error: "" });
  const [statusState, setStatusState] = useState<StepState>({ loading: false, message: "", error: "" });
  const [lastRegistration, setLastRegistration] = useState<any>(null);
  const [lastAuthentication, setLastAuthentication] = useState<any>(null);
  const [smartStatus, setSmartStatus] = useState<any>(null);

  const smartConfig = smartStatus?.config || {};
  const passkeys = Array.isArray(smartStatus?.passkeys) ? smartStatus.passkeys : [];
  const canRegister = session.authenticated && browser.webauthn && !registerState.loading;
  const canAuthenticate = Boolean(identity.trim()) && browser.webauthn && !authState.loading;

  const readinessLabel = useMemo(() => {
    if (!browser.checked) return "checking";
    if (!browser.webauthn) return "unsupported";
    if (!session.authenticated) return "sign in first";
    return "ready";
  }, [browser.checked, browser.webauthn, session.authenticated]);

  async function refreshSession() {
    const next = await getClientSession();
    setSession({
      authenticated: next.authenticated,
      sessionId: next.sessionId,
    });
  }

  async function refreshSmartStatus(force = false) {
    if (!force && !session.authenticated) {
      setSmartStatus(null);
      setStatusState({
        loading: false,
        message: "",
        error: "Entre na conta antes de consultar o status OpenZeppelin.",
      });
      return;
    }

    setStatusState({ loading: true, message: "", error: "" });
    try {
      const payload = await postPasskey("smart-account-status", {});
      setSmartStatus(payload);
      setStatusState({ loading: false, message: "Status OpenZeppelin atualizado.", error: "" });
    } catch (error) {
      setStatusState({ loading: false, message: "", error: passkeyErrorMessage(error) });
    }
  }

  async function registerPasskey() {
    setRegisterState({ loading: true, message: "Preparando desafio de registro.", error: "" });
    setLastRegistration(null);
    try {
      const initPayload = await postPasskey("register-init", {});
      if (!initPayload?.options || !initPayload?.challengeId) {
        throw new Error("Backend nao devolveu um desafio de registro valido.");
      }

      setRegisterState({ loading: true, message: "Confirme a passkey no aparelho.", error: "" });
      const credential = await startRegistration({ optionsJSON: initPayload.options });
      const completePayload = await postPasskey("register-complete", {
        user_id: initPayload.userId || identity.trim() || undefined,
        challenge_id: initPayload.challengeId,
        credential,
      });

      setLastRegistration(completePayload);
      setIdentity(String(initPayload.userId || identity || ""));
      setRegisterState({ loading: false, message: "Passkey registrada e metadata P-256 salvo.", error: "" });
      await refreshSmartStatus(true);
    } catch (error) {
      setRegisterState({ loading: false, message: "", error: passkeyErrorMessage(error) });
    }
  }

  async function authenticatePasskey() {
    const login = identity.trim();
    if (!login) return;
    setAuthState({ loading: true, message: "Preparando desafio de login.", error: "" });
    setLastAuthentication(null);
    try {
      const initPayload = await postPasskey("auth-init", { email: login });
      if (initPayload.registrationRequired) {
        throw new Error("Essa conta ainda nao tem passkey registrada.");
      }
      if (!initPayload?.options || !initPayload?.challengeId) {
        throw new Error("Backend nao devolveu um desafio de autenticacao valido.");
      }

      setAuthState({ loading: true, message: "Confirme a passkey no aparelho.", error: "" });
      const credential = await startAuthentication({ optionsJSON: initPayload.options });
      const completePayload = await postPasskey("auth-complete", {
        user_id: initPayload.userId || login,
        challenge_id: initPayload.challengeId,
        credential,
      });

      saveClientSession();
      setLastAuthentication(completePayload);
      setAuthState({ loading: false, message: "Login com passkey validado.", error: "" });
      await refreshSession();
      await refreshSmartStatus(true);
    } catch (error) {
      setAuthState({ loading: false, message: "", error: passkeyErrorMessage(error) });
    }
  }

  useEffect(() => {
    let active = true;
    async function boot() {
      const [sessionPayload, platformAvailable] = await Promise.all([
        getClientSession(),
        platformAuthenticatorIsAvailable().catch(() => false),
      ]);
      if (!active) return;
      const userName = localStorage.getItem("talk-to-stellar.userName") || "";
      setIdentity(userName);
      setSession({
        authenticated: sessionPayload.authenticated,
        sessionId: sessionPayload.sessionId,
      });
      setBrowser({
        checked: true,
        webauthn: browserSupportsWebAuthn(),
        platformAuthenticator: platformAvailable,
      });
    }

    void boot();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session.authenticated) {
      void refreshSmartStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.authenticated, session.sessionId]);

  return (
    <main className="min-h-screen bg-tts-bg text-tts-deep">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="border-b border-tts-border pb-5">
          <div className="mb-3 inline-flex items-center gap-2 border border-tts-gold bg-tts-gold-bg px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-tts-gold">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            OpenZeppelin Passkey Test
          </div>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight md:text-4xl">
                Teste de passkey e smart account
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-tts-muted md:text-base">
                Registre uma passkey WebAuthn, valide login e confira o metadata P-256 usado pelo fluxo de smart account OpenZeppelin em Stellar.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[360px]">
              <ActionButton
                variant="secondary"
                onClick={refreshSession}
                icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              >
                Atualizar sessao
              </ActionButton>
              <a
                href="/login?next=/passkey-test"
                className="inline-flex min-h-12 items-center justify-center gap-2 bg-tts-gold px-4 py-2 text-sm font-black text-tts-deep transition hover:bg-tts-gold-lt"
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                Entrar
              </a>
            </div>
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-4">
          <StatusLine
            ready={browser.webauthn}
            label="WebAuthn"
            value={browser.checked ? (browser.webauthn ? "ok" : "not supported") : "checking"}
          />
          <StatusLine
            ready={browser.platformAuthenticator}
            label="Biometria"
            value={browser.checked ? (browser.platformAuthenticator ? "available" : "external only") : "checking"}
          />
          <StatusLine
            ready={session.authenticated}
            label="Sessao"
            value={session.authenticated ? "connected" : "not signed in"}
          />
          <StatusLine
            ready={readinessLabel === "ready"}
            label="Teste"
            value={readinessLabel}
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.1fr)]">
          <div className="border border-tts-border bg-tts-surface p-5">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <Fingerprint className="h-5 w-5 text-tts-gold" aria-hidden="true" />
              Fluxo de teste
            </h2>
            <p className="mt-2 text-sm leading-6 text-tts-muted">
              Para registrar, entre com PIN primeiro. Para testar login, informe o e-mail ou usuario da conta que ja tem passkey.
            </p>

            <label className="mt-5 block text-sm font-black" htmlFor="passkey-identity">
              E-mail ou usuario
            </label>
            <input
              id="passkey-identity"
              value={identity}
              onChange={(event) => setIdentity(event.target.value)}
              placeholder="user@example.com"
              className="mt-2 min-h-12 w-full border border-tts-border bg-tts-bg px-3 text-sm font-bold text-tts-deep outline-none transition focus:border-tts-gold"
            />

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <ActionButton
                disabled={!canRegister}
                loading={registerState.loading}
                onClick={registerPasskey}
                icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
              >
                Registrar passkey
              </ActionButton>
              <ActionButton
                variant="secondary"
                disabled={!canAuthenticate}
                loading={authState.loading}
                onClick={authenticatePasskey}
                icon={<Fingerprint className="h-4 w-4" aria-hidden="true" />}
              >
                Testar login
              </ActionButton>
            </div>

            <div className="mt-5 grid gap-3">
              <Feedback state={registerState} />
              <Feedback state={authState} />
              <Feedback state={statusState} />
            </div>
          </div>

          <div className="grid gap-5">
            <section className="border border-tts-border bg-tts-surface p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-xl font-black">
                    <ShieldCheck className="h-5 w-5 text-tts-confirm" aria-hidden="true" />
                    OpenZeppelin smart account
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-tts-muted">
                    O backend grava o signer WebAuthn P-256 e mostra se o modo smart account esta apenas em metadata ou pronto para execucao.
                  </p>
                </div>
                <ActionButton
                  variant="secondary"
                  disabled={!session.authenticated}
                  loading={statusState.loading}
                  onClick={refreshSmartStatus}
                  icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
                >
                  Consultar
                </ActionButton>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Mini label="standard" value={String(smartConfig.standard || "openzeppelin-stellar-contracts/accounts")} />
                <Mini label="network" value={String(smartConfig.network || "not loaded")} />
                <Mini label="enabled" value={smartConfig.enabled ? "true" : "false"} />
                <Mini label="verifier" value={compact(smartConfig.verifierAddress)} />
                <Mini label="context rule" value={smartConfig.contextRuleId === null || smartConfig.contextRuleId === undefined ? "not set" : String(smartConfig.contextRuleId)} />
                <Mini label="stored passkeys" value={String(passkeys.length)} />
              </div>
            </section>

            {passkeys.length ? (
              <section className="border border-tts-border bg-tts-surface p-5">
                <h2 className="text-lg font-black">Passkeys cadastradas</h2>
                <div className="mt-4 grid gap-3">
                  {passkeys.map((item: any) => (
                    <div key={item.credentialId} className="border border-tts-border bg-tts-bg p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-mono-financial text-sm font-black text-tts-gold">{compact(item.credentialId)}</span>
                        <span className="text-xs font-bold text-tts-muted">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "created date unavailable"}</span>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <Mini label="signer" value={String(item.smartAccount?.signer || "not stored")} />
                        <Mini label="P-256 key" value={item.smartAccount?.credentialPublicKeyP256 ? "stored" : "missing"} />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="border border-tts-border bg-tts-surface p-5">
            <h2 className="text-lg font-black">Ultimo registro</h2>
            <div className="mt-3">
              <JsonBlock value={lastRegistration || { waiting: "register a passkey" }} />
            </div>
          </div>
          <div className="border border-tts-border bg-tts-surface p-5">
            <h2 className="text-lg font-black">Ultima autenticacao</h2>
            <div className="mt-3">
              <JsonBlock value={lastAuthentication || { waiting: "test passkey login" }} />
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function Feedback({ state }: { state: StepState }) {
  if (!state.message && !state.error) return null;
  return (
    <div className={`border p-3 text-sm leading-6 ${state.error ? "border-tts-error bg-tts-error/10 text-tts-error" : "border-tts-confirm bg-tts-confirm/10 text-tts-deep"}`}>
      <p className="flex items-center gap-2 font-bold">
        {state.loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : state.error ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
        {state.error || state.message}
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-tts-border bg-tts-bg p-3">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-tts-muted">{label}</p>
      <p className="mt-1 font-mono-financial text-sm font-black text-tts-deep">{value}</p>
    </div>
  );
}
