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

  it("treats BRL PIX withdrawals as exact receive amounts, not gross debit amounts", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain('const offRampExactReceiveBrl = Boolean(rampMode === "offramp" && (offRampFiatAmount.trim() || offRampInputAsset === "BRL"));');
    expect(text).toContain('const targetBrlAmount = normalizeHumanAmount((offRampFiatAmount || (offRampInputAsset === "BRL" ? offRampAmount : "")).trim());');
    expect(text).toContain('offRampInputAsset === "BRL" ? "" : offRampAmount.trim()');
    expect(text).toContain('target_brl: offRampExactReceiveBrl ? targetBrlAmount : undefined');
  });

  it("calculates non-BRL PIX withdrawal fees from the converted BRL destination", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain("function quoteBrlDestinationAmount");
    expect(text).toContain("function estimatedBrlOffRampFeeParts");
    expect(text).toContain('const brlDestinationAmount = mode === "offramp" ? quoteBrlDestinationAmount(quote) : NaN;');
    expect(text).toContain('const brlOffRampFeeParts = mode === "offramp" ? estimatedBrlOffRampFeeParts(brlDestinationAmount) : null;');
    expect(text).toContain('providerFeeFromBps = mode === "offramp" && brlOffRampFeeParts');
    expect(text).toContain('mode === "offramp" && brlOffRampFeeParts && Number.isFinite(brlOffRampFeeParts.appFee)');
    expect(text).toContain('target_brl: quotePayload.target_brl || sourcePayload?.target_brl || sourcePayload?.destination_amount');
    expect(text).toContain('destination_amount: quotePayload.destination_amount || sourcePayload?.destination_amount || sourcePayload?.target_brl');
    expect(text).toContain('Calcule para ver quanto chega no PIX.');
    expect(text).toContain('A taxa estimada usa o valor convertido em reais.');
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
    expect(text).toContain("await requestQuote({ displayQuote: true })");
    expect(text).not.toContain("await requestQuote({ displayQuote: !exactOnRampValueContract })");
    expect(text).toContain("function updateOnRampReceiveTargetAmount(nextAmount: string)");
    expect(text).toContain("value={targetReceiveInputAmount}");
    expect(text).toContain('aria-label={L("Valor que você quer receber", "Amount you want to receive")}');
    expect(text).toContain("setAutoPayAmount(nextAmount)");
    expect(text).toContain("setPixFundedTransferResult(null)");
    expect(text).toContain("pixFundedTransferError");
    expect(text).toContain("PIX confirmado. Não consegui concluir o envio automático agora");
    expect(text).toContain("markOperationCompleted();");
    expect(text).toContain("if (!transferFlow || transferPayload) {");
    expect(text).toContain("showClear={false}");
    expect(text).toContain("Chave PIX");
    expect(text).toContain('label: L("PIN", "PIN")');
    expect(text).toContain("O PIX final será calculado pela rota dinâmica antes de gerar o QR.");
    expect(text).toContain('id="pix-receive-asset-label"');
    expect(text).toContain('L("Receber em:", "Receive in:")');
    expect(text).toContain('aria-labelledby="pix-receive-asset-label"');
    expect(text).toContain('onRampPixAlreadyGenerated');
    expect(text).toContain('L("Continuar", "Continue")');
    expect(text).not.toContain('rampMode === "onramp" && onRampPixCheckoutAvailable && !checkoutExpired && !orderFailed');
    expect(text).not.toContain("Confirmação do PIX");
    expect(text).not.toContain("Depois de pagar, confirme aqui para concluir a operação.");
    expect(text).not.toContain("Você verá o valor final e o status da operação nesta mesma tela.");
    expect(text).not.toContain("PIX pela rota da sua conta");
    expect(text).not.toContain("PIX estimado pela rota da sua conta");
    expect(text).not.toContain("Sua conta está pronta para confirmar este PIX.");
    expect(text).not.toContain("Your account is ready to confirm this PIX.");
    expect(text).not.toContain("<AccountStatusCard");
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

  it("shows the recipient receive asset for cross-asset PIX-funded sends", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain("autoPayShowsCrossAssetDestination");
    expect(text).toContain("autoPayDestinationAsset !== autoPayDisplaySourceAsset");
    expect(text).toContain("formatRampAsset(autoPayDisplaySourceAmount, autoPayDisplaySourceAsset)");
    expect(text).toContain("friendlyAssetName(autoPayDestinationAsset, language)");
    expect(text).toContain("auto_pay_destination_asset_code: autoPayDestinationAsset ? settlementAssetCode(autoPayDestinationAsset) : undefined");
    expect(text).toContain("destination_asset_code: requestedDestinationAsset");
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
    expect(text).toContain('const externalSessionScope = scopedExternalSource || (externalSource === "whatsapp" || externalSource === "telegram" ? externalSource : "");');
    expect(text).toContain("const externalLinkContext = {");
    expect(text).toContain("const offRampConversionHref = buildAppPath(\"/convert\", {");
    expect(text).toContain("...externalLinkContext");
    expect(text).toContain("const externalContext: Record<string, string>");
    expect(text).toContain("const search = new URLSearchParams({ ...auth, language, ...externalContext, ...(params || {}) });");
    expect(text).toContain("body: JSON.stringify({ ...auth, language, ...externalContext })");
  });
});
