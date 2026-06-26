"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock } from "lucide-react";

// Shared access password for the bridge features (wire on-ramp + yield).
// The backend (requireBridgeAuth) is the real gate; this is the matching UI lock.
// Kept in sync with BRIDGE_ACCESS_PASSWORD on the backend.
const BRIDGE_PASSWORD = "yuWooF9t";
const FLAG_KEY = "bridge_auth_ok";

function persistAccess() {
  try {
    sessionStorage.setItem(FLAG_KEY, "1");
  } catch {
    /* ignore */
  }
  // Session cookie — the Next proxy forwards it to the backend as x-bridge-password.
  document.cookie = `bridge_pw=${encodeURIComponent(BRIDGE_PASSWORD)}; path=/; samesite=lax`;
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

  useEffect(() => {
    const ok = (() => {
      try {
        return sessionStorage.getItem(FLAG_KEY) === "1";
      } catch {
        return false;
      }
    })();
    if (ok) {
      persistAccess(); // make sure the cookie is present for the proxy
      setUnlocked(true);
    }
    setChecked(true);
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (value.trim() === BRIDGE_PASSWORD) {
      persistAccess();
      setError("");
      setUnlocked(true);
    } else {
      setError("Incorrect password.");
    }
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
          disabled={!value.trim()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-2.5 text-sm font-bold text-stone-950 transition-colors hover:bg-amber-400 disabled:opacity-40"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}
