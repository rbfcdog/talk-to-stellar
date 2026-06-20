"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Link,
  Loader2,
  Plus,
  QrCode,
  Search,
  Share2,
  Shield,
  Trash2,
} from "lucide-react";
import {
  OperationalCard,
  OperationalHeader,
  OperationalPage,
  StatusPill,
} from "@/components/layout/OperationalShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// ── Constants ──────────────────────────────────────────────────────────────

const LINKS_BASE = "/api/pay-links";
const FRAUD_BASE = "/api/fraud-screen";
const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

// ── Types ──────────────────────────────────────────────────────────────────

type PayLink = {
  id: string;
  uri: string;
  short_url: string;
  label?: string;
  amount?: string;
  asset_code?: string;
  times_used?: number;
};

type FraudResult = {
  blocked: boolean;
  isMalicious?: boolean;
  isExchange?: boolean;
  tags?: string[];
  warning?: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function runApi(method: string, path: string, body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const p = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(p.error || p.message || `HTTP ${r.status}`);
  return p;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
}

// ── Component ──────────────────────────────────────────────────────────────

export default function PaymentLinkClient() {
  // Create link state
  const [stellarAddress, setStellarAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [assetCode, setAssetCode] = useState("USDC");
  const [memo, setMemo] = useState("");
  const [label, setLabel] = useState("");
  const [createdLink, setCreatedLink] = useState<PayLink | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");

  // List links state
  const [listAddress, setListAddress] = useState("");
  const [links, setLinks] = useState<PayLink[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // Fraud screen state
  const [screenAddress, setScreenAddress] = useState("");
  const [screenResult, setScreenResult] = useState<FraudResult | null>(null);
  const [screenLoading, setScreenLoading] = useState(false);
  const [screenError, setScreenError] = useState("");

  // Copied feedback
  const [copied, setCopied] = useState("");

  function handleCopy(text: string) {
    copyText(text);
    setCopied(text.slice(0, 40));
    setTimeout(() => setCopied(""), 1800);
  }

  // ── Create link ──────────────────────────────────────────────────────────

  const createLink = useCallback(async () => {
    setCreateLoading(true);
    setCreateError("");
    setCreatedLink(null);
    try {
      const body: Record<string, unknown> = {
        stellar_address: stellarAddress,
        asset_code: assetCode,
      };
      if (amount) body.amount = amount;
      if (assetCode === "USDC") body.asset_issuer = USDC_ISSUER;
      if (memo) body.memo = memo;
      if (label) body.label = label;

      const p = await runApi("POST", LINKS_BASE, body);
      setCreatedLink(p.link ?? p);
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateLoading(false);
    }
  }, [stellarAddress, amount, assetCode, memo, label]);

  // ── Load links ───────────────────────────────────────────────────────────

  const loadLinks = useCallback(async () => {
    if (!listAddress.trim()) return;
    setListLoading(true);
    try {
      const p = await runApi("GET", `${LINKS_BASE}?address=${encodeURIComponent(listAddress.trim())}`);
      setLinks(p.links ?? p ?? []);
    } catch {
      setLinks([]);
    } finally {
      setListLoading(false);
    }
  }, [listAddress]);

  // ── Delete link ──────────────────────────────────────────────────────────

  const deleteLink = useCallback(
    async (id: string) => {
      try {
        await runApi("DELETE", `${LINKS_BASE}/${id}`);
        setLinks((prev) => prev.filter((l) => l.id !== id));
      } catch {}
    },
    []
  );

  // ── Fraud screen ─────────────────────────────────────────────────────────

  const screenAddr = useCallback(async () => {
    if (!screenAddress.trim()) return;
    setScreenLoading(true);
    setScreenError("");
    setScreenResult(null);
    try {
      const p = await runApi(
        "GET",
        `${FRAUD_BASE}/address/${encodeURIComponent(screenAddress.trim())}`
      );
      setScreenResult(p.result ?? p);
    } catch (e: unknown) {
      setScreenError(e instanceof Error ? e.message : String(e));
    } finally {
      setScreenLoading(false);
    }
  }, [screenAddress]);

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <OperationalPage size="xl" frameClassName="max-w-5xl">
      <OperationalHeader
        eyebrow="Stellar SEP-7"
        title="Payment Links"
        description="Generate shareable payment links for any Stellar address and send them via WhatsApp."
      />

      {copied ? (
        <div className="rounded-md border border-tts-confirm/25 bg-tts-confirm/10 p-2 text-sm font-semibold text-tts-confirm">
          Copied: {copied}
        </div>
      ) : null}

      {/* ── Top grid: Create + My Links ──────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Card 1 — Create Payment Link */}
        <OperationalCard>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-tts-gold">Generate</p>
            <h2 className="flex items-center gap-2 text-lg font-bold text-tts-deep">
              <Link className="h-5 w-5 text-tts-gold" />
              Create Payment Link
            </h2>
            <p className="mt-0.5 text-sm text-tts-muted">
              Produces a SEP-7 URI + shareable short URL.
            </p>
          </div>

          <div className="grid gap-3">
            {/* Destination */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-tts-muted">
                Destination address G…
              </label>
              <Input
                value={stellarAddress}
                onChange={(e) => setStellarAddress(e.target.value)}
                placeholder="GABCDE…"
                className="font-mono text-xs"
              />
            </div>

            {/* Amount + Asset row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="mb-1 block text-xs font-semibold text-tts-muted">
                  Amount (optional)
                </label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="10.00"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-tts-muted">
                  Asset
                </label>
                <select
                  value={assetCode}
                  onChange={(e) => setAssetCode(e.target.value)}
                  className="h-10 w-full rounded-md border border-tts-border bg-tts-bg px-3 text-sm text-tts-deep focus:outline-none focus:ring-1 focus:ring-tts-confirm"
                >
                  <option value="USDC">USDC</option>
                  <option value="XLM">XLM</option>
                </select>
              </div>
            </div>

            {/* Memo */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-tts-muted">
                Memo (optional)
              </label>
              <Input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Payment reference…"
              />
            </div>

            {/* Label */}
            <div>
              <label className="mb-1 block text-xs font-semibold text-tts-muted">
                Label (optional)
              </label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Invoice #1234, Order #5678…"
              />
            </div>

            {/* Create button */}
            <Button
              onClick={createLink}
              disabled={!stellarAddress.trim() || createLoading}
              className="w-full"
            >
              {createLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create Link
            </Button>

            {/* Error */}
            {createError ? (
              <div className="flex items-start gap-2 rounded-md border border-tts-error/25 bg-tts-error/10 p-3 text-sm text-tts-error">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{createError}</span>
              </div>
            ) : null}

            {/* Created link result */}
            {createdLink ? (
              <div className="rounded-md border border-tts-confirm/30 bg-tts-confirm/5 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-tts-confirm" />
                  <span className="text-sm font-bold text-tts-confirm">Link created!</span>
                </div>

                {/* SEP-7 URI */}
                <div className="mb-3">
                  <p className="mb-1 text-xs font-semibold text-tts-muted">SEP-7 URI:</p>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 break-all font-mono text-xs text-tts-deep">
                      {createdLink.uri.slice(0, 60)}
                      {createdLink.uri.length > 60 ? "…" : ""}
                    </span>
                    <button
                      onClick={() => handleCopy(createdLink.uri)}
                      className="shrink-0 text-tts-muted hover:text-tts-confirm"
                      title="Copy URI"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Short URL */}
                <div className="mb-4">
                  <p className="mb-1 text-xs font-semibold text-tts-muted">Short URL:</p>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 break-all text-sm font-semibold text-tts-deep">
                      {createdLink.short_url}
                    </span>
                    <button
                      onClick={() => handleCopy(createdLink.short_url)}
                      className="shrink-0 text-tts-muted hover:text-tts-confirm"
                      title="Copy short URL"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Amount badge */}
                {createdLink.amount ? (
                  <p className="mb-3 text-xs text-tts-muted">
                    Amount:{" "}
                    <span className="font-bold text-tts-deep">
                      {createdLink.amount} {createdLink.asset_code || assetCode}
                    </span>
                  </p>
                ) : null}

                {/* WhatsApp share */}
                <Button
                  asChild
                  size="sm"
                  className="w-full bg-[#25D366] text-white hover:bg-[#20bd5a]"
                >
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(
                      "Pague aqui: " + createdLink.short_url
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share via WhatsApp
                    <ExternalLink className="ml-2 h-3 w-3 opacity-70" />
                  </a>
                </Button>
              </div>
            ) : null}
          </div>
        </OperationalCard>

        {/* Card 2 — My Links */}
        <OperationalCard>
          <div className="mb-4">
            <p className="text-xs font-bold uppercase text-tts-gold">Lookup</p>
            <h2 className="flex items-center gap-2 text-lg font-bold text-tts-deep">
              <QrCode className="h-5 w-5 text-tts-gold" />
              My Links
            </h2>
            <p className="mt-0.5 text-sm text-tts-muted">
              View all payment links for a Stellar address.
            </p>
          </div>

          {/* Search row */}
          <div className="mb-4 flex gap-2">
            <Input
              value={listAddress}
              onChange={(e) => setListAddress(e.target.value)}
              placeholder="G… Stellar address"
              className="flex-1 font-mono text-xs"
              onKeyDown={(e) => e.key === "Enter" && loadLinks()}
            />
            <Button
              onClick={loadLinks}
              disabled={!listAddress.trim() || listLoading}
              size="sm"
              variant="outline"
            >
              {listLoading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-1 h-4 w-4" />
              )}
              Load
            </Button>
          </div>

          {/* Links list */}
          {links.length > 0 ? (
            <div className="grid gap-2">
              {links.map((lnk) => (
                <div
                  key={lnk.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-tts-border bg-tts-bg/50 p-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-tts-deep">
                        {lnk.label || "Link"}
                      </span>
                      {lnk.amount ? (
                        <StatusPill tone="gold">
                          {lnk.amount} {lnk.asset_code}
                        </StatusPill>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-tts-muted">
                      {lnk.short_url.length > 40
                        ? lnk.short_url.slice(0, 40) + "…"
                        : lnk.short_url}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {typeof lnk.times_used === "number" ? (
                      <StatusPill
                        tone={lnk.times_used > 0 ? "confirm" : "default"}
                      >
                        {lnk.times_used}×
                      </StatusPill>
                    ) : null}
                    <button
                      onClick={() => handleCopy(lnk.short_url)}
                      className="text-tts-muted hover:text-tts-confirm"
                      title="Copy URL"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => deleteLink(lnk.id)}
                      className="text-tts-muted hover:text-tts-error"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-tts-muted">
              {listLoading
                ? "Loading…"
                : listAddress
                ? "No links found for this address."
                : "Enter a Stellar address and click Load."}
            </p>
          )}
        </OperationalCard>
      </div>

      {/* ── Card 3 — Fraud Screen (full width) ──────────────────── */}
      <OperationalCard>
        <div className="mb-4">
          <p className="text-xs font-bold uppercase text-tts-gold">Security</p>
          <h2 className="flex items-center gap-2 text-lg font-bold text-tts-deep">
            <Shield className="h-5 w-5 text-tts-gold" />
            Fraud Screen
          </h2>
          <p className="mt-0.5 text-sm text-tts-muted">
            Check any Stellar address for known risk signals before sending payments.
          </p>
        </div>

        {/* Input row */}
        <div className="mb-4 flex gap-2">
          <Input
            value={screenAddress}
            onChange={(e) => setScreenAddress(e.target.value)}
            placeholder="G… Stellar address to screen"
            className="flex-1 font-mono text-xs"
            onKeyDown={(e) => e.key === "Enter" && screenAddr()}
          />
          <Button
            onClick={screenAddr}
            disabled={!screenAddress.trim() || screenLoading}
            size="sm"
          >
            {screenLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Shield className="mr-2 h-4 w-4" />
            )}
            Screen
          </Button>
        </div>

        {/* Error */}
        {screenError ? (
          <div className="flex items-start gap-2 rounded-md border border-tts-error/25 bg-tts-error/10 p-3 text-sm text-tts-error">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{screenError}</span>
          </div>
        ) : null}

        {/* Result */}
        {screenResult ? (
          <div
            className={`rounded-md border p-4 ${
              screenResult.blocked || screenResult.isMalicious
                ? "border-tts-error/30 bg-tts-error/5"
                : screenResult.isExchange
                ? "border-tts-gold/30 bg-tts-gold/5"
                : "border-tts-confirm/30 bg-tts-confirm/5"
            }`}
          >
            {/* Status heading */}
            <div className="mb-3 flex items-center gap-2">
              {screenResult.blocked || screenResult.isMalicious ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-tts-error" />
                  <span className="font-bold text-tts-error">Blocked / Malicious</span>
                </>
              ) : screenResult.isExchange ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-tts-gold" />
                  <span className="font-bold text-tts-gold">Exchange / Custodial</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-tts-confirm" />
                  <span className="font-bold text-tts-confirm">No threats detected</span>
                </>
              )}
            </div>

            {/* Warning message */}
            {screenResult.warning ? (
              <p className="mb-3 text-sm text-tts-deep">{screenResult.warning}</p>
            ) : null}

            {/* Exchange note */}
            {screenResult.isExchange && !screenResult.warning ? (
              <p className="mb-3 text-sm text-tts-deep">
                This address belongs to an exchange or custodial service. Payments
                may require a memo to credit your account correctly.
              </p>
            ) : null}

            {/* Tags */}
            {screenResult.tags && screenResult.tags.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-tts-muted">Tags:</p>
                <div className="flex flex-wrap gap-1">
                  {screenResult.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-tts-border bg-tts-bg px-2 py-0.5 text-xs text-tts-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-tts-muted">Tags: none</p>
            )}

            {/* Pill summary row */}
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusPill tone={screenResult.blocked ? "error" : "confirm"}>
                {screenResult.blocked ? "Blocked" : "Not blocked"}
              </StatusPill>
              <StatusPill tone={screenResult.isMalicious ? "error" : "confirm"}>
                {screenResult.isMalicious ? "Malicious" : "Not malicious"}
              </StatusPill>
              <StatusPill tone={screenResult.isExchange ? "gold" : "default"}>
                {screenResult.isExchange ? "Exchange" : "Not exchange"}
              </StatusPill>
            </div>
          </div>
        ) : null}
      </OperationalCard>
    </OperationalPage>
  );
}
