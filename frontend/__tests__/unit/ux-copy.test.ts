import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("UX copy guardrails", () => {
  it("keeps intermediate success pages visible long enough to read", () => {
    const text = source("lib/web-feedback.ts");

    expect(text).toContain("INTERMEDIATE_PAGE_CLOSE_DELAY_MS = 4000");
  });

  it("keeps shared account affordances on money screens", () => {
    const screens = [
      "app/rendimentos/rendimentos-client.tsx",
      "app/transactions/transactions-client.tsx",
      "app/balance/balance-client.tsx",
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

    const pixRampText = source("app/pix-ramp/pix-ramp-client.tsx");
    expect(pixRampText).toContain("MobilePixStepper");
    expect(pixRampText).toContain("LiveRampPanel");
    expect(pixRampText).not.toContain("AccountStatusCard");
    expect(pixRampText).not.toContain("ReturnToChat");
  });

  it("keeps chat link labels mapped to product screens", () => {
    const i18nText = source("lib/i18n.tsx");
    const chatText = source("components/chat/chat-window.tsx");
    const globalCss = source("app/globals.css");

    expect(i18nText).toContain('chat_link_yield: "Abrir rendimentos"');
    expect(i18nText).toContain('chat_link_profile: "Abrir perfil"');
    expect(i18nText).toContain('chat_link_balance: "Abrir saldo"');
    expect(i18nText).toContain('chat_link_history: "Abrir histórico"');
    expect(i18nText).toContain('chat_link_external_send: "Abrir envio externo"');
    expect(chatText).toContain('path.endsWith("/rendimentos")');
    expect(chatText).toContain('path.startsWith("/profile/")');
    expect(chatText).toContain('path.endsWith("/balance")');
    expect(chatText).toContain('path.endsWith("/transactions")');
    expect(chatText).toContain('path.endsWith("/send-external")');
    expect(chatText).toContain("tts-chat-user-bubble");
    expect(globalCss).toContain(".tts-chat-user-bubble");
    expect(globalCss).toContain("color: #ffffff !important");
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
    const globalCss = source("app/globals.css");
    const financialRouter = source("../backend/src/api/routes/financial.router.ts");

    expect(text).toContain("AccountStatusCard");
    expect(text).toContain('fetch(`/api/financial/${scopedFinancialApiPath("conversion-confirmation")}`');
    expect(text).toContain("ConfirmConversionClient");
    expect(text).toContain("Nada passa pelo chat");
    expect(text).toContain("Saldo insuficiente para converter");
    expect(text).toContain("Falta ${missingSourceDisplay}");
    expect(text).toContain("Adicionar saldo");
    expect(text).toContain('const [sourceCode, setSourceCode] = useState("BRL")');
    expect(text).toContain('const [destCode, setDestCode] = useState("USDC")');
    expect(text).not.toContain('const [sourceCode, setSourceCode] = useState("USDC")');
    expect(text).not.toContain('const [destCode, setDestCode] = useState("BRL")');
    expect(text).toContain("min-h-[100dvh]");
    expect(text).toContain("flex min-h-0 flex-1 flex-col overflow-hidden md:hidden");
    expect(text).toContain('compact ? "grid-cols-2" : ""');
    expect(text).toContain("showBalanceNotice && (hasBlockingBalanceIssue || hasZeroSourceBalance)");
    expect(text).not.toContain('<MobileSummaryLine label={L("PIN", "PIN")}');
    expect(text).toContain('buildUrl("/pix-on"');
    expect(text).toContain("receive_amount: formatQueryDecimal");
    expect(text).toContain("return_to: conversionReturnHref");
    expect(text).toContain("payload?.token");
    expect(text).toContain("currentPageSessionSource");
    expect(text).toContain("normalizeClientSessionSource");
    expect(text).toContain("function sessionSourceFromQueryString");
    expect(text).toContain("scopedRampApiPath");
    expect(text).toContain("scopedFinancialApiPath");
    expect(text).toContain('params.set("session_scope", source)');
    expect(text).toContain("const externalLinkContext = externalSessionScope ? { source: externalSessionScope, session_scope: externalSessionScope, provider: externalSessionScope } : {}");
    expect(text).toContain("...externalLinkContext");
    expect(text).toContain("fetch(`/api/ramp/${scopedRampApiPath(path)}`");
    expect(text).toContain("{ source: sessionScope, session_scope: sessionScope }");
    expect(text).toContain("tts-choice-selected");
    expect(text).toContain("tts-choice-name");
    expect(text).toContain("tts-choice-badge");
    expect(text).not.toContain('selected ? "border-tts-confirm bg-tts-confirm/15');
    expect(globalCss).toContain(".tts-op-page .tts-choice-grid button[aria-pressed='true']");
    expect(globalCss).toContain(".tts-op-page .tts-choice-grid button .tts-choice-name");
    expect(globalCss).toContain("color: var(--tts-deep) !important");
    expect(text).not.toContain("ReturnToChat");
    expect(text).not.toContain('buildUrl("/chat"');
    expect(financialRouter).toContain("conversion-confirmation");
  });

  it("keeps conversion amounts single-sourced from the confirmation quote", () => {
    const text = source("app/convert/convert-client.tsx");

    expect(text).toContain('L("Confirmação segura", "Secure confirmation")');
    expect(text).toContain("A próxima tela calcula e trava os valores finais antes do PIN.");
    expect(text).toContain('L("Definido na confirmação", "Set in confirmation")');
    expect(text).toContain('L("Par selecionado", "Selected pair")');
    expect(text).toContain('L("Valor final", "Final amount")');
    expect(text).not.toContain("selectedRateCell");
    expect(text).not.toContain("conversion-matrix");
    expect(text).not.toContain("numericAmount *");
    expect(text).not.toContain('L("Cotação selecionada", "Selected quote")');
    expect(text).not.toContain('L("Taxa", "Rate")');
    expect(text).not.toContain('L("Saldo de origem", "Source balance")');
    expect(text).not.toContain('L("Sai da conta", "Leaves account")');
    expect(text).not.toContain('L("De / Para", "From / To")');
    expect(text).not.toContain("min-w-[640px]");
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
    const apiText = source("app/api/logout/route.ts");
    const chatText = source("components/chat/chat-window.tsx");

    expect(text).toContain("closeIntermediatePage()");
    expect(text).toContain("INTERMEDIATE_PAGE_CLOSE_COPY");
    expect(text).toContain('localStorage.removeItem("talk-to-stellar.browserId")');
    expect(chatText).toContain("const restoredSessionId = await restoreAuthenticatedBrowserSession();");
    expect(chatText).toContain("if (!cancelled && !restoredSessionId) beginExpiredBrowserSession(true);");
    expect(chatText).toContain('localStorage.removeItem("talk-to-stellar.browserId")');
    expect(apiText).toContain("isBrowserOnlyLogout");
    expect(apiText).toContain("localOnly: true");
    expect(text).not.toContain('window.location.replace("/chat")');
    expect(text).not.toContain("Returning to chat");
    expect(text).not.toContain("Go back to");
  });

  it("keeps WhatsApp and Telegram account links login-only", () => {
    const loginText = source("app/login/login-client.tsx");
    const createText = source("app/create-account/create-account-client.tsx");
    const agentRoutesText = source("../backend/src/api/agent/routes.ts");

    expect(agentRoutesText).toContain("createLoginUrlWithShortLink(normalizedProvider");
    expect(agentRoutesText).toContain("entrar na sua conta com PIN");
    expect(createText).toContain('["whatsapp", "phone", "telegram"].includes(tokenProvider)');
    expect(createText).toContain("window.location.replace(loginHref)");
    expect(createText).toContain("Ambiente de teste");
    expect(createText).toContain("saldo sem valor real");
    expect(createText).toContain("Nenhum valor aqui representa dinheiro de verdade");
    expect(loginText).toContain('["whatsapp", "phone", "telegram"].includes(externalProvider)');
    expect(loginText).toContain("footer={!isExternalLoginOnlyContext");
    expect(loginText).toContain("GOOGLE_LOGIN_ENABLED && !isExternalLoginOnlyContext");
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

  it("keeps logout out of the rendimentos tab bar", () => {
    const text = source("app/rendimentos/rendimentos-client.tsx");
    const languageToggleText = source("components/shared/language-toggle.tsx");

    expect(text).not.toContain('href="/logout"');
    expect(text).not.toContain('>{L("Sair", "Logout")}</a>');
    expect(languageToggleText).toContain('href="/logout"');
    expect(languageToggleText).toContain("const logoutTitle");
    expect(languageToggleText).not.toContain(">{logoutTitle}</span>");
  });

  it("keeps the passkey page framed around biometrics for users", () => {
    const text = source("app/passkey-test/passkey-test-client.tsx");

    expect(text).toContain("Entrar com biometria");
    expect(text).toContain("Segurança avançada");
    expect(text).not.toContain("Testar passkey e OpenZeppelin");
  });

  it("keeps login QR as a phone-generated code flow for desktop sign-in", () => {
    const loginText = source("app/login/login-client.tsx");
    const passkeyProxyText = source("app/api/passkeys/[...path]/route.ts");
    const backendRouterText = source("../backend/src/api/routes/passkey.router.ts");
    const backendServiceText = source("../backend/src/api/services/core/passkey.service.ts");

    expect(loginText).toContain('url.searchParams.set("auth", "passkey-code")');
    expect(loginText).toContain('url.searchParams.set("phone_code", "1")');
    expect(loginText).toContain('url.searchParams.set("pair", passkeyPairId)');
    expect(loginText).toContain("handlePhonePasskeyCode");
    expect(loginText).toContain("handleRedeemPhonePasskeyCode");
    expect(loginText).toContain("Código do celular");
    expect(loginText).toContain("Generate code for computer");
    expect(loginText).toContain("/api/passkeys/login-code/create");
    expect(loginText).toContain("/api/passkeys/login-code/redeem");
    expect(passkeyProxyText).toContain("passthroughResponseWithSession");
    expect(backendRouterText).toContain("login-code/create");
    expect(backendRouterText).toContain("login-code/redeem");
    expect(backendServiceText).toContain("passkey_login_pairing_codes");
    expect(backendServiceText).toContain("hashLoginPairingCode");
  });

  it("keeps BRL visible while sending TESOURO as the backend settlement asset", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain('displayCode === "BRL" ? "TESOURO"');
    expect(text).toContain("final_asset: settlementAssetCode(targetAsset)");
    expect(text).toContain("auto_pay_asset_code: settlementAssetCode(autoPaySourceAsset || autoPayAsset || targetAsset)");
    expect(text).toContain("asset_code: requestedAutoPayAsset");
    expect(text).toContain("source_asset_code: sourceAssetCode");
    expect(text).toContain("display_source_asset_code: offRampInputAsset");
    expect(text).not.toContain("final_asset: targetAsset");
    expect(text).not.toMatch(/(^|[^\w])source_asset_code:\s*offRampInputAsset/);
  });

  it("keeps BRL PIX top-up net-first and sends the receipt link back to chat", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");
    const webFeedbackText = source("lib/web-feedback.ts");
    const chatText = source("components/chat/chat-window.tsx");

    expect(text).toContain('const desiredFinalAmount = rampMode === "onramp"');
    expect(text).toContain('targetAsset === "BRL"');
    expect(text).toContain("estimatePixOnRampGrossForBrlReceive(toPositiveNumber(requestedFinalAmount, 0)).toFixed(2)");
    expect(text).toContain("amount: quoteAmountBrl");
    expect(text).toContain("amount: orderAmountBrl");
    expect(text).toContain("refreshOrder(false)");
    expect(text).toContain("function extractRampReceiptUrl(...sources: unknown[]): string");
    expect(text).toContain("function buildRampReceiptFallbackUrl(reference: unknown): string");
    expect(text).toContain("receiptUrl: extractRampReceiptUrl(completedTransaction, refreshed, payload)");
    expect(text).toContain("const backendReceiptUrl = extractRampReceiptUrl(");
    expect(text).toContain("if (backendReceiptUrl) return;");
    expect(text).toContain("buildRampReceiptFallbackUrl(transactionHash || operationId || orderId)");
    expect(text).toContain("const onRampReceiptUrl = extractRampReceiptUrl(statusPayload, orderPayload)");
    expect(text).toContain('receiptUrl ? L(`Comprovante: ${receiptUrl}`, `Receipt: ${receiptUrl}`) : ""');
    expect(text).toContain("Taxa de conversão estimada");
    expect(text).toContain("formatFeeParts");
    expect(text).toContain("Base para conversão");
    expect(text).toContain("TRADITIONAL_METHOD_ONRAMP_FEE_PCT");
    expect(text).toContain("TRADITIONAL_METHOD_OFFRAMP_FEE_PCT");
    expect(text).toContain("function traditionalMethodFeePct(mode: RampMode)");
    expect(text).toContain("estimated_traditional_fee_brl");
    expect(text).toContain("estimated_savings_brl");
    expect(text).toContain("actualOffRampFeeBrl");
    expect(text).toContain("actualOnRampFeeBrl");
    expect(text).toContain("showSavingsCard");
    expect(text).toContain("estimatedSavingsBrl");
    expect(text).toContain("const totalEstimatedFee = estimatedProviderFee + estimatedTtsFee");
    expect(text).toContain('L("Taxa de retirada aprox.", "Est. withdrawal fee")');
    expect(text).toContain('L("Taxa estimada", "Estimated fee")');
    expect(text).toContain('L("retirada aproximada", "estimated withdrawal")');
    expect(text).toContain('const showOffRampComparison = mode === "offramp" && traditionalFee > 0 && totalEstimatedFee > 0');
    expect(text).toContain('L("Comparativo", "Comparison")');
    expect(text).toContain('L("do tradicional", "of traditional cost")');
    expect(text).toContain("text-tts-deep md:hidden");
    expect(text).toContain("const checkoutExpired = Boolean(order && !isSuccessStatus(rawOrderStatus) && (orderExplicitlyExpired || quoteExpired));");
    expect(text).toContain("!checkoutExpired &&");
    expect(text).toContain("function restartOnRampCheckout()");
    expect(text).toContain("const canPrepareOnRampPix = Boolean(");
    expect(text).toContain("createOnRampIdempotencyKey = buildIdempotencyKey(`create-onramp:${executionIntentId}:${quoteForOrder?.id || \"no-quote\"}`)");
    expect(text).toContain('quoteExpired\n                    ? L("Gerar novo PIX", "Create new PIX")');
    expect(text).toContain('disabled={!canPrepareOnRampPix}');
    expect(text).toContain('L("Economia", "Savings")');
    expect(text).toContain('L("Economia estimada", "Estimated savings")');
    expect(text).toContain("savingsPercentDisplay");
    expect(text).toContain("remainingFeePercentDisplay");
    expect(text).toContain('const savingsCaption = L("menos taxa", "less fee")');
    expect(text).toContain('const onRampMobilePercentOnly = mode === "onramp" && showSavingsCard');
    expect(text).toContain('${onRampMobilePercentOnly ? "tts-mobile-soft-hide " : ""}mt-5');
    expect(text).toContain("text-3xl font-black leading-none text-tts-confirm");
    expect(text).toContain("do custo tradicional");
    expect(text).not.toContain("Taxa desta rota:");
    expect(text).not.toContain("Comparado a métodos tradicionais estimados");
    expect(text).not.toContain("formatMoney(estimatedSavingsBrl)");
    expect(text).not.toContain('L("Taxa da conta", "Account fee")');
    expect(text).not.toContain('L("Taxa total", "Total fee")');
    expect(text).not.toContain("Esse é o valor descontado nesta operação");
    expect(text).toContain("finalConversionPending");
    expect(text).toContain("onRampFinalAssetDelta");
    expect(text).toContain('finalAsset === "BRL"');
    expect(text).toContain("Conversão para");
    expect(text).toContain("!returnToPath && !stayOpenAfterSuccess");
    expect(text).toContain("receipt-top-return-cta");
    expect(webFeedbackText).toContain("isExternalChannelPage()");
    expect(webFeedbackText).toContain('source === "whatsapp" || source === "telegram"');
    expect(chatText).toContain('chatId !== "agent" || typeof window === "undefined" || externalPriorityChat');
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
    expect(reviewText).toContain("Rentabilidade");
    expect(reviewText).not.toContain("Simulação");
    expect(reviewText).not.toContain("Somente consulta");
    expect(reviewText).toContain("Confirmar investimento");
    expect(reviewText).toContain("Confirmação de investimento indisponível agora");
    expect(reviewText).toContain("Explicar investimento");
    expect(reviewText).toContain("Como funciona este investimento?");
    expect(reviewText).toContain("Uma vault funciona como um cofre de rendimento");
    expect(reviewText).toContain("registra sua participação");
    expect(reviewText).toContain("não representa dinheiro real");
    expect(reviewText).not.toContain("Confirmar na DeFindex");
    expect(reviewText).not.toContain("Confirmação DeFindex indisponível agora");
    expect(reviewText).toContain("const canConfirm = confirmAvailable && !submitted && pin.length >= 4 && !apiState.loading;");
    expect(reviewText).not.toContain("const canConfirm = canPrepare && confirmAvailable");
    expect(reviewText).toContain("Posições");
    expect(reviewText).toContain("Posição atual");
    expect(reviewText).toContain("formatPositionAmount");
    expect(reviewText).not.toContain("Nada aplicado agora");
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
    expect(pixText).toContain("offRampShortageOpen");
    expect(pixText).toContain("setOffRampShortageOpen(true)");
    expect(pixText).toContain("Saldo insuficiente");
    expect(pixText).toContain("Converter saldo");
    expect(pixText).toContain("useOffRampAlternativeAsset");
    expect(pixText).toContain("source_asset: offRampAlternativeAsset");
    expect(pixText).not.toContain("source_asset: offRampAlternativeAsset || offRampInputAsset");
    expect(pixText).toContain("Usar ${offRampAlternativeAsset}");
    expect(pixText).toContain("bg-tts-error shadow-red-950/20");
    expect(pixText).not.toContain("Confirmação final");
    expect(pixText).not.toContain("Este botão confirma a retirada");
  });

  it("keeps the transaction history as a full web page, not a chat-only list", () => {
    const text = source("app/transactions/transactions-client.tsx");

    expect(text).toContain("Todo histórico");
    expect(text).toContain("Todas as transações");
    expect(text).toContain("Veja entradas, envios, conversões, PIX e ajustes");
    expect(text).toContain('const [period, setPeriod] = useState<PeriodMode>("all")');
    expect(text).toContain("Buscar por contato, valor, moeda, PIX ou hash");
    expect(text).toContain("Itens por página");
    expect(text).toContain("Página {page} de {totalPages}");
    expect(text).toContain("Mostrando {pageStart}-{pageEnd}");
    expect(text).not.toContain("Transactions for");
    expect(text).not.toContain("Full list with person");
  });

  it("keeps wallet profile as an account overview with asset distribution", () => {
    const text = source("app/profile/[publicKey]/wallet-profile-client.tsx");

    expect(text).toContain("Perfil global");
    expect(text).toContain("Distribuição da carteira");
    expect(text).toContain("Saldos por asset");
    expect(text).toContain("Moedas com saldo");
    expect(text).toContain("Maior saldo");
    expect(text).toContain("Ações rápidas");
    expect(text).toContain("Copiar chave");
    expect(text).toContain("PIN na confirmação");
    expect(text).not.toContain("PIN obrigatório");
    expect(text).not.toContain("Payment link");
    expect(text).not.toContain("Pay ");
  });

  it("keeps PIN copy natural on balance and transactions pages", () => {
    const balanceText = source("app/balance/balance-client.tsx");
    const transactionsText = source("app/transactions/transactions-client.tsx");
    const agentText = source("../backend/src/api/agent/graph.ts");

    expect(balanceText).toContain("Digite seu PIN para ver saldo, XLM e outros ativos.");
    expect(balanceText).toContain("Digite seu PIN para ver os valores.");
    expect(transactionsText).toContain("Digite seu PIN para ver as movimentações.");
    expect(agentText).toContain("Abra seu saldo aqui:");
    expect(agentText).toContain("Abra seu histórico aqui:");
    expect(agentText).not.toContain("Para proteger seu saldo");
    expect(agentText).not.toContain("Para proteger seu histórico");
    expect(agentText).not.toContain("tela segura abaixo");
  });
});
