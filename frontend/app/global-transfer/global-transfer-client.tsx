"use client"

import Link from "next/link"
import { useMemo, useState, type ChangeEvent } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileText,
  Landmark,
  Network,
  QrCode,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Timer,
  WalletCards,
  type LucideIcon,
} from "lucide-react"

type ProviderKey = "bridge" | "circle" | "rail" | "anchor"
type PayoutRail = "ach" | "wire" | "swift_local"
type RecipientType = "own_account" | "business_vendor" | "third_party"
type AnchorProvider = "etherfuse_sandbox" | "pix_psp" | "bank_partner"
type KycStatus = "pending" | "approved" | "manual_review"
type AnchorStatus = "draft" | "customer_ready" | "pix_pending" | "fiat_received" | "asset_settled"
type ExternalStatus = "draft" | "screening" | "stellar_sent" | "usd_redeemed" | "payout_sent"

type TimelineItem = {
  label: string
  detail: string
  icon: LucideIcon
  status: "complete" | "ready" | "waiting"
}

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const brlFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
})

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
})

const providerProfiles: Record<ProviderKey, { label: string; settlement: string; note: string }> = {
  bridge: {
    label: "Bridge-style off-ramp",
    settlement: "30-90 minutes",
    note: "Best first API shape for stablecoin orchestration and bank payout testing.",
  },
  circle: {
    label: "Circle Mint treasury",
    settlement: "1-2 business days",
    note: "Strong for institutional mint/redeem, but third-party payout scope needs approval.",
  },
  rail: {
    label: "Rail-style USDC/USD accounts",
    settlement: "1-4 hours",
    note: "Maps cleanly to USDC account -> USD account -> external bank withdrawal.",
  },
  anchor: {
    label: "Own Stellar anchor",
    settlement: "Pilot dependent",
    note: "Long-term control path, with higher licensing, ops and banking complexity.",
  },
}

const anchorProfiles: Record<AnchorProvider, { label: string; rail: string; note: string }> = {
  etherfuse_sandbox: {
    label: "Etherfuse sandbox anchor",
    rail: "PIX sandbox",
    note: "Good for the current testnet demo. The PIX received event is simulated by the anchor sandbox.",
  },
  pix_psp: {
    label: "PIX PSP plus internal anchor",
    rail: "Real PIX provider",
    note: "Production-like split where the PIX PSP confirms BRL and your backend performs the Stellar leg.",
  },
  bank_partner: {
    label: "Banking partner anchor",
    rail: "Bank-owned PIX and FX",
    note: "Lower operational burden, but more partner dependency and stricter approval flow.",
  },
}

const recipientProfiles: Record<RecipientType, { label: string; risk: string; review: string }> = {
  own_account: {
    label: "Same-owner USD account",
    risk: "Lower",
    review: "Recommended pilot path. Beneficial ownership is easier to justify.",
  },
  business_vendor: {
    label: "Approved business vendor",
    risk: "Medium",
    review: "Needs invoice, purpose code and recipient screening before release.",
  },
  third_party: {
    label: "Third-party individual",
    risk: "High",
    review: "Do not launch first. Requires mature KYC, AML, fraud and support workflows.",
  },
}

const railLabels: Record<PayoutRail, string> = {
  ach: "ACH",
  wire: "Wire",
  swift_local: "SWIFT/local bank",
}

const railFeesUsd: Record<PayoutRail, number> = {
  ach: 1.25,
  wire: 25,
  swift_local: 14,
}

const wiseReceivingFeesUsd: Record<PayoutRail, number> = {
  ach: 0,
  wire: 6.11,
  swift_local: 6.11,
}

const anchorStatusRank: Record<AnchorStatus, number> = {
  draft: 0,
  customer_ready: 1,
  pix_pending: 2,
  fiat_received: 3,
  asset_settled: 4,
}

const externalStatusRank: Record<ExternalStatus, number> = {
  draft: 0,
  screening: 1,
  stellar_sent: 2,
  usd_redeemed: 3,
  payout_sent: 4,
}

function clampMoney(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0
  return value
}

function clampBps(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.min(value, 5000)
}

function pctFromBps(value: number) {
  return `${(value / 100).toFixed(2)}%`
}

