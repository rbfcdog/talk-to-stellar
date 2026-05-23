type MockError = Error & { statusCode?: number; code?: string };

function readFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

export function userFacingMocksAllowed(): boolean {
  return readFlag('ALLOW_USER_FACING_MOCKS', false) ||
    readFlag('TTS_ALLOW_USER_FACING_MOCKS', false);
}

export function opsMocksAllowed(): boolean {
  return readFlag('ALLOW_OPS_MOCKS', process.env.NODE_ENV === 'test') ||
    readFlag('TTS_ALLOW_OPS_MOCKS', false);
}

export function specificMockAllowed(envName: string, scope: 'user' | 'ops' = 'ops'): boolean {
  if (!readFlag(envName, false)) return false;
  return scope === 'user' ? userFacingMocksAllowed() : opsMocksAllowed();
}

export function mockPolicySnapshot() {
  return {
    user_facing_mocks_allowed: userFacingMocksAllowed(),
    ops_mocks_allowed: opsMocksAllowed(),
    local_pix_fallback_allowed: specificMockAllowed('ETHERFUSE_SANDBOX_PIX_FALLBACK', 'user'),
    mock_pix_intent_allowed: specificMockAllowed('INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX', 'ops'),
    mock_stellar_settlement_allowed: specificMockAllowed('ALLOW_STELLAR_MOCK_SETTLEMENT', 'ops'),
    mock_usd_payout_allowed: specificMockAllowed('ALLOW_MOCK_USD_PAYOUTS', 'ops') ||
      specificMockAllowed('ALLOW_MOCK_PAYOUTS', 'ops'),
  };
}

export function mockDisabledError(feature: string, hint?: string): MockError {
  const message = [
    `${feature} mock is disabled.`,
    hint || 'Configure a real provider or an official sandbox integration before running this flow.',
  ].filter(Boolean).join(' ');
  const error = new Error(message) as MockError;
  error.statusCode = 409;
  error.code = 'mock_disabled';
  return error;
}
