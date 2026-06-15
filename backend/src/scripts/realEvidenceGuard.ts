type GuardIssue = {
  path: string;
  reason: string;
};

const DISALLOWED_PLACEHOLDER_PATTERN =
  /\bmock\b|mock[_:-]|[_:-]mock|fake|dummy|placeholder|no_real_money/i;
const STELLAR_TX_HASH_PATTERN = /^[a-f0-9]{64}$/i;

function getPath(value: string, key: string): string {
  return value ? `${value}.${key}` : key;
}

function collectPlaceholderIssues(
  value: unknown,
  path: string,
  issues: GuardIssue[],
): void {
  if (typeof value === "string") {
    if (DISALLOWED_PLACEHOLDER_PATTERN.test(value)) {
      issues.push({
        path,
        reason: `placeholder value is not allowed in final evidence: ${value}`,
      });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectPlaceholderIssues(item, `${path}[${index}]`, issues),
    );
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      collectPlaceholderIssues(item, getPath(path, key), issues);
    }
  }
}

function transferFromEvidence(evidence: Record<string, unknown>): Record<string, unknown> {
  const transfer = evidence.transfer;
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer)) {
    throw new Error("Evidence export rejected: missing transfer object.");
  }
  return transfer as Record<string, unknown>;
}

function nestedObject(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const nested = value[key];
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : {};
}

export function assertFinalRealTransferEvidence(evidence: Record<string, unknown>): void {
  const issues: GuardIssue[] = [];
  collectPlaceholderIssues(evidence, "evidence", issues);

  const transfer = transferFromEvidence(evidence);
  const state = String(transfer.state || "");
  if (state !== "RECONCILED") {
    issues.push({
      path: "transfer.state",
      reason: `final evidence must be RECONCILED, got ${state || "missing"}`,
    });
  }

  const pix = nestedObject(transfer, "pix");
  const chargeId = String(pix.charge_id || pix.e2e_id || pix.txid || "");
  if (!chargeId) {
    issues.push({
      path: "transfer.pix",
      reason: "final evidence must include a real PIX charge/e2e/txid value",
    });
  }

  const stellar = nestedObject(transfer, "stellar");
  const txHash = String(stellar.tx_hash || "");
  const ledger = Number(stellar.ledger || 0);
  if (!STELLAR_TX_HASH_PATTERN.test(txHash)) {
    issues.push({
      path: "transfer.stellar.tx_hash",
      reason: "final evidence must include a 64-character Stellar transaction hash",
    });
  }
  if (!Number.isFinite(ledger) || ledger <= 0) {
    issues.push({
      path: "transfer.stellar.ledger",
      reason: "final evidence must include a positive Stellar ledger number",
    });
  }

  const reconciliation = nestedObject(transfer, "reconciliation");
  if (!reconciliation.reconciled_at) {
    issues.push({
      path: "transfer.reconciliation.reconciled_at",
      reason: "final evidence must include reconciliation metadata",
    });
  }

  if (issues.length) {
    const details = issues
      .map((issue) => `- ${issue.path}: ${issue.reason}`)
      .join("\n");
    throw new Error(
      `Evidence export rejected because it is not final real transfer evidence:\n${details}`,
    );
  }
}
