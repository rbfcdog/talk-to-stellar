import {
  getAssetIssuer,
  normalizeAssetCode,
  PUBLIC_BRL_ISSUER_NTOKENS,
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

  it('uses nTokens BRL issuer by default on public network', () => {
    delete process.env.BRL_ISSUER_PUBLIC;
    process.env.STELLAR_NETWORK = 'PUBLIC';
    expect(getAssetIssuer('BRL')).toBe(PUBLIC_BRL_ISSUER_NTOKENS);
  });

  it('uses public BRL issuer fallback on testnet when BRL_ISSUER_TESTNET is not configured', () => {
    delete process.env.BRL_ISSUER_PUBLIC;
    delete process.env.BRL_ISSUER_TESTNET;
    process.env.STELLAR_NETWORK = 'TESTNET';
    expect(getAssetIssuer('BRL')).toBe(PUBLIC_BRL_ISSUER_NTOKENS);
    process.env.BRL_ISSUER_PUBLIC = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    expect(getAssetIssuer('BRL')).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
    process.env.BRL_ISSUER_TESTNET = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    expect(getAssetIssuer('BRL')).toBe('GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5');
  });
});
