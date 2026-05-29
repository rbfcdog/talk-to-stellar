import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("UX copy guardrails", () => {
  it("keeps shared account affordances on money screens", () => {
    const screens = [
      "app/rendimentos/rendimentos-client.tsx",
      "app/pix-ramp/pix-ramp-client.tsx",
      "app/transactions/transactions-client.tsx",
      "app/passkey-test/passkey-test-client.tsx",
    ];

    for (const screen of screens) {
      const text = source(screen);
      expect(text, `${screen} should use the shared account status`).toContain("AccountStatusCard");
    }

    for (const screen of screens) {
      const text = source(screen);
      expect(text, `${screen} should not expose chat-only return buttons`).not.toContain("ReturnToChat");
    }
  });

  it("keeps conversion confirmation inside the web flow, not chat", () => {
    const text = source("app/convert/convert-client.tsx");
    const financialRouter = source("../backend/src/api/routes/financial.router.ts");

    expect(text).toContain("AccountStatusCard");
    expect(text).toContain("/api/financial/conversion-confirmation");
    expect(text).toContain("ConfirmConversionClient");
    expect(text).toContain("Nada passa pelo chat");
    expect(text).toContain("payload?.token");
    expect(text).not.toContain("ReturnToChat");
    expect(text).not.toContain('buildUrl("/chat"');
    expect(financialRouter).toContain("conversion-confirmation");
  });

  it("keeps conversion confirmation inside the web app with visible errors", () => {
    const text = source("app/confirm-conversion/confirm-conversion-client.tsx");

    expect(text).toContain('buildActionUrl("/transactions"');
    expect(text).toContain("Conversão não concluída");
    expect(text).toContain("visibleSupportCode");
    expect(text).toContain("O resultado é salvo no histórico da conta.");
    expect(text).not.toContain("Voltar ao chat");
    expect(text).not.toContain("Back to chat");
    expect(text).not.toContain('buildActionUrl("/chat"');
    expect(text).not.toContain("enqueueWebChatFeedback");
    expect(text).not.toContain("chat recebe");
  });

  it("does not bring back the confusing yield wording that was removed", () => {
    const text = source("app/rendimentos/rendimentos-client.tsx");
    const forbidden = [
      "Plano de rendimento",
      "Aplicar saldo",
      "Taxa informada",
      "Projeção 12m",
      "PIN ativo",
      "A consultar",
      "Sem conta",
      "APY",
      "Saldo operacional",
      "Operational balance",
      "OPS",
      "Rendimentos atuais",
      "Ver rendimentos atuais",
    ];

    for (const phrase of forbidden) {
      expect(text).not.toContain(phrase);
    }
  });

  it("keeps the passkey page framed around biometrics for users", () => {
    const text = source("app/passkey-test/passkey-test-client.tsx");

    expect(text).toContain("Entrar com biometria");
    expect(text).toContain("Segurança avançada");
    expect(text).not.toContain("Testar passkey e OpenZeppelin");
  });

  it("keeps BRL visible while sending TESOURO as the backend settlement asset", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain('displayCode === "BRL" ? "TESOURO"');
    expect(text).toContain("final_asset: settlementAssetCode(targetAsset)");
    expect(text).toContain("auto_pay_asset_code: settlementAssetCode(autoPayAsset || targetAsset)");
    expect(text).toContain("asset_code: requestedAutoPayAsset");
    expect(text).toContain("source_asset_code: sourceAssetCode");
    expect(text).toContain("display_source_asset_code: offRampInputAsset");
    expect(text).not.toContain("final_asset: targetAsset");
    expect(text).not.toMatch(/(^|[^\w])source_asset_code:\s*offRampInputAsset/);
  });

  it("keeps application options tied to configured vaults and gives recovery actions for PIX shortage", () => {
    const reviewText = source("app/rendimentos/rendimentos-client.tsx");
    const pixText = source("app/pix-ramp/pix-ramp-client.tsx");
    const returnsPage = source("app/rendimentos/page.tsx");

    expect(reviewText).toContain("const actionableOption = selectedOption;");
    expect(reviewText).toContain("Converter ativos");
    expect(reviewText).toContain("href={returnsHref}");
    expect(reviewText).toContain('view: "application"');
    expect(reviewText).toContain('action: "deposit"');
    expect(reviewText).toContain('view: "returns"');
    expect(reviewText).toContain("CurrentInvestmentsPage");
    expect(reviewText).toContain("PortfolioOverview");
    expect(reviewText).toContain("Distribuição visual");
    expect(reviewText).toContain("Simulação visual");
    expect(reviewText).toContain("Posições");
    expect(reviewText).toContain("Posição atual");
    expect(reviewText).toContain("Nada aplicado agora");
    expect(reviewText).toContain("Testnet · valores estimados");
    expect(reviewText).toContain("extractDefindexPositionAmount(payload?.position || payload?.balance)");
    expect(reviewText).toContain("operation_history_fallback");
    expect(reviewText).toContain("Atualizado pelo histórico da conta");
    expect(reviewText).toContain("Confirmando...");
    expect(reviewText).toContain('role="status"');
    expect(reviewText).not.toContain("returnsOpen");
    expect(reviewText).not.toContain("Execução aprovada");
    expect(reviewText).not.toContain("posiçãoões");
    expect(reviewText).not.toContain("maior que zero");
    expect(reviewText).not.toContain("Com saldo");
    expect(reviewText).not.toContain("Outros saldos");
    expect(reviewText).not.toContain("Estes saldos não aparecem");
    expect(returnsPage).toContain("resolvedView");
    expect(returnsPage).toContain('view={resolvedView}');
    expect(returnsPage).toContain('"application"');
    expect(returnsPage).toContain('"returns"');
    expect(pixText).toContain("offRampInsufficientBalance");
    expect(pixText).toContain("Converter outro ativo para R$");
    expect(pixText).toContain("source_asset: offRampAlternativeAsset");
    expect(pixText).not.toContain("source_asset: offRampAlternativeAsset || offRampInputAsset");
    expect(pixText).toContain("Usar ${offRampAlternativeAsset} nesta retirada");
  });

  it("keeps the transaction history as a full web page, not a chat-only list", () => {
    const text = source("app/transactions/transactions-client.tsx");

    expect(text).toContain("Todo histórico");
    expect(text).toContain("Todas as transações");
    expect(text).toContain("Veja entradas, envios, conversões, PIX e ajustes");
    expect(text).toContain('const [period, setPeriod] = useState<PeriodMode>("all")');
    expect(text).toContain("Buscar por contato, valor, moeda, PIX ou hash");
    expect(text).not.toContain("Transactions for");
    expect(text).not.toContain("Full list with person");
  });
});
