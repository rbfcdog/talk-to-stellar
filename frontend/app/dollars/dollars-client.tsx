"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import WireOnrampClient from "@/app/wire-onramp/wire-onramp-client";
import UsdWithdrawClient from "@/app/usd-withdraw/usd-withdraw-client";

type Mode = "receive" | "send";
const MODE_KEY = "tts:dollars:mode";

/**
 * One screen for both dollar flows. A Receive / Send switch picks between the
 * on-ramp (receive USD by wire/ACH) and the off-ramp (send USD to a US bank).
 * Both flows share the same access gate + email cache, so switching never
 * forces a second login.
 */
export default function DollarsClient({
  initialQuery = "",
  initialMode = "receive",
}: {
  initialQuery?: string;
  initialMode?: Mode;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  // Remember the last-used flow across reopens.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_KEY);
      if (saved === "receive" || saved === "send") setMode(saved);
    } catch {
      /* storage may be unavailable */
    }
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (next: Mode) => {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  const isEn = /(?:^|[?&])lang=en(?:&|$)/.test(initialQuery);
  const L = (pt: string, en: string) => (isEn ? en : pt);

  const TABS: Array<{ id: Mode; icon: typeof ArrowDownToLine; label: string }> = [
    { id: "receive", icon: ArrowDownToLine, label: L("Receber dólar", "Receive dollars") },
    { id: "send", icon: ArrowUpFromLine, label: L("Enviar dólar", "Send dollars") },
  ];

  const switcher = (
    <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-tts-border bg-tts-bg p-1.5">
      {TABS.map((t) => {
        const on = t.id === mode;
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => pick(t.id)}
            aria-pressed={on}
            className={[
              "flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors",
              on ? "bg-tts-deep text-tts-surface shadow-sm" : "text-tts-muted hover:bg-tts-surface",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );

  return mode === "receive" ? (
    <WireOnrampClient initialQuery={initialQuery} modeSwitcher={switcher} />
  ) : (
    <UsdWithdrawClient initialQuery={initialQuery} modeSwitcher={switcher} />
  );
}
