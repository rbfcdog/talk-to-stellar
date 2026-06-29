"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";

// Access password for the bridge features (wire on-ramp + yield) lives only in
// the backend env (BRIDGE_ACCESS_PASSWORD). We never embed it in the client
// bundle — instead we set the typed value as a cookie and let the backend
// validate it (a probe request). The Next proxy forwards the cookie as
// x-bridge-password; requireBridgePassword on the backend is the real gate.
const FLAG_KEY = "bridge_auth_ok";
// Persist the bridge unlock across browser sessions (cache ONLY the bridge
// access password — the channel PIN is never stored). 30 days.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

function setCookie(pw: string) {
  // Persistent cookie — the Next proxy forwards it to the backend as
  // x-bridge-password, so the user stays unlocked between visits.
  document.cookie = `bridge_pw=${encodeURIComponent(pw)}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

function clearCookie() {
  document.cookie = "bridge_pw=; path=/; max-age=0; samesite=lax";
}

// True only if the bridge_pw cookie is actually present. The unlock *flag* lives
// in localStorage, but the password rides in this cookie — if the cookie is
// gone (cleared, expired) while the flag lingers, requests 401 and the UI must
// re-prompt instead of silently showing "no wallets".
function hasBridgeCookie(): boolean {
  try {
    return document.cookie.split(";").some((c) => c.trim().startsWith("bridge_pw="));
  } catch {
    return false;
  }
}

// Probe a cheap authenticated bridge endpoint. Returns true if the cookie's
// password is accepted by the backend (anything other than the 401 auth error).
async function verifyPassword(pw: string): Promise<boolean> {
  setCookie(pw);
  try {
    const res = await fetch("/api/bridge?_path=/sponsor/status", {
      method: "GET",
      headers: { "x-bridge-password": pw },
    });
    if (res.status === 401) {
      const body = await res.json().catch(() => ({}));
      if (body?.code === "bridge_auth_required") return false;
    }
    return true;
  } catch {
    // Network/backend error — don't lock the user out over an unrelated failure.
    return true;
  }
}

/**
 * Hook: tracks whether the bridge access password has been entered this browser
 * session. `unlock()` flips it on and persists the flag.
 */
export function useBridgeAccess() {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    try {
      // Require BOTH the flag and the cookie. If they desynced, drop the flag so
      // the gate reappears rather than firing requests that 401.
      if (localStorage.getItem(FLAG_KEY) === "1" && hasBridgeCookie()) {
        setUnlocked(true);
      } else {
        localStorage.removeItem(FLAG_KEY);
      }
    } catch {
      /* ignore */
    }
    setChecked(true);
  }, []);

  function unlock() {
    try {
      localStorage.setItem(FLAG_KEY, "1");
    } catch {
      /* ignore */
    }
    setUnlocked(true);
  }

  // Force the gate back (e.g. after a 401 — the cookie was rejected/expired).
  function relock() {
    try {
      localStorage.removeItem(FLAG_KEY);
    } catch {
      /* ignore */
    }
    clearCookie();
    setUnlocked(false);
  }

  return { unlocked, checked, unlock, relock };
}

/**
 * Inline password field — drop it in front of the bridge-wallet part of a screen
 * (instead of blocking the whole page). Calls `onUnlock` once the backend accepts
 * the password. Styled with tts tokens to blend into the surrounding card.
 */
export function BridgeAccessField({
  onUnlock,
  title = "Bridge account — restricted",
  description = "Enter the access password to manage this account.",
  className = "",
}: {
  onUnlock: () => void;
  title?: string;
  description?: string;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pw = value.trim();
    if (!pw || submitting) return;
    setSubmitting(true);
    setError("");
    const ok = await verifyPassword(pw);
    if (ok) {
      onUnlock();
    } else {
      clearCookie();
      setError("Incorrect password.");
    }
    setSubmitting(false);
  }

  return (
    <form
      onSubmit={submit}
      className={`rounded-2xl border border-tts-border bg-tts-surface p-5 ${className}`}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tts-confirm/15 text-tts-confirm">
          <Lock className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-tts-deep">{title}</p>
          <p className="text-xs text-tts-muted">{description}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          placeholder="Access password"
          className="flex-1 rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5 text-sm font-bold text-tts-deep outline-none focus:border-tts-deep placeholder:text-tts-muted/40"
        />
        <button
          type="submit"
          disabled={!value.trim() || submitting}
          className="flex items-center justify-center gap-2 rounded-lg bg-tts-deep px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "…" : "Unlock"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-tts-error">{error}</p>}
    </form>
  );
}

/**
 * Combined Bridge-account login: email + access password in one form. Verifies
 * the password against the backend (probe) and, on success, persists the unlock
 * flag and hands the email to the parent to load the account.
 */
export function BridgeAccountLogin({
  onAuthenticated,
  defaultEmail = "",
  title = "Bridge account",
  description = "Enter your account email and access password.",
  emailLabel = "Account email",
  passwordLabel = "Access password",
  submitLabel = "Continue",
}: {
  onAuthenticated: (email: string) => void;
  defaultEmail?: string;
  title?: string;
  description?: string;
  emailLabel?: string;
  passwordLabel?: string;
  submitLabel?: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pw = password.trim();
    const em = email.trim().toLowerCase();
    if (!em || !pw || submitting) return;
    setSubmitting(true);
    setError("");
    const ok = await verifyPassword(pw);
    if (ok) {
      try { localStorage.setItem(FLAG_KEY, "1"); } catch { /* ignore */ }
      onAuthenticated(em);
    } else {
      clearCookie();
      setError("Incorrect access password.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-tts-border bg-tts-surface p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-tts-confirm/15 text-tts-confirm">
          <Lock className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-bold text-tts-deep">{title}</p>
          <p className="text-xs text-tts-muted">{description}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tts-muted">{emailLabel}</label>
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(""); }}
            placeholder="you@email.com"
            className="w-full rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5 text-sm font-bold text-tts-deep outline-none focus:border-tts-deep placeholder:text-tts-muted/40"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-tts-muted">{passwordLabel}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            placeholder="••••••••"
            className="w-full rounded-lg border border-tts-border bg-tts-bg px-3 py-2.5 text-sm font-bold text-tts-deep outline-none focus:border-tts-deep placeholder:text-tts-muted/40"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-tts-error">{error}</p>}
      <button
        type="submit"
        disabled={!email.trim() || !password.trim() || submitting}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-tts-deep py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "…" : submitLabel}
      </button>
    </form>
  );
}

/**
 * Wraps a page behind a shared password prompt. Renders children only once the
 * correct password has been entered (per browser session).
 */
export function BridgeAuthGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const ok = (() => {
      try {
        return localStorage.getItem(FLAG_KEY) === "1";
      } catch {
        return false;
      }
    })();
    if (ok) setUnlocked(true);
    setChecked(true);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pw = value.trim();
    if (!pw || submitting) return;
    setSubmitting(true);
    setError("");
    const ok = await verifyPassword(pw);
    if (ok) {
      try {
        localStorage.setItem(FLAG_KEY, "1");
      } catch {
        /* ignore */
      }
      setUnlocked(true);
    } else {
      clearCookie();
      setError("Incorrect password.");
    }
    setSubmitting(false);
  }

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950">
        <Loader2 className="h-6 w-6 animate-spin text-stone-500" />
      </div>
    );
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border-2 border-stone-800 bg-stone-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
            <Lock className="h-4 w-4" />
          </span>
          <div>
            <h1 className="text-base font-bold text-white">Restricted access</h1>
            <p className="text-xs text-stone-400">Enter the access password to continue.</p>
          </div>
        </div>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          placeholder="Password"
          className="w-full rounded-lg border-2 border-stone-700 bg-stone-950 px-3 py-2.5 text-sm font-bold text-white outline-none focus:border-amber-400"
        />
        {error && <p className="mt-2 text-xs font-semibold text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={!value.trim() || submitting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-stone-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? "Verifying…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
