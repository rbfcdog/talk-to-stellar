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
    expect(text).toContain('amountCurrency === "BRL") return "BRL"');
    expect(text).toContain('const headerCurrencyAsset = rampMode === "onramp" ? "BRL" : targetAsset');
    expect(text).not.toContain('mode === "onramp" ? "USDC" : "BRL"');
  });

  it("does not copy exact XLM/CETES receive targets into the BRL PIX amount field", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain("hasExactOnRampReceiveTarget");
    expect(text).toContain("amountParamIsPixBrl");
    expect(text).toContain("setAmountBrl(\"\")");
    expect(text).toContain("requestedOnRampTargetDisplay");
    expect(text).toContain('desiredReceiveAsset === "BRL" || desiredReceiveAsset === "USDC"');
    expect(text).toContain("/api/financial/conversion-matrix?assets=BRL,USDC,CETES,XLM");
    expect(text).toContain("PIX amount estimated from conversion matrix");
    expect(text).toContain("const requiredNetBrl = receiveTarget / rate");
    expect(text).toContain("const effectiveOnRampPixPayAmount = String(");
    expect(text).toContain("quote ? effectiveOnRampPixPayDisplay : formatMoney(amountBrl)");
    expect(text).toContain("const quotedOrderAmountBrl = normalizeHumanAmount(quoteForOrder?.fromAmount || \"\")");
    expect(text).toContain("PIX pela rota da sua conta");
    expect(text).toContain("pixFundedTransferError");
    expect(text).toContain("PIX confirmado. Não consegui concluir o envio automático agora");
    expect(text).toContain("if (!transferFlow || transferPayload) markOperationCompleted();");
    expect(text).toContain("if (!transferFlow || transferPayload) {");
    expect(text).toContain("O PIX será calculado pela cotação dinâmica antes de gerar o QR.");
    expect(text).not.toContain("PIX estimado pela rota da sua conta");
    expect(text).not.toContain("formatMoney(paymentInstructions.amount || order.fromAmount || amountBrl)");
    expect(text).not.toContain('receiveAmount && (normalizedReceiveAsset === "USDC" || normalizedReceiveAsset === "BRL")');
    expect(text).not.toContain("Alvo: mandar ${formatMoney(amountBrl)}");
  });

  it("keeps WhatsApp/Telegram session scope on PIX GET and POST ramp calls", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain("scopedExternalSource ? { session_scope: scopedExternalSource }");
    expect(text).toContain("const externalContext: Record<string, string>");
    expect(text).toContain("const search = new URLSearchParams({ ...auth, language, ...externalContext, ...(params || {}) });");
    expect(text).toContain("body: JSON.stringify({ ...auth, language, ...externalContext })");
  });
});
