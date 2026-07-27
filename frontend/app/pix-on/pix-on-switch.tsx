"use client";

/**
 * Pix cash-in provider switch. When the PagFinance-backed rail is available
 * (backend feature flag + credentials), the slim client handles the flow;
 * otherwise the legacy testnet ramp client keeps working unchanged.
 */

import { useEffect, useState } from "react";
import PixRampClient from "../pix-ramp/pix-ramp-client";
import PagfinanceOnrampClient, { type CashinConfig } from "./pagfinance-onramp-client";

type SwitchState = "loading" | "pagfinance" | "legacy";

export default function PixOnSwitch({ initialQuery = "" }: { initialQuery?: string }) {
  const [state, setState] = useState<SwitchState>("loading");
  const [config, setConfig] = useState<CashinConfig | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/pagfinance/cashin/config")
      .then((response) => response.json())
      .then((payload: CashinConfig & { success?: boolean }) => {
        if (cancelled) return;
        if (payload?.available) {
          setConfig(payload);
          setState("pagfinance");
        } else {
          setState("legacy");
        }
      })
      .catch(() => {
        if (!cancelled) setState("legacy");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-tts-bg" data-testid="pix-on-loading">
        <p className="text-sm text-tts-muted">…</p>
      </main>
    );
  }

  if (state === "pagfinance" && config) {
    return <PagfinanceOnrampClient initialQuery={initialQuery} config={config} />;
  }

  return <PixRampClient initialQuery={initialQuery} lockedMode="onramp" />;
}