function Field({
  label,
  value,
  min = 0,
  step = "0.01",
  suffix,
  onChange,
}: {
  label: string
  value: number
  min?: number
  step?: string
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{label}</span>
      <div className="flex h-11 items-center rounded-lg border border-slate-300 bg-white px-3 shadow-sm focus-within:border-sky-500">
        <input
          type="number"
          min={min}
          step={step}
          value={value}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(Number(event.target.value))}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-950 outline-none"
        />
        {suffix ? <span className="ml-2 shrink-0 text-xs font-semibold text-slate-500">{suffix}</span> : null}
      </div>
    </label>
  )
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500"
      />
    </label>
  )
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 shadow-sm outline-none focus:border-sky-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export default function GlobalTransferClient() {
  const [amountBrl, setAmountBrl] = useState(10000)
  const [fxRate, setFxRate] = useState(5.24)
  const [platformFeeBps, setPlatformFeeBps] = useState(80)
  const [liquiditySpreadBps, setLiquiditySpreadBps] = useState(35)
  const [offrampFeeBps, setOfframpFeeBps] = useState(25)
  const [iofBps, setIofBps] = useState(38)
  const [pixFeeBps, setPixFeeBps] = useState(10)
  const [pixFixedFeeBrl, setPixFixedFeeBrl] = useState(0.49)
  const [anchorFeeBps, setAnchorFeeBps] = useState(20)
  const [anchorFixedFeeBrl, setAnchorFixedFeeBrl] = useState(0)
  const [anchorProvider, setAnchorProvider] = useState<AnchorProvider>("etherfuse_sandbox")
  const [provider, setProvider] = useState<ProviderKey>("bridge")
  const [payoutRail, setPayoutRail] = useState<PayoutRail>("ach")
  const [recipientType, setRecipientType] = useState<RecipientType>("own_account")
  const [kycStatus, setKycStatus] = useState<KycStatus>("approved")
  const [payerName, setPayerName] = useState("BR Company Demo Ltda")
  const [payerDocument, setPayerDocument] = useState("12.345.678/0001-90")
  const [recipientName, setRecipientName] = useState("Recipient Legal Name")
  const [recipientBank, setRecipientBank] = useState("Wise US Inc")
  const [recipientRouting, setRecipientRouting] = useState("000000000")
  const [recipientAccountLast4, setRecipientAccountLast4] = useState("1234")
  const [paymentPurpose, setPaymentPurpose] = useState("availability_abroad")
  const [anchorStatus, setAnchorStatus] = useState<AnchorStatus>("draft")
  const [externalStatus, setExternalStatus] = useState<ExternalStatus>("draft")
  const [simulationStarted, setSimulationStarted] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(() => new Date())

  const quote = useMemo(() => {
    const safeAmountBrl = clampMoney(amountBrl)
    const safeFxRate = Math.max(clampMoney(fxRate), 0.0001)
    const safePlatformFeeBps = clampBps(platformFeeBps)
    const safeLiquiditySpreadBps = clampBps(liquiditySpreadBps)
    const safeOfframpFeeBps = clampBps(offrampFeeBps)
    const safeIofBps = clampBps(iofBps)
    const safePixFeeBps = clampBps(pixFeeBps)
    const safePixFixedFeeBrl = clampMoney(pixFixedFeeBrl)
    const safeAnchorFeeBps = clampBps(anchorFeeBps)
    const safeAnchorFixedFeeBrl = clampMoney(anchorFixedFeeBrl)

    const grossUsd = safeAmountBrl / safeFxRate
    const pixFeeBrl = safeAmountBrl * (safePixFeeBps / 10000) + safePixFixedFeeBrl
    const pixFeeUsd = pixFeeBrl / safeFxRate
    const anchorFeeBrl = safeAmountBrl * (safeAnchorFeeBps / 10000) + safeAnchorFixedFeeBrl
    const anchorFeeUsd = anchorFeeBrl / safeFxRate
    const iofBrl = safeAmountBrl * (safeIofBps / 10000)
    const iofUsd = iofBrl / safeFxRate
    const platformFeeUsd = grossUsd * (safePlatformFeeBps / 10000)
    const liquidityFeeUsd = grossUsd * (safeLiquiditySpreadBps / 10000)
    const offrampFeeUsd = grossUsd * (safeOfframpFeeBps / 10000)
    const bankFeeUsd = railFeesUsd[payoutRail]
    const wiseReceivingFeeUsd = wiseReceivingFeesUsd[payoutRail]
    const stellarFeeUsd = 0.0002
    const totalFeesUsd =
      pixFeeUsd +
      anchorFeeUsd +
      platformFeeUsd +
      liquidityFeeUsd +
      offrampFeeUsd +
      bankFeeUsd +
      wiseReceivingFeeUsd +
      iofUsd +
      stellarFeeUsd
    const netUsd = Math.max(grossUsd - totalFeesUsd, 0)
    const usdcSettlementAmount = Math.max(grossUsd - platformFeeUsd - liquidityFeeUsd - pixFeeUsd - anchorFeeUsd, 0)
    const effectiveCostBps = grossUsd > 0 ? (totalFeesUsd / grossUsd) * 10000 : 0
    const expiresAt = new Date(lastUpdated.getTime() + 7 * 60 * 1000)
    const quoteId = `q_mock_${Math.round(safeAmountBrl * 100)}_${anchorProvider}_${provider}_${payoutRail}`
    const anchorOrderId = `pix_anchor_${Math.round(safeAmountBrl * 100)}_${anchorProvider}`
    const externalTransferId = `ext_usd_${Math.round(netUsd * 100)}_${payoutRail}`

    return {
      safeAmountBrl,
      safeFxRate,
      safePlatformFeeBps,
      safeLiquiditySpreadBps,
      safeOfframpFeeBps,
      safeIofBps,
      safePixFeeBps,
      safePixFixedFeeBrl,
      safeAnchorFeeBps,
      safeAnchorFixedFeeBrl,
      grossUsd,
      pixFeeBrl,
      pixFeeUsd,
      anchorFeeBrl,
      anchorFeeUsd,
      iofBrl,
      iofUsd,
      platformFeeUsd,
      liquidityFeeUsd,
      offrampFeeUsd,
      bankFeeUsd,
      wiseReceivingFeeUsd,
      stellarFeeUsd,
      totalFeesUsd,
      netUsd,
      usdcSettlementAmount,
      effectiveCostBps,
      expiresAt,
      quoteId,
      anchorOrderId,
      externalTransferId,
    }
  }, [
    anchorFeeBps,
    anchorFixedFeeBrl,
    anchorProvider,
    amountBrl,
    fxRate,
    platformFeeBps,
    pixFeeBps,
    pixFixedFeeBrl,
    liquiditySpreadBps,
    offrampFeeBps,
    iofBps,
    lastUpdated,
    provider,
    payoutRail,
  ])

  const timeline: TimelineItem[] = useMemo(
    () => [
      {
        label: "Quote locked",
        detail: "FX rate, fee schedule, payout rail and quote expiry are snapshotted.",
        icon: ClipboardList,
        status: "complete",
      },
      {
        label: "Anchor customer ready",
        detail: `${anchorProfiles[anchorProvider].label} receives the customer, wallet and KYC reference.`,
        icon: ShieldCheck,
        status: anchorStatusRank[anchorStatus] >= 1 ? "complete" : "ready",
      },
      {
        label: "PIX charge created",
        detail: "Anchor returns a PIX copia e cola, order ID, expiry and webhook reference.",
        icon: QrCode,
        status: anchorStatusRank[anchorStatus] >= 2 ? "complete" : anchorStatusRank[anchorStatus] === 1 ? "ready" : "waiting",
      },
      {
        label: "PIX received",
        detail: "PIX partner or sandbox webhook confirms settled BRL before any value leaves treasury.",
        icon: Banknote,
        status: anchorStatusRank[anchorStatus] >= 3 ? "complete" : anchorStatusRank[anchorStatus] === 2 ? "ready" : "waiting",
      },
      {
        label: "USDC allocated",
        detail: "Liquidity desk or treasury converts the BRL exposure into Stellar USDC.",
        icon: CircleDollarSign,
        status: anchorStatusRank[anchorStatus] >= 4 ? "complete" : anchorStatusRank[anchorStatus] === 3 ? "ready" : "waiting",
      },
      {
        label: "Stellar settlement",
        detail: "Wallet sends USDC with transaction hash and memo tied to the internal ledger.",
        icon: Network,
        status: externalStatusRank[externalStatus] >= 2 || simulationStarted ? "complete" : anchorStatusRank[anchorStatus] >= 4 ? "ready" : "waiting",
      },
      {
        label: "USD off-ramp",
        detail: `${providerProfiles[provider].label} redeems or exchanges USDC into bank USD.`,
        icon: WalletCards,
        status: externalStatusRank[externalStatus] >= 3 || simulationStarted ? "complete" : externalStatusRank[externalStatus] >= 2 ? "ready" : "waiting",
      },
      {
        label: "Bank payout",
        detail: `${railLabels[payoutRail]} sends USD to Wise-compatible or international bank details.`,
        icon: Landmark,
        status: externalStatusRank[externalStatus] >= 4 || simulationStarted ? "complete" : externalStatusRank[externalStatus] >= 3 ? "ready" : "waiting",
      },
    ],
    [anchorProvider, anchorStatus, externalStatus, payoutRail, provider, simulationStarted],
  )

  const riskFlags = useMemo(() => {
    const flags = [
      "IOF and FX purpose classification must be confirmed by counsel and a regulated FX partner.",
      "Every provider webhook needs signature validation and idempotent replay protection.",
    ]

    if (recipientType === "third_party") {
      flags.push("Third-party individual payout is high risk and should stay out of the first pilot.")
    }

    if (kycStatus !== "approved") {
      flags.push("Do not create a real PIX charge until KYC/KYB is approved or manually cleared.")
    }

    if (anchorProvider === "etherfuse_sandbox") {
      flags.push("Etherfuse sandbox can prove the anchor flow, but it is not a production PIX settlement account.")
    }

    if (provider === "circle") {
      flags.push("Circle Mint is strong for institutional treasury, but third-party payout support is not automatic.")
    }

    if (provider === "anchor") {
      flags.push("Running an own anchor increases compliance, liquidity, support and banking relationship burden.")
    }

    if (payoutRail === "wire" && quote.grossUsd < 2000) {
      flags.push("Wire fixed fees dominate small tickets; ACH is usually better for the first US payout tests.")
    }

    if (quote.safeAmountBrl >= 50000) {
      flags.push("Large tickets should require manual review, source-of-funds evidence and approval thresholds.")
    }

    return flags
  }, [anchorProvider, kycStatus, payoutRail, provider, quote.grossUsd, quote.safeAmountBrl, recipientType])

  const quotePayload = useMemo(
    () => ({
      source_currency: "BRL",
      target_currency: "USD",
      source_amount: quote.safeAmountBrl.toFixed(2),
      recipient_country: "US",
      destination_type: "wise_usd_account",
      payout_rail: payoutRail,
      purpose: paymentPurpose,
      pix_anchor_provider: anchorProvider,
      provider,
      quote_id: quote.quoteId,
      fx_rate: quote.safeFxRate.toFixed(4),
      fee_bps: {
        pix_partner: quote.safePixFeeBps,
        anchor: quote.safeAnchorFeeBps,
        platform: quote.safePlatformFeeBps,
        liquidity_spread: quote.safeLiquiditySpreadBps,
        offramp: quote.safeOfframpFeeBps,
        iof_estimate: quote.safeIofBps,
      },
      expires_at: quote.expiresAt.toISOString(),
      estimated: {
        gross_usd: quote.grossUsd.toFixed(2),
        usdc_settlement_amount: quote.usdcSettlementAmount.toFixed(2),
        net_usd: quote.netUsd.toFixed(2),
        total_cost_usd: quote.totalFeesUsd.toFixed(2),
      },
    }),
    [anchorProvider, paymentPurpose, provider, payoutRail, quote],
  )

  const transferPayload = useMemo(
    () => ({
      quote_id: quote.quoteId,
      payer_id: "br_company_demo",
      recipient_id: "recipient_us_demo",
      recipient_type: recipientType,
      anchor_order_id: quote.anchorOrderId,
      external_transfer_id: quote.externalTransferId,
      destination: {
        type: payoutRail,
        account_holder: recipientName,
        bank_name: recipientBank,
        routing_number: payoutRail === "ach" ? recipientRouting : undefined,
        account_number_token: "tok_bank_account_mock",
        account_last4: recipientAccountLast4,
        country: "US",
      },
      compliance: {
        kyc_required: true,
        sanctions_screening_required: true,
        manual_review_required: recipientType !== "own_account" || quote.safeAmountBrl >= 50000,
      },
    }),
    [payoutRail, quote.anchorOrderId, quote.externalTransferId, quote.quoteId, quote.safeAmountBrl, recipientAccountLast4, recipientBank, recipientName, recipientRouting, recipientType],
  )

  const anchorPayload = useMemo(
    () => ({
      order_id: quote.anchorOrderId,
      provider: anchorProvider,
      rail: anchorProfiles[anchorProvider].rail,
      status: anchorStatus,
      customer: {
        name: payerName,
        document: payerDocument,
        kyc_status: kycStatus,
      },
      pix: {
        amount_brl: quote.safeAmountBrl.toFixed(2),
        expires_at: quote.expiresAt.toISOString(),
        copy_paste: `00020126580014br.gov.bcb.pix0136mock-${quote.anchorOrderId}520400005303986540${quote.safeAmountBrl.toFixed(2)}5802BR5909TTS MOCK6009SAO PAULO62070503***6304ABCD`,
      },
      settlement: {
        asset: "USDC",
        network: "stellar",
        estimated_amount: quote.usdcSettlementAmount.toFixed(2),
      },
      next_webhook: "pix.received",
    }),
    [anchorProvider, anchorStatus, kycStatus, payerDocument, payerName, quote],
  )

  const externalInstruction = useMemo(
    () => ({
      transfer_id: quote.externalTransferId,
      status: externalStatus,
      trigger_after: "STELLAR_CONFIRMED",
      source: {
        asset: "USDC",
        network: "stellar",
        amount: quote.usdcSettlementAmount.toFixed(2),
        memo: quote.anchorOrderId,
      },
      offramp: {
        provider,
        expected_settlement: providerProfiles[provider].settlement,
      },
      payout: {
        rail: payoutRail,
        amount_usd_net: quote.netUsd.toFixed(2),
        recipient_name: recipientName,
        bank_name: recipientBank,
        routing_number: payoutRail === "ach" ? recipientRouting : undefined,
        account_last4: recipientAccountLast4,
      },
    }),
    [externalStatus, payoutRail, provider, quote, recipientAccountLast4, recipientBank, recipientName, recipientRouting],
  )

  const feeRows = useMemo(
    () => [
      {
        label: "PIX PSP fee",
        paidTo: "PIX provider or banking partner",
        when: "When BRL is received",
        amount: `${brlFormatter.format(quote.pixFeeBrl)} / ${usdFormatter.format(quote.pixFeeUsd)}`,
        note: "Configurable because PSP pricing is commercial.",
      },
      {
        label: "Anchor/on-ramp fee",
        paidTo: "Anchor or internal ramp desk",
        when: "When the PIX order settles",
        amount: `${brlFormatter.format(quote.anchorFeeBrl)} / ${usdFormatter.format(quote.anchorFeeUsd)}`,
        note: "Covers anchor orchestration, customer, quote and order handling.",
      },
      {
        label: "IOF/tax estimate",
        paidTo: "Tax authority through regulated FX flow",
        when: "At FX classification/settlement",
        amount: `${brlFormatter.format(quote.iofBrl)} / ${usdFormatter.format(quote.iofUsd)}`,
        note: "Rate and tax treatment require counsel and regulated partner confirmation.",
      },
      {
        label: "Liquidity spread",
        paidTo: "Market maker, exchange, OTC desk or treasury",
        when: "BRL exposure is converted into USDC/USD",
        amount: usdFormatter.format(quote.liquidityFeeUsd),
        note: "Usually the largest controllable cost after banking and tax.",
      },
      {
        label: "Platform fee",
        paidTo: "TalkToStellar",
        when: "At quote acceptance",
        amount: usdFormatter.format(quote.platformFeeUsd),
        note: "Revenue line shown separately from partner costs.",
      },
      {
        label: "Stellar network fee",
        paidTo: "Stellar network fee pool",
        when: "When the Stellar transaction is submitted",
        amount: usdFormatter.format(quote.stellarFeeUsd),
        note: "Classic payment estimate; exact XLM fee depends on operations and network conditions.",
      },
      {
        label: "Off-ramp fee",
        paidTo: providerProfiles[provider].label,
        when: "When USDC becomes bank USD",
        amount: usdFormatter.format(quote.offrampFeeUsd),
        note: "Provider-specific fee or spread.",
      },
      {
        label: `${railLabels[payoutRail]} payout fee`,
        paidTo: "Banking or payout provider",
        when: "When USD leaves the off-ramp balance",
        amount: usdFormatter.format(quote.bankFeeUsd),
        note: "Fixed rail cost estimate.",
      },
      {
        label: "Wise receiving fee",
        paidTo: "Wise, if the recipient uses Wise details",
        when: "When Wise receives the payment",
        amount: usdFormatter.format(quote.wiseReceivingFeeUsd),
        note: payoutRail === "ach" ? "Domestic USD receiving is modeled as free." : "Wire/SWIFT USD receiving fee is modeled separately.",
      },
    ],
    [payoutRail, provider, quote],
  )

  function refreshQuote() {
    setLastUpdated(new Date())
    setSimulationStarted(false)
    setAnchorStatus("draft")
    setExternalStatus("draft")
  }

  function simulateTransfer() {
    setLastUpdated(new Date())
    setSimulationStarted(true)
    setAnchorStatus("asset_settled")
    setExternalStatus("payout_sent")
  }

  function createAnchorOrder() {
    setLastUpdated(new Date())
    setSimulationStarted(false)
    setExternalStatus("draft")
    setAnchorStatus(kycStatus === "approved" ? "pix_pending" : "customer_ready")
  }

  function markPixPaid() {
    setLastUpdated(new Date())
    setAnchorStatus("asset_settled")
    setExternalStatus("screening")
  }

  function sendExternalPayout() {
    setLastUpdated(new Date())
    setAnchorStatus("asset_settled")
    setExternalStatus("payout_sent")
    setSimulationStarted(true)
  }

  return (
    <main className="min-h-screen bg-[#f5f7f2] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
          <div className="min-w-0 text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">Mock sandbox</p>
            <h1 className="text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">BRL to USD transfer lab</h1>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-950">Quote inputs</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Change assumptions and compare how each rail affects the final USD delivery.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            <Field label="PIX amount" value={amountBrl} step="100" suffix="BRL" onChange={setAmountBrl} />
            <Field label="BRL/USD rate" value={fxRate} step="0.01" onChange={setFxRate} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="PIX fee" value={pixFeeBps} step="1" suffix="bps" onChange={setPixFeeBps} />
              <Field label="PIX fixed" value={pixFixedFeeBrl} step="0.01" suffix="BRL" onChange={setPixFixedFeeBrl} />
              <Field label="Anchor" value={anchorFeeBps} step="5" suffix="bps" onChange={setAnchorFeeBps} />
              <Field label="Anchor fixed" value={anchorFixedFeeBrl} step="0.01" suffix="BRL" onChange={setAnchorFixedFeeBrl} />
              <Field label="Platform" value={platformFeeBps} step="5" suffix="bps" onChange={setPlatformFeeBps} />
              <Field label="Liquidity" value={liquiditySpreadBps} step="5" suffix="bps" onChange={setLiquiditySpreadBps} />
              <Field label="Off-ramp" value={offrampFeeBps} step="5" suffix="bps" onChange={setOfframpFeeBps} />
              <Field label="IOF estimate" value={iofBps} step="1" suffix="bps" onChange={setIofBps} />
            </div>
            <SelectField
              label="PIX anchor"
              value={anchorProvider}
              onChange={setAnchorProvider}
              options={[
                { value: "etherfuse_sandbox", label: anchorProfiles.etherfuse_sandbox.label },
                { value: "pix_psp", label: anchorProfiles.pix_psp.label },
                { value: "bank_partner", label: anchorProfiles.bank_partner.label },
              ]}
            />
            <SelectField
              label="KYC/KYB status"
              value={kycStatus}
              onChange={setKycStatus}
              options={[
                { value: "approved", label: "Approved" },
                { value: "pending", label: "Pending" },
                { value: "manual_review", label: "Manual review" },
              ]}
            />
            <TextField label="Payer name" value={payerName} onChange={setPayerName} />
            <TextField label="Payer document" value={payerDocument} onChange={setPayerDocument} />
            <SelectField
              label="Off-ramp path"
              value={provider}
              onChange={setProvider}
              options={[
                { value: "bridge", label: providerProfiles.bridge.label },
                { value: "circle", label: providerProfiles.circle.label },
                { value: "rail", label: providerProfiles.rail.label },
                { value: "anchor", label: providerProfiles.anchor.label },
              ]}
            />
            <SelectField
              label="Payout rail"
              value={payoutRail}
              onChange={setPayoutRail}
              options={[
                { value: "ach", label: "ACH - low fixed fee" },
                { value: "wire", label: "Wire - faster, higher fixed fee" },
                { value: "swift_local", label: "SWIFT/local bank - international fallback" },
              ]}
            />
            <SelectField
              label="Recipient model"
              value={recipientType}
              onChange={setRecipientType}
              options={[
                { value: "own_account", label: recipientProfiles.own_account.label },
                { value: "business_vendor", label: recipientProfiles.business_vendor.label },
                { value: "third_party", label: recipientProfiles.third_party.label },
              ]}
            />
            <TextField label="Recipient name" value={recipientName} onChange={setRecipientName} />
            <TextField label="Recipient bank" value={recipientBank} onChange={setRecipientBank} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Routing/SWIFT" value={recipientRouting} onChange={setRecipientRouting} />
              <TextField label="Account last4" value={recipientAccountLast4} onChange={setRecipientAccountLast4} />
            </div>
            <TextField label="Purpose code" value={paymentPurpose} onChange={setPaymentPurpose} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={refreshQuote}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 transition hover:border-slate-500"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Requote
            </button>
            <button
              type="button"
              onClick={createAnchorOrder}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
              PIX anchor
            </button>
            <button
              type="button"
              onClick={markPixPaid}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-bold text-emerald-900 transition hover:border-emerald-500"
            >
              <Banknote className="h-4 w-4" aria-hidden="true" />
              Mark paid
            </button>
            <button
              type="button"
              onClick={sendExternalPayout}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-sky-900 px-3 text-sm font-bold text-white transition hover:bg-sky-800"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              Send USD
            </button>
          </div>
          <button
            type="button"
            onClick={simulateTransfer}
            className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-slate-800 transition hover:border-slate-500"
          >
            <Route className="h-4 w-4" aria-hidden="true" />
            Run full mock flow
          </button>
        </section>

        <div className="grid gap-5">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Quote result</p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                  {brlFormatter.format(quote.safeAmountBrl)}{" to "}{usdFormatter.format(quote.netUsd)}
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  This is a mock quote for PIX in, Stellar USDC settlement and {railLabels[payoutRail]} payout into
                  Wise-compatible or international USD details.
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                Expires {quote.expiresAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Gross USD</p>
                <p className="mt-2 text-xl font-bold text-slate-950">{usdFormatter.format(quote.grossUsd)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Net delivered</p>
                <p className="mt-2 text-xl font-bold text-emerald-800">{usdFormatter.format(quote.netUsd)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Total cost</p>
                <p className="mt-2 text-xl font-bold text-slate-950">{pctFromBps(quote.effectiveCostBps)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">USDC sent</p>
                <p className="mt-2 text-xl font-bold text-slate-950">{numberFormatter.format(quote.usdcSettlementAmount)}</p>
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <QrCode className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                <h2 className="text-base font-bold text-slate-950">PIX anchor order</h2>
              </div>
              <div className="space-y-2 text-sm leading-6 text-slate-700">
                <p>
                  <span className="font-bold text-slate-950">Order:</span> {quote.anchorOrderId}
                </p>
                <p>
                  <span className="font-bold text-slate-950">Provider:</span> {anchorProfiles[anchorProvider].label}
                </p>
                <p>
                  <span className="font-bold text-slate-950">Status:</span> {anchorStatus.replace("_", " ")}
                </p>
                <p>
                  <span className="font-bold text-slate-950">PIX fee:</span> {brlFormatter.format(quote.pixFeeBrl)}
                </p>
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Mock copia e cola</p>
                <p className="mt-2 break-all font-mono text-xs leading-5 text-slate-700">{anchorPayload.pix.copy_paste}</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-sky-800" aria-hidden="true" />
                <h2 className="text-base font-bold text-slate-950">External payout</h2>
              </div>
              <div className="space-y-2 text-sm leading-6 text-slate-700">
                <p>
                  <span className="font-bold text-slate-950">Transfer:</span> {quote.externalTransferId}
                </p>
                <p>
                  <span className="font-bold text-slate-950">Recipient:</span> {recipientName}
                </p>
                <p>
                  <span className="font-bold text-slate-950">Rail:</span> {railLabels[payoutRail]} to {recipientBank}
                </p>
                <p>
                  <span className="font-bold text-slate-950">Status:</span> {externalStatus.replace("_", " ")}
                </p>
                <p>
                  <span className="font-bold text-slate-950">Net amount:</span> {usdFormatter.format(quote.netUsd)}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <Timer className="h-5 w-5 text-amber-700" aria-hidden="true" />
                <h2 className="text-base font-bold text-slate-950">Release gates</h2>
              </div>
              <div className="space-y-3">
                {[
                  ["KYC/KYB", kycStatus === "approved" ? "pass" : "hold"],
                  ["PIX settled", anchorStatusRank[anchorStatus] >= 3 ? "pass" : "hold"],
                  ["USDC ready", anchorStatusRank[anchorStatus] >= 4 ? "pass" : "hold"],
                  ["External screening", externalStatusRank[externalStatus] >= 1 ? "pass" : "hold"],
                ].map(([label, state]) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-700">{label}</span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                        state === "pass" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {state}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
                <h2 className="text-base font-bold text-slate-950">Operational timeline</h2>
              </div>
              <div className="space-y-3">
                {timeline.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
                      <div
                        className={`grid h-10 w-10 place-items-center rounded-lg ${
                          item.status === "complete"
                            ? "bg-emerald-100 text-emerald-800"
                            : item.status === "ready"
                              ? "bg-sky-100 text-sky-800"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-950">{item.label}</h3>
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                              item.status === "complete"
                                ? "bg-emerald-100 text-emerald-800"
                                : item.status === "ready"
                                  ? "bg-sky-100 text-sky-800"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.status === "complete" ? "mocked complete" : item.status}
                          </span>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" />
                <h2 className="text-base font-bold text-slate-950">Decision flags</h2>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-bold text-slate-950">{recipientProfiles[recipientType].label}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Risk: <span className="font-bold text-slate-950">{recipientProfiles[recipientType].risk}</span>
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{recipientProfiles[recipientType].review}</p>
              </div>
              <div className="mt-3 space-y-2">
                {riskFlags.map((flag) => (
                  <div key={flag} className="flex gap-2 text-sm leading-6 text-slate-700">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                    <span>{flag}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-bold text-slate-950">Cost breakdown</h2>
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                {[
                  ["Gross USD before costs", usdFormatter.format(quote.grossUsd)],
                  [`PIX PSP fee (${pctFromBps(quote.safePixFeeBps)} + fixed)`, `${brlFormatter.format(quote.pixFeeBrl)} / ${usdFormatter.format(quote.pixFeeUsd)}`],
                  [`Anchor fee (${pctFromBps(quote.safeAnchorFeeBps)} + fixed)`, `${brlFormatter.format(quote.anchorFeeBrl)} / ${usdFormatter.format(quote.anchorFeeUsd)}`],
                  [`Platform fee (${pctFromBps(quote.safePlatformFeeBps)})`, usdFormatter.format(quote.platformFeeUsd)],
                  [`Liquidity spread (${pctFromBps(quote.safeLiquiditySpreadBps)})`, usdFormatter.format(quote.liquidityFeeUsd)],
                  [`Off-ramp fee (${pctFromBps(quote.safeOfframpFeeBps)})`, usdFormatter.format(quote.offrampFeeUsd)],
                  [`IOF estimate (${pctFromBps(quote.safeIofBps)})`, `${brlFormatter.format(quote.iofBrl)} / ${usdFormatter.format(quote.iofUsd)}`],
                  [`${railLabels[payoutRail]} fixed fee`, usdFormatter.format(quote.bankFeeUsd)],
                  ["Wise receiving fee", usdFormatter.format(quote.wiseReceivingFeeUsd)],
                  ["Stellar network estimate", usdFormatter.format(quote.stellarFeeUsd)],
                  ["Estimated net USD", usdFormatter.format(quote.netUsd)],
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2 text-sm ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50"
                    } ${index === 10 ? "font-bold text-emerald-800" : "text-slate-700"}`}
                  >
                    <span>{label}</span>
                    <span className="text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-bold text-slate-950">Provider assumptions</h2>
              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                <p>
                  <span className="font-bold text-slate-950">Selected path:</span> {providerProfiles[provider].label}
                </p>
                <p>
                  <span className="font-bold text-slate-950">Expected settlement:</span>{" "}
                  {providerProfiles[provider].settlement}
                </p>
                <p>{providerProfiles[provider].note}</p>
                <p>
                  <span className="font-bold text-slate-950">Last quote refresh:</span>{" "}
                  {lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-slate-700" aria-hidden="true" />
              <h2 className="text-base font-bold text-slate-950">Fees paid by stage</h2>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-[0.08em] text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-bold">Fee</th>
                    <th className="px-3 py-2 font-bold">Paid to</th>
                    <th className="px-3 py-2 font-bold">When</th>
                    <th className="px-3 py-2 font-bold">Amount</th>
                    <th className="px-3 py-2 font-bold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {feeRows.map((fee, index) => (
                    <tr key={fee.label} className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                      <td className="px-3 py-3 font-bold text-slate-950">{fee.label}</td>
                      <td className="px-3 py-3 text-slate-700">{fee.paidTo}</td>
                      <td className="px-3 py-3 text-slate-700">{fee.when}</td>
                      <td className="px-3 py-3 font-semibold text-slate-950">{fee.amount}</td>
                      <td className="px-3 py-3 text-slate-600">{fee.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100 shadow-sm">
              <h2 className="text-base font-bold">Quote payload preview</h2>
              <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg bg-black/35 p-3 text-xs leading-5 text-slate-200">
                {JSON.stringify(quotePayload, null, 2)}
              </pre>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100 shadow-sm">
              <h2 className="text-base font-bold">Anchor order preview</h2>
              <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg bg-black/35 p-3 text-xs leading-5 text-slate-200">
                {JSON.stringify(anchorPayload, null, 2)}
              </pre>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100 shadow-sm">
              <h2 className="text-base font-bold">Transfer payload preview</h2>
              <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg bg-black/35 p-3 text-xs leading-5 text-slate-200">
                {JSON.stringify(transferPayload, null, 2)}
              </pre>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100 shadow-sm">
              <h2 className="text-base font-bold">External payout instruction</h2>
              <pre className="mt-3 max-h-[360px] overflow-auto rounded-lg bg-black/35 p-3 text-xs leading-5 text-slate-200">
                {JSON.stringify(externalInstruction, null, 2)}
              </pre>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
