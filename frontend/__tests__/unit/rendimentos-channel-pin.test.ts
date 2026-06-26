import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("rendimentos channel PIN gate", () => {
  it("requires a fresh PIN before showing rendimentos for WhatsApp or Telegram sessions", () => {
    const text = source("app/rendimentos/rendimentos-client.tsx");
    const sessionText = source("lib/session.ts");
    const routeText = source("../backend/src/api/routes/ramp.router.ts");

    expect(sessionText).toContain("externalPriority");
    expect(text).toContain("currentPageSessionSource");
    expect(text).toContain("externalSessionSource");
    expect(text).toContain("scopedRampSource(preferredSource)");
    expect(text).toContain("scopedRampPath");
    expect(text).toContain("scopedRampInit");
    expect(text).toContain("function scopedLinkContext(initialQuery?: string)");
    expect(text).toContain("const sessionLinkContext = useMemo(() => scopedLinkContext(initialQuery), [initialQuery]);");
    expect(text).toContain('params.set("session_scope", source)');
    expect(text).toContain("session_scope: payload.session_scope || source");
    expect(text).toContain("fetch(`/api/ramp/${scopedRampPath(path, preferredSource)}`");
    expect(text).toContain('buildMoneyUrl("/rendimentos", { view: "application", action: "deposit", amount, asset: safeSelectedCode, ...sessionLinkContext');
    expect(text).toContain('buildMoneyUrl("/rendimentos", { view: "application", action: "deposit", asset: row.code, amount: "100", ...sessionLinkContext');
    expect(text).toContain("return_to: newApplicationUrl");
    expect(text).toContain('yieldApi("session/verify-pin"');
    expect(text).toContain("session.sessionSource");
    expect(text).toContain('yieldApi("etherfuse/wallet-balances", undefined, 20000, session.sessionSource)');
    expect(text).toContain("setReturnsPinVerified(true)");
    expect(text).toContain("requiresChannelPin");
    expect(text).toContain("!channelPinUnlocked");
    expect(text).toContain("ChannelPinGate");
    expect(text).toContain("Digite seu PIN para ver seus rendimentos.");
    expect(text).not.toContain("Acesso aberto pelo WhatsApp pede PIN antes de mostrar rendimentos.");
    expect(routeText).toContain("router.post('/session/verify-pin'");
  });
});
