import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRightLeft } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

type PreviewPayload = {
  success: boolean;
  input?: { brl_amount?: number };
  quote?: { brl_per_usdc?: number; usdc_per_brl?: number; source?: string };
  output?: { gross_receive_usdc?: number; receive_usdc?: number };
  fees?: {
    talktostellar_spread_brl?: number;
    talktostellar_spread_usdc?: number;
    network_fee_brl?: number;
    network_fee_usdc?: number;
    total_fee_brl?: number;
    total_fee_usdc?: number;
    total_fee_pct?: number;
    spread_bps_config?: number;
    network_fee_display?: string;
  };
  comparison?: {
    traditional_fee_pct?: number;
    traditional_fee_brl?: number;
    savings_brl?: number;
  };
  message?: string;
};

function formatBrl(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  const small = safe > 0 && safe < 0.01;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: small ? 6 : 2,
    maximumFractionDigits: small ? 6 : 2,
  }).format(safe);
}

function formatUsdc(value: number, decimals = 2) {
  const n = Number.isFinite(value) ? value : 0;
  return `US$ ${n.toFixed(decimals)}`;
}

export default function SimulatorSection() {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const [brlAmount, setBrlAmount] = useState<string>("1000");
  const [payload, setPayload] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const parsed = Number(brlAmount.replace(",", "."));
    const amount = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/financial/conversion-fees-preview?brl_amount=${encodeURIComponent(String(amount || 0))}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = (await response.json()) as PreviewPayload;
        if (!controller.signal.aborted) {
          setPayload(data?.success ? data : null);
        }
      } catch {
        if (!controller.signal.aborted) setPayload(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [brlAmount]);

  const numbers = useMemo(() => {
    const rate = Number(payload?.quote?.usdc_per_brl || 0);
    const receiveUsdc = Number(payload?.output?.receive_usdc || 0);
    const grossReceiveUsdc = Number(payload?.output?.gross_receive_usdc || 0);
    const spreadBrl = Number(payload?.fees?.talktostellar_spread_brl || 0);
    const networkBrl = Number(payload?.fees?.network_fee_brl || 0);
    const totalFeeBrl = Number(payload?.fees?.total_fee_brl || 0);
    const totalFeePct = Number(payload?.fees?.total_fee_pct || 0);
    const traditionalFeePct = Number(payload?.comparison?.traditional_fee_pct || 0);
    const traditionalFeeBrl = Number(payload?.comparison?.traditional_fee_brl || 0);
    const savingsBrl = Number(payload?.comparison?.savings_brl || 0);
    return {
      rate,
      receiveUsdc,
      grossReceiveUsdc,
      spreadBrl,
      networkBrl,
      totalFeeBrl,
      totalFeePct,
      traditionalFeePct,
      traditionalFeeBrl,
      savingsBrl,
    };
  }, [payload]);

  return (
    <section id="simulator" className="py-20 w-full flex flex-col items-center relative scroll-mt-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white leading-tight">
          {L("Simule sua", "Simulate your")} <span className="text-[#00D2FF]">{L("economia", "savings")}</span>
        </h2>
        <p className="text-lg text-[#9BA4B5] max-w-2xl mx-auto">
          {L("Compare a taxa de um caminho tradicional com a rota do TalkToStellar antes de começar.", "Compare traditional fees with the real BRL to USDC route in TalkToStellar.")}
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="w-full max-w-md relative min-w-0 overflow-hidden rounded-[1.5rem] border border-white/[0.03] bg-[#0C1421]/80 backdrop-blur-md p-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D2FF]/10 blur-[50px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#4CA1EF]/10 blur-[50px] pointer-events-none" />

        <div className="text-center mb-8 relative z-10">
          <p className="text-[#9BA4B5] text-sm font-medium">{L("Estimativa atual", "Optimized live estimate")}</p>
          <p className="text-[#00D2FF] font-semibold mt-1">
            {numbers.rate > 0 ? `R$ 1 = US$ ${numbers.rate.toFixed(6)}` : L("Carregando estimativa...", "Loading estimate...")}
          </p>
          <p className="text-[11px] text-[#9BA4B5] mt-1">
            {L("Base: reais da sua conta", "Source: BRL from your account")}
          </p>
        </div>

        <div className="space-y-6 relative z-10">
          <div className="bg-white/5 border border-white/[0.03] rounded-2xl p-4 transition-colors focus-within:border-[#00D2FF]/50 hover:border-white/[0.03]">
            <label className="block text-xs font-medium text-[#9BA4B5] mb-2 uppercase tracking-wider">{L("Você envia", "You send")}</label>
            <div className="flex items-center justify-between">
              <input
                type="number"
                value={brlAmount}
                onChange={(e) => setBrlAmount(e.target.value)}
                className="bg-transparent border-none outline-none text-3xl font-bold text-white w-full"
                placeholder="0.00"
                min="0"
                step="0.01"
              />
              <div className="flex items-center gap-2 bg-[#0C1421]/80 rounded-full px-3 py-1.5 shrink-0 ml-2 border border-white/[0.03]">
                <img src="https://flagcdn.com/w20/br.png" alt="BRL" className="w-5 h-5 rounded-full object-cover" />
                <span className="font-bold text-slate-200">BRL</span>
              </div>
            </div>
          </div>

          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className="bg-[#16324f] border border-white/[0.03] p-2 rounded-full hidden sm:block shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
              <ArrowRightLeft className="w-5 h-5 text-[#00D2FF] rotate-90" />
            </div>
          </div>

          <div className="bg-white/5 border border-white/[0.03] rounded-2xl p-4">
            <label className="block text-xs font-medium text-[#9BA4B5] mb-2 uppercase tracking-wider">{L("Você recebe", "You receive (estimate)")}</label>
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={numbers.receiveUsdc > 0 ? numbers.receiveUsdc.toFixed(4) : "0.0000"}
                readOnly
                className="bg-transparent border-none outline-none text-3xl font-bold text-[#00D2FF] w-full"
              />
              <div className="flex items-center gap-2 bg-[#0C1421]/80 rounded-full px-3 py-1.5 shrink-0 ml-2 border border-white/[0.03]">
                <div className="w-5 h-5 rounded-full bg-[#4CA1EF] flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold">$</span>
                </div>
                <span className="font-bold text-slate-200">USDC</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-[#9BA4B5]">
              {L("Antes das taxas", "Before fees")}: {formatUsdc(numbers.grossReceiveUsdc, 4)}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-white/[0.03] bg-white/5 p-4 text-sm text-[#cbd5e1]">
          <p>{L("Taxa TalkToStellar", "TalkToStellar fee")}: {formatBrl(numbers.spreadBrl)}</p>
          <p>{L("Taxa de processamento estimada", "Estimated processing fee")}: {formatBrl(numbers.networkBrl)}</p>
          <p className="font-semibold text-white mt-1">
            {L("Taxa total", "Total fee")}: {formatBrl(numbers.totalFeeBrl)} ({numbers.totalFeePct.toFixed(4)}%)
          </p>
          <div className="mt-3 pt-3 border-t border-white/[0.03] space-y-1">
            <p className="text-xs text-[#9BA4B5]">
              {L("Caminho tradicional estimado", "Traditional method (estimate)")}: {formatBrl(numbers.traditionalFeeBrl)} ({numbers.traditionalFeePct.toFixed(2)}%)
            </p>
            <p className="text-sm font-semibold text-emerald-400">
              {L("Economia estimada", "Savings vs traditional method")}: {formatBrl(numbers.savingsBrl)}
            </p>
          </div>
        </div>

        <div className="space-y-6 relative z-10 w-full mt-8">
          <a
            href="/chat"
            className="inline-flex w-full items-center justify-center bg-[#00D2FF] text-slate-950 font-bold text-lg py-4 rounded-xl hover:bg-cyan-300 transition-colors shadow-[0_0_20px_rgba(34,211,238,0.2)]"
          >
            {L("TESTAR NO CHAT WEB", "TRY IT IN THE BROWSER")}
          </a>
          {loading && <p className="text-center text-xs text-[#9BA4B5]">{L("Atualizando estimativa...", "Updating rate and simulation...")}</p>}
        </div>
      </motion.div>

      <div className="w-full max-w-5xl mx-auto px-4 mt-16">
        <h4 className="text-xl md:text-2xl font-semibold text-white text-center mb-8">{L("Controle de custo em cada conversão", "Cost control on every conversion")}</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          <div className="bg-[#162032] border border-white/[0.03] rounded-2xl p-6 flex flex-col items-center text-center shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
            <h5 className="text-white font-medium mb-1">{L("Custo tradicional", "Traditional cost")}</h5>
            <p className="text-[#9BA4B5] text-sm mb-4">{L("Referência média de mercado", "Average market benchmark")}</p>
            <div className="mt-auto pt-4 border-t border-white/[0.03] w-full">
              <p className="text-[11px] text-[#9BA4B5] uppercase tracking-wider mb-1">{L("Taxa estimada", "Estimated fee")}</p>
              <p className="font-bold text-red-400 text-xl">{formatBrl(numbers.traditionalFeeBrl)}</p>
              <p className="text-xs text-red-500/70 mt-1">~{numbers.traditionalFeePct.toFixed(2)}%</p>
            </div>
          </div>

          <div className="bg-[#0C1421] border border-[#00D2FF]/30 rounded-2xl p-8 flex flex-col items-center text-center shadow-[0_4px_32px_rgba(34,211,238,0.15)] relative transform md:-translate-y-4 z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-[#00D2FF] to-transparent" />
            <h5 className="text-white font-bold text-lg mb-1">TalkToStellar</h5>
            <p className="text-[#00D2FF] text-sm font-medium mb-4">{L("Taxas visíveis antes da confirmação", "Fees visible before confirmation")}</p>
            <div className="mt-auto pt-4 border-t border-white/[0.03] w-full">
              <p className="text-[11px] text-[#00D2FF]/70 uppercase tracking-wider mb-1">{L("Taxa total da conversão", "Total conversion fee")}</p>
              <p className="font-black text-[#00D2FF] text-3xl">{formatBrl(numbers.totalFeeBrl)}</p>
              <p className="text-xs text-[#9BA4B5] mt-2">{numbers.totalFeePct.toFixed(4)}% {L("do valor enviado", "of the sent amount")}</p>
            </div>
          </div>

          <div className="bg-[#162032] border border-white/[0.03] rounded-2xl p-6 flex flex-col items-center text-center shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
            <h5 className="text-white font-medium mb-1">{L("Economia estimada", "Estimated savings")}</h5>
            <p className="text-[#9BA4B5] text-sm mb-4">{L("comparado ao caminho tradicional", "vs traditional fee")}</p>
            <div className="mt-auto pt-4 border-t border-white/[0.03] w-full">
              <p className="text-[11px] text-[#9BA4B5] uppercase tracking-wider mb-1">{L("Você preserva", "You keep")}</p>
              <p className="font-bold text-emerald-400 text-xl">{formatBrl(numbers.savingsBrl)}</p>
              <p className="text-xs text-emerald-500/70 mt-1">{L("Com a rota do TalkToStellar", "With BRL to USDC routing in TalkToStellar")}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
