import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("PIN gates for balance-bearing screens", () => {
  it("gates conversion before loading account balances or preparing confirmation", () => {
    const text = source("app/convert/convert-client.tsx");

    expect(text).toContain('import { SecurePinGate } from "@/components/shared/secure-pin-gate";');
    expect(text).toContain('const [pinVerified, setPinVerified] = useState(false);');
    expect(text).toContain('setAccountStatus(sessionPayload.authenticated ? "locked" : "signed-out");');
    expect(text).toContain('async function loadAccountBalances()');
    expect(text).toContain('const accountPayload = await accountApi("etherfuse/wallet-balances");');
    expect(text).toContain('if (!pinVerified) {');
    expect(text).toContain("Digite seu PIN para abrir a conversão.");
    expect(text).toContain("setPinVerified(true);");
    expect(text).toContain("void loadAccountBalances();");
    expect(text).not.toContain(".then(async (sessionPayload)");
  });

  it("requires PIN for rendimentos before balances and positions are shown", () => {
    const text = source("app/rendimentos/rendimentos-client.tsx");

    expect(text).toContain("const requiresChannelPin = Boolean(session.authenticated);");
    expect(text).toContain("const channelPinUnlocked = !requiresChannelPin || returnsPinVerified;");
    expect(text).toContain("session.authenticated && channelPinUnlocked && configured");
    expect(text).toContain("setReturnsPinVerified(true)");
    expect(text).toContain('await refreshAccountBalances();');
    expect(text).toContain('if (tab !== "returns" || !session.authenticated || !options.length || !channelPinUnlocked) return;');
    expect(text).not.toContain("const accountPromise = nextSession.authenticated");
  });

  it("gates mainnet wallet balances, operations, and yield position refresh", () => {
    const text = source("app/mainnet/mainnet-client.tsx");

    expect(text).toContain('import { SecurePinGate } from "@/components/shared/secure-pin-gate";');
    expect(text).toContain('const [pinVerified, setPinVerified] = useState(false);');
    expect(text).toContain("async function refreshAll(unlocked = pinVerified)");
    expect(text).toContain("if (!unlocked) {");
    expect(text).toContain('setApiState({ loading: false, message: "Digite seu PIN para ver saldos e operações.", error: "" });');
    expect(text).toContain('error: "Digite seu PIN para atualizar saldos."');
    expect(text).toContain('error: "Digite seu PIN para consultar posição."');
    expect(text).toContain("void refreshAll(true);");
  });

  it("gates external send preview before available balance is fetched", () => {
    const text = source("app/send-external/send-external-client.tsx");

    expect(text).toContain('import { SecurePinGate } from "@/components/shared/secure-pin-gate"');
    expect(text).toContain('import { getClientSession } from "@/lib/session"');
    expect(text).toContain('const [pinVerified, setPinVerified] = useState(false)');
    expect(text).toContain("if (!sessionChecked || !session.authenticated || !pinVerified) {");
    expect(text).toContain("const canSubmit = pinVerified && validDestination");
    expect(text).toContain("Digite seu PIN para consultar saldo e destino.");
    expect(text).toContain("setPinVerified(true)");
  });

  it("gates wallet profile balances and distribution", () => {
    const text = source("app/profile/[publicKey]/wallet-profile-client.tsx");

    expect(text).toContain('import { SecurePinGate } from "@/components/shared/secure-pin-gate"');
    expect(text).toContain('const [pinVerified, setPinVerified] = useState(false)');
    expect(text).toContain('async function loadProfile(currentSessionId = session.sessionId, unlocked = pinVerified)');
    expect(text).toContain('if (!currentSessionId || !session.authenticated || !unlocked)');
    expect(text).toContain("Digite seu PIN para ver saldo, distribuição e histórico do perfil.");
    expect(text).toContain("void loadProfile(session.sessionId, true)");
  });
});
