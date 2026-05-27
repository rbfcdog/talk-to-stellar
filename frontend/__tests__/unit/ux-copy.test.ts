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
      "PIN ativo",
      "A consultar",
      "Sem conta",
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
});
