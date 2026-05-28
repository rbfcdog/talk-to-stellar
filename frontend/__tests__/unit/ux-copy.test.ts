import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("UX copy guardrails", () => {
  it("keeps shared account and chat affordances on the main money screens", () => {
    const screens = [
      "app/rendimentos/rendimentos-client.tsx",
      "app/convert/convert-client.tsx",
      "app/pix-ramp/pix-ramp-client.tsx",
      "app/passkey-test/passkey-test-client.tsx",
    ];

    for (const screen of screens) {
      const text = source(screen);
      expect(text, `${screen} should use the shared account status`).toContain("AccountStatusCard");
      expect(text, `${screen} should preserve a return path to chat`).toContain("ReturnToChat");
    }
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
    expect(reviewText).toContain("CurrentInvestmentsPage");
    expect(reviewText).not.toContain("returnsOpen");
    expect(reviewText).toContain("Toque em uma moeda com opção ativa.");
    expect(reviewText).not.toContain("Outros saldos");
    expect(reviewText).not.toContain("Estes saldos não aparecem");
    expect(returnsPage).toContain('view="returns"');
    expect(pixText).toContain("offRampInsufficientBalance");
    expect(pixText).toContain("Converter ativos");
    expect(pixText).toContain("Usar ${offRampAlternativeAsset} nesta retirada");
  });
});
