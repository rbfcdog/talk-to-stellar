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
    expect(text).toContain("requiresChannelPin");
    expect(text).toContain("!channelPinUnlocked");
    expect(text).toContain('yieldApi("session/verify-pin"');
    expect(text).toContain("ChannelPinGate");
    expect(text).toContain("Acesso aberto pelo WhatsApp pede PIN antes de mostrar rendimentos.");
    expect(routeText).toContain("router.post('/session/verify-pin'");
  });
});
