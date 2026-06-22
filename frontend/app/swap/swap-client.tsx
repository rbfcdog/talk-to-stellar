"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react";
import {
  OperationalCard,
  OperationalHeader,
  OperationalPage,
  OperationalStat,
  StatusPill,
} from "@/components/layout/OperationalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Types ──────────────────────────────────────────────────────────────

type SwapQuote = {
  assetIn?: string;
  assetOut?: string;
  amountIn?: string;
  amountOut?: string;
  priceImpact?: string;
  route?: string[];
  fee?: string;
};

type SwapToken = {
  code: string;
  contract?: string;
  name?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────

const STELLAR_LAB_XDR_URL = "https://laboratory.stellar.org/#txsigner";

function normalizeAsset(code: string): string {
  const c = code.trim().toUpperCase();
  if (c === "USD" || c === "USDC") return "USDC";
  if (c === "XLM" || c === "LUMEN" || c === "LUMENS") return "XLM";
  return c;
}

function formatAmount(val: string | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 7 }).replace(/\.?0+$/, "");
}

// ── Main Component ─────────────────────────────────────────────────────

export default function SwapClient({ initialQuery = "" }: { initialQuery?: string }) {
  const searchParams = useSearchParams();
  const queryParams = new URLSearchParams(initialQuery || searchParams.toString());

  const fromParam = normalizeAsset(queryParams.get("from") || "XLM");
  const toParam = normalizeAsset(queryParams.get("to") || "USDC");
  const amountParam = queryParams.get("amount") || "";
  const tradeTypeParam = (queryParams.get("trade_type") || "EXACT_IN").toUpperCase() as "EXACT_IN" | "EXACT_OUT";
  const lang = queryParams.get("lang") || "pt-BR";
  const isEn = lang === "en";

  const L = (pt: string, en: string) => (isEn ? en : pt);

  const [fromAsset, setFromAsset] = useState(fromParam);
  const [toAsset, setToAsset] = useState(toParam);
  const [amount, setAmount] = useState(amountParam);
  const [tradeType, setTradeType] = useState<"EXACT_IN" | "EXACT_OUT">(tradeTypeParam);

  const [quoteStatus, setQuoteStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");

  const [buildStatus, setBuildStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [xdr, setXdr] = useState("");
  const [buildError, setBuildError] = useState("");

  const [tokens, setTokens] = useState<SwapToken[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load token list on mount
  useEffect(() => {
    fetch("/api/swap/tokens", { cache: "no-store" })
      .then((r) => r.json())
      .catch(() => ({}))
      .then((data) => {
        const list: SwapToken[] = Array.isArray(data?.tokens)
          ? data.tokens
          : Array.isArray(data)
          ? data
          : [];
        setTokens(list.slice(0, 50));
      });
  }, []);

  const fetchQuote = useCallback(async () => {
    if (!fromAsset || !toAsset || !amount) return;
    setQuoteStatus("loading");
    setQuote(null);
    setQuoteError("");
    try {
      const qs = new URLSearchParams({
        assetIn: fromAsset,
        assetOut: toAsset,
        amount,
        tradeType,
      });
      const res = await fetch(`/api/swap/quote?${qs}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setQuote(data);
      setQuoteStatus("ready");
    } catch (e: any) {
      setQuoteError(e?.message || String(e));
      setQuoteStatus("error");
    }
  }, [fromAsset, toAsset, amount, tradeType]);

  // Auto-fetch quote when inputs change (debounced)
  useEffect(() => {
    if (!amount) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchQuote();
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchQuote, amount, fromAsset, toAsset, tradeType]);

  const buildXdr = async () => {
    if (!quote) return;
    setBuildStatus("loading");
    setBuildError("");
    setXdr("");
    try {
      const res = await fetch("/api/swap/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIn: fromAsset,
          assetOut: toAsset,
          amount,
          tradeType,
          quote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      const tx = data.xdr || data.transaction || data.tx || data.envelope || "";
      setXdr(tx);
      setBuildStatus("ready");
    } catch (e: any) {
      setBuildError(e?.message || String(e));
      setBuildStatus("error");
    }
  };

  const openStellarLab = () => {
    if (!xdr) return;
    const url = `${STELLAR_LAB_XDR_URL}&xdr=${encodeURIComponent(xdr)}`;
    window.open(url, "_blank", "noopener");
  };

  const swapDirection = () => {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setQuote(null);
    setQuoteStatus("idle");
    setXdr("");
    setBuildStatus("idle");
  };

  return (
    <OperationalPage size="sm">
      <OperationalHeader
        title={L("Swap de Tokens", "Token Swap")}
        description={L(
          "Troque tokens diretamente via DEX com a melhor rota disponível",
          "Swap tokens directly via DEX with the best available route"
        )}
      />

      {/* Pair selector */}
      <OperationalCard>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-tts-text/50 uppercase tracking-wide">
                {L("De", "From")}
              </label>
              <select
                value={fromAsset}
                onChange={(e) => {
                  setFromAsset(e.target.value);
                  setQuote(null);
                  setQuoteStatus("idle");
                  setXdr("");
                  setBuildStatus("idle");
                }}
                className="w-full rounded-md border border-tts-border bg-tts-bg px-3 py-2 text-sm text-tts-deep"
              >
                {["XLM", "USDC", "BRZ", "BRLT"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {tokens
                  .filter((t) => !["XLM", "USDC", "BRZ", "BRLT"].includes(t.code.toUpperCase()))
                  .map((t) => (
                    <option key={t.code} value={t.code}>{t.code}</option>
                  ))}
              </select>
            </div>

            <button
              onClick={swapDirection}
              className="mt-5 rounded-full border border-tts-border p-2 hover:bg-tts-border/30 transition-colors"
              title={L("Inverter par", "Swap direction")}
            >
              <ArrowLeftRight className="h-4 w-4 text-tts-text/60" />
            </button>

            <div className="flex-1">
              <label className="mb-1 block text-xs text-tts-text/50 uppercase tracking-wide">
                {L("Para", "To")}
              </label>
              <select
                value={toAsset}
                onChange={(e) => {
                  setToAsset(e.target.value);
                  setQuote(null);
                  setQuoteStatus("idle");
                  setXdr("");
                  setBuildStatus("idle");
                }}
                className="w-full rounded-md border border-tts-border bg-tts-bg px-3 py-2 text-sm text-tts-deep"
              >
                {["USDC", "XLM", "BRZ", "BRLT"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
                {tokens
                  .filter((t) => !["XLM", "USDC", "BRZ", "BRLT"].includes(t.code.toUpperCase()))
                  .map((t) => (
                    <option key={t.code} value={t.code}>{t.code}</option>
                  ))}
              </select>
            </div>
          </div>

          {/* Amount + trade type */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-tts-text/50 uppercase tracking-wide">
                {tradeType === "EXACT_IN"
                  ? L(`Valor (${fromAsset})`, `Amount (${fromAsset})`)
                  : L(`Receber (${toAsset})`, `Receive (${toAsset})`)}
              </label>
              <Input
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setXdr("");
                  setBuildStatus("idle");
                }}
                placeholder="0.00"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="block text-xs text-tts-text/50 uppercase tracking-wide">Modo</label>
              <div className="flex rounded-md overflow-hidden border border-tts-border">
                {(["EXACT_IN", "EXACT_OUT"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setTradeType(t);
                      setQuote(null);
                      setQuoteStatus("idle");
                    }}
                    className={`px-2 py-2 text-xs transition-colors ${
                      tradeType === t
                        ? "bg-tts-deep text-white"
                        : "bg-tts-bg text-tts-text/60 hover:bg-tts-border/30"
                    }`}
                  >
                    {t === "EXACT_IN" ? L("Exato entrada", "Exact in") : L("Exato saída", "Exact out")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Button
            onClick={fetchQuote}
            disabled={!amount || quoteStatus === "loading"}
            className="w-full"
            size="sm"
          >
            {quoteStatus === "loading" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            )}
            {L("Obter cotação", "Get quote")}
          </Button>
        </div>
      </OperationalCard>

      {/* Quote error */}
      {quoteStatus === "error" && (
        <OperationalCard className="mt-3">
          <div className="flex items-center gap-2 text-tts-error">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <p className="text-sm">{quoteError}</p>
          </div>
        </OperationalCard>
      )}

      {/* Quote result */}
      {quoteStatus === "ready" && quote && (
        <OperationalCard className="mt-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-tts-deep">
              {L("Cotação", "Quote")}
            </span>
            <StatusPill tone="confirm">{L("Ao vivo", "Live")}</StatusPill>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <OperationalStat
              label={L("Você envia", "You send")}
              value={`${formatAmount(quote.amountIn || amount)} ${fromAsset}`}
            />
            <OperationalStat
              label={L("Você recebe", "You receive")}
              value={`${formatAmount(quote.amountOut)} ${toAsset}`}
            />
            {quote.priceImpact && (
              <OperationalStat
                label={L("Impacto de preço", "Price impact")}
                value={`${parseFloat(quote.priceImpact).toFixed(2)}%`}
              />
            )}
            {quote.fee && (
              <OperationalStat label={L("Taxa", "Fee")} value={quote.fee} />
            )}
          </div>

          {quote.route && quote.route.length > 0 && (
            <p className="text-xs text-tts-text/40 mb-3">
              {L("Rota: ", "Route: ")}{quote.route.join(" → ")}
            </p>
          )}

          {/* Build XDR */}
          {buildStatus !== "ready" && (
            <Button
              onClick={buildXdr}
              disabled={buildStatus === "loading"}
              size="sm"
              className="w-full"
            >
              {buildStatus === "loading" ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              {L("Preparar transação", "Prepare transaction")}
            </Button>
          )}

          {buildStatus === "error" && (
            <p className="mt-2 text-xs text-tts-error">{buildError}</p>
          )}

          {buildStatus === "ready" && xdr && (
            <div className="space-y-2">
              <p className="text-xs text-tts-green flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {L("Transação preparada — assine no Stellar Lab", "Transaction ready — sign in Stellar Lab")}
              </p>
              <Button onClick={openStellarLab} size="sm" className="w-full" variant="outline">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                {L("Assinar no Stellar Lab →", "Sign in Stellar Lab →")}
              </Button>
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-tts-text/40">
                  {L("Ver XDR", "View XDR")}
                </summary>
                <textarea
                  readOnly
                  value={xdr}
                  className="mt-1 w-full rounded border border-tts-border bg-tts-bg/50 p-2 font-mono text-xs text-tts-text/60 resize-none"
                  rows={3}
                />
              </details>
            </div>
          )}
        </OperationalCard>
      )}

      <p className="mt-6 text-center text-xs text-tts-text/30">
        {L(
          "As cotações expiram rapidamente. Gere uma nova cotação antes de assinar.",
          "Quotes expire quickly. Generate a new quote before signing."
        )}
      </p>
    </OperationalPage>
  );
}
