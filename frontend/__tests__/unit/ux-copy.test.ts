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

  it("keeps chat link labels mapped to product screens", () => {
    const i18nText = source("lib/i18n.tsx");
    const chatText = source("components/chat/chat-window.tsx");

    expect(i18nText).toContain('chat_link_yield: "Abrir rendimentos"');
    expect(i18nText).toContain('chat_link_profile: "Abrir perfil"');
    expect(i18nText).toContain('chat_link_history: "Abrir histórico"');
    expect(i18nText).toContain('chat_link_external_send: "Abrir envio externo"');
    expect(chatText).toContain('path.endsWith("/rendimentos")');
    expect(chatText).toContain('path.startsWith("/profile/")');
    expect(chatText).toContain('path.endsWith("/transactions")');
    expect(chatText).toContain('path.endsWith("/send-external")');
  });

  it("keeps compact account cards short", () => {
    const text = source("components/shared/account-status.tsx");

    expect(text).toContain("compactDetail");
    expect(text).toContain("Conta pronta.");
    expect(text).toContain("Entre para continuar.");
    expect(text).toContain("compact ? copy.compactDetail : copy.detail");
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

  it("closes the external send screen after successful confirmation", () => {
    const text = source("app/send-external/send-external-client.tsx");

    expect(text).toContain("closeIntermediatePage()");
    expect(text).toContain("enqueueWebChatFeedback");
    expect(text).toContain("INTERMEDIATE_PAGE_CLOSE_COPY");
    expect(text).toContain("Envio externo concluído");
    expect(text).toContain("Fechar");
  });

  it("closes logout instead of returning to chat", () => {
    const text = source("app/logout/logout-client.tsx");

    expect(text).toContain("closeIntermediatePage()");
    expect(text).toContain("INTERMEDIATE_PAGE_CLOSE_COPY");
    expect(text).not.toContain('window.location.replace("/chat")');
    expect(text).not.toContain("Returning to chat");
    expect(text).not.toContain("Go back to");
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
    expect(reviewText).toContain("Distribuição");
    expect(reviewText).toContain("Simulação");
    expect(reviewText).toContain("Posições");
    expect(reviewText).toContain("Posição atual");
    expect(reviewText).toContain("Nada aplicado agora");
    expect(reviewText).toContain("Testnet · valores estimados");
    expect(reviewText).toContain("extractDefindexPositionAmount(payload?.position || payload?.balance)");
    expect(reviewText).toContain("operation_history_fallback");
    expect(reviewText).toContain("Atualizado pelo histórico da conta");
    expect(reviewText).toContain("Confirmando...");
    expect(reviewText).toContain('role="status"');
    expect(reviewText).not.toContain("Saldos e posições atualizados");
    expect(reviewText).not.toContain("Balances and positions updated");
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
