function readBoolean(value: unknown): boolean {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function normalizedNetwork(): string {
  return String(process.env.STELLAR_NETWORK || 'TESTNET').trim().toUpperCase();
}

function looksLikePublicHorizon(url?: string): boolean {
  const normalized = String(url || '').trim().toLowerCase();
  return normalized === 'https://horizon.stellar.org' || normalized.includes('stellar-mainnet');
}

export function assertTestnetOnlyScript(scriptName: string, horizonUrl?: string): void {
  const network = normalizedNetwork();
  if (network === 'PUBLIC' || network === 'MAINNET' || network === 'PUBNET') {
    throw new Error(`${scriptName} is Testnet-only and cannot run with STELLAR_NETWORK=${network}.`);
  }

  if (looksLikePublicHorizon(horizonUrl || process.env.STELLAR_HORIZON_URL)) {
    throw new Error(`${scriptName} is Testnet-only and cannot run against a Mainnet Horizon URL.`);
  }
}

export function assertMainnetBulkMutationAllowed(scriptName: string): void {
  const network = normalizedNetwork();
  if (network !== 'PUBLIC' && network !== 'MAINNET' && network !== 'PUBNET') {
    return;
  }

  if (!readBoolean(process.env.STELLAR_MAINNET_ALLOW_BULK_MUTATION)) {
    throw new Error(
      `${scriptName} would mutate many Mainnet accounts. Set STELLAR_MAINNET_ALLOW_BULK_MUTATION=true only during an approved maintenance window.`
    );
  }
}
