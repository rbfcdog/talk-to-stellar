import {
  getAssetIssuer,
  normalizeAssetCode,
  PUBLIC_USDC_ISSUER,
  TESTNET_USDC_ISSUER,
} from '../src/config/assets';

describe('asset config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('normalizes USD and native asset aliases', () => {
    expect(normalizeAssetCode('usd')).toBe('USDC');
    expect(normalizeAssetCode('native')).toBe('XLM');
    expect(normalizeAssetCode('brl')).toBe('BRL');
  });

  it('uses Circle testnet USDC issuer by default on testnet', () => {
    delete process.env.USDC_ISSUER;
    process.env.STELLAR_NETWORK = 'TESTNET';
    expect(getAssetIssuer('USDC')).toBe(TESTNET_USDC_ISSUER);
  });

  it('uses Circle public USDC issuer by default on public network', () => {
    delete process.env.USDC_ISSUER;
    process.env.STELLAR_NETWORK = 'PUBLIC';
    expect(getAssetIssuer('USDC')).toBe(PUBLIC_USDC_ISSUER);
  });

  it('requires explicit BRL issuer', () => {
    delete process.env.BRL_ISSUER;
    expect(getAssetIssuer('BRL')).toBeUndefined();
    process.env.BRL_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    expect(getAssetIssuer('BRL')).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
  });
});
