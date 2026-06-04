import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("PIX asset defaults", () => {
  it("keeps generic PIX add-money links in BRL unless another asset is explicit", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain('normalizeTargetAsset(asset, "BRL")');
    expect(text).toContain("resolveOnRampTargetAssetFromQuery");
    expect(text).toContain('const DEFAULT_TARGET_ASSETS: TargetAsset[] = ["BRL", "USDC", "CETES", "XLM"]');
    expect(text).toContain('amountCurrency === "BRL") return "BRL"');
    expect(text).toContain("const headerCurrencyAsset = rampMode === \"onramp\"");
    expect(text).not.toContain('mode === "onramp" ? "USDC" : "BRL"');
  });

  it("does not copy exact XLM/CETES receive targets into the BRL PIX amount field", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain("hasExactOnRampReceiveTarget");
    expect(text).toContain('params.get("quote_amount")');
    expect(text).toContain('params.get("quote_asset")');
    expect(text).not.toContain("quoteOnlyUsdcOnRamp");
    expect(text).not.toContain("settlementReceiveAsset");
    expect(text).toContain("amountParamIsPixBrl");
    expect(text).toContain("setAmountBrl(\"\")");
    expect(text).toContain("requestedOnRampTargetDisplay");
    expect(text).toContain('desiredReceiveAsset === "BRL" || desiredReceiveAsset === "USDC"');
    expect(text).toContain("Exact non-BRL PIX target will be quoted by backend");
    expect(text).toContain('contract: "backend_strict_receive_quote"');
    expect(text).not.toContain("/api/financial/conversion-matrix?assets=BRL,USDC,CETES,XLM");
    expect(text).not.toContain("PIX amount estimated from conversion matrix");
    expect(text).not.toContain("const requiredNetBrl = receiveTarget / rate");
    expect(text).toContain("const quotedOnRampPixPayAmount = String(");
    expect(text).toContain("const hasExecutableOnRampPixPayAmount = Boolean(normalizeHumanAmount(quotedOnRampPixPayAmount));");
    expect(text).toContain("const onRampHeaderValueDisplay = exactOnRampValueContract");
    expect(text).toContain("const quotedOrderAmountBrl = normalizeHumanAmount(quoteForOrder?.fromAmount || \"\")");
    expect(text).toContain("Cotação preparada. Gere o PIX para travar o valor final.");
    expect(text).toContain("PIX final:");
    expect(text).toContain("if (exactOnRampValueContract) return;");
    expect(text).toContain("await requestQuote({ displayQuote: !exactOnRampValueContract })");
    expect(text).toContain("function updateOnRampReceiveTargetAmount(nextAmount: string)");
    expect(text).toContain("value={targetReceiveInputAmount}");
    expect(text).toContain('aria-label={L("Valor que você quer receber", "Amount you want to receive")}');
    expect(text).toContain("setAutoPayAmount(nextAmount)");
    expect(text).toContain("setPixFundedTransferResult(null)");
    expect(text).toContain("pixFundedTransferError");
    expect(text).toContain("PIX confirmado. Não consegui concluir o envio automático agora");
    expect(text).toContain("if (!transferFlow || transferPayload) markOperationCompleted();");
    expect(text).toContain("if (!transferFlow || transferPayload) {");
    expect(text).toContain("Chave PIX");
    expect(text).toContain("O PIX final será calculado pela rota dinâmica antes de gerar o QR.");
    expect(text).not.toContain("PIX pela rota da sua conta");
    expect(text).not.toContain("PIX estimado pela rota da sua conta");
    expect(text).not.toContain("Chave PIX/e-mail");
    expect(text).not.toContain("Contato salvo validado");
    expect(text).not.toContain("Contato validado");
    expect(text).not.toContain("Contact verified");
    expect(text).not.toContain("Ver contato");
    expect(text).not.toContain("See contact");
    expect(text).not.toContain("formatMoney(paymentInstructions.amount || order.fromAmount || amountBrl)");
    expect(text).not.toContain('receiveAmount && (normalizedReceiveAsset === "USDC" || normalizedReceiveAsset === "BRL")');
    expect(text).not.toContain("Alvo: mandar ${formatMoney(amountBrl)}");
  });

  it("keeps the visible BRL receive field stable while PIX fees are estimated", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain('const editingOnRampReceiveTarget = Boolean(rampMode === "onramp" && (targetAsset === "BRL" || exactOnRampReceiveTarget));');
    expect(text).toContain('const targetReceiveInputAmount = editingOnRampReceiveTarget');
    expect(text).toContain('desiredReceiveAmount || (targetAsset === "BRL" ? amountBrl : desiredFinalAmount)');
    expect(text).toContain('if (targetAsset === "BRL" || exactOnRampReceiveTarget) {');
    expect(text).toContain("setDesiredReceiveAmount(nextAmount)");
    expect(text).toContain("if (!desiredReceiveAsset) setDesiredReceiveAsset(targetAsset)");
    expect(text).toContain("setAmountBrl(estimatedBrl.toFixed(2))");
    expect(text).not.toContain('const targetReceiveInputAmount = exactOnRampReceiveTarget ? desiredReceiveAmount : (targetAsset === "BRL" ? amountBrl : desiredFinalAmount);');
  });

  it("keeps WhatsApp/Telegram session scope on PIX GET and POST ramp calls", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain("scopedExternalSource ? { session_scope: scopedExternalSource }");
    expect(text).toContain("const externalContext: Record<string, string>");
    expect(text).toContain("const search = new URLSearchParams({ ...auth, language, ...externalContext, ...(params || {}) });");
    expect(text).toContain("body: JSON.stringify({ ...auth, language, ...externalContext })");
  });
});
