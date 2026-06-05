import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("external channel login", () => {
  it("keeps WhatsApp and Telegram login PIN-only without requiring an email in the browser", () => {
    const text = source("app/login/login-client.tsx");

    expect(text).toContain('["whatsapp", "phone", "telegram"].includes(externalProvider)');
    expect(text).toContain("const useExternalPinOnlyLogin = hasExternalContext && isExternalLoginOnlyContext");
    expect(text).toContain("(!isExternalLoginOnlyContext && !loginEmail)");
    expect(text).toContain("email: loginEmail || undefined");
    expect(text).toContain("const externalSessionScope = externalProvider ===");
    expect(text).toContain("session_scope: externalSessionScope");
    expect(text).toContain("...externalSessionContext");
  });
});
