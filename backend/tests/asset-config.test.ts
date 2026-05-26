import {
  assetMatchesConfiguredIssuer,
  getDefaultTrustedAssets,
  getAssetIssuer,
  getTrustedPathAssetCodes,
  getUserFacingAssetCodes,
  resolveConfiguredAsset,
  normalizeAssetCode,
  settlementAssetCode,
  userFacingAssetCode,
  ETHERFUSE_TESOURO_ISSUER,
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
    expect(normalizeAssetCode('euro')).toBe('EURC');
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

  it('settles user-facing reais as TESOURO', () => {
    expect(settlementAssetCode('BRL')).toBe('TESOURO');
    expect(settlementAssetCode('real')).toBe('TESOURO');
    expect(resolveConfiguredAsset('BRL')).toEqual({
      code: 'TESOURO',
      issuer: ETHERFUSE_TESOURO_ISSUER,
    });
    expect(userFacingAssetCode('TESOURO')).toBe('BRL');
  });

  it('uses TESOURO issuer for user-facing BRL on any network', () => {
    process.env.TESOURO_ISSUER = 'GCGI6NT5KO6BH5FGPIKPZWDKTEL7XQJQLMT7NIH22P7CVXGTKJV2P3KF';
    process.env.STELLAR_NETWORK = 'TESTNET';
    expect(getAssetIssuer('BRL')).toBe('GCGI6NT5KO6BH5FGPIKPZWDKTEL7XQJQLMT7NIH22P7CVXGTKJV2P3KF');
    process.env.STELLAR_NETWORK = 'PUBLIC';
    expect(getAssetIssuer('BRL')).toBe('GCGI6NT5KO6BH5FGPIKPZWDKTEL7XQJQLMT7NIH22P7CVXGTKJV2P3KF');
  });

  it('matches BRL only against the configured TESOURO issuer', () => {
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.TESOURO_ISSUER = 'GCGI6NT5KO6BH5FGPIKPZWDKTEL7XQJQLMT7NIH22P7CVXGTKJV2P3KF';

    expect(assetMatchesConfiguredIssuer('BRL', 'GCGI6NT5KO6BH5FGPIKPZWDKTEL7XQJQLMT7NIH22P7CVXGTKJV2P3KF')).toBe(true);
    expect(assetMatchesConfiguredIssuer('BRL', 'GDYAZKZBGC2NNI2FYVPJW5FNAGKUVJIIB3WO3JZFCGURG6TDU3JZNLTQ')).toBe(false);
  });

  it('keeps unknown asset aliases unchanged', () => {
    expect(normalizeAssetCode('foo')).toBe('FOO');
  });

  it('uses TESOURO, USDC, EURC and XLM as configured visible settlement assets', () => {
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.USDC_ISSUER = TESTNET_USDC_ISSUER;
    process.env.TESOURO_ISSUER = ETHERFUSE_TESOURO_ISSUER;
    process.env.EURC_ISSUER = 'GCGI6NT5KO6BH5FGPIKPZWDKTEL7XQJQLMT7NIH22P7CVXGTKJV2P3KF';
    process.env.TTS_VISIBLE_ASSET_CODES = 'TESOURO,USDC,EURC,XLM';

    expect(getUserFacingAssetCodes()).toEqual(['TESOURO', 'USDC', 'EURC', 'XLM']);
    expect(getDefaultTrustedAssets().map((asset) => asset.code)).not.toContain('BRL');
    expect(getDefaultTrustedAssets().map((asset) => asset.code)).not.toContain('XLM');
    expect(getDefaultTrustedAssets().map((asset) => asset.code)).toEqual(expect.arrayContaining(['TESOURO', 'USDC', 'EURC']));
    expect(getTrustedPathAssetCodes()).toEqual(['TESOURO', 'USDC', 'EURC', 'XLM']);
    expect(getTrustedPathAssetCodes()).not.toContain('BRL');
    expect(userFacingAssetCode('EURC')).toBe('EUR');
  });

  it('resolves user-facing EUR to Circle EURC issuer on public network', () => {
    process.env.STELLAR_NETWORK = 'PUBLIC';
    process.env.EURC_ISSUER_PUBLIC = 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2';
    process.env.EURC_ISSUER = 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO';
    delete process.env.EUR_ISSUER;

    expect(resolveConfiguredAsset('EUR')).toEqual({
      code: 'EURC',
      issuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2',
    });
    expect(getAssetIssuer('EURC')).toBe('GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2');
  });

  it('uses network-specific issuer envs for additional assets', () => {
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.CETES_ISSUER_TESTNET = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
    process.env.CETES_ISSUER_PUBLIC = 'GCGI6NT5KO6BH5FGPIKPZWDKTEL7XQJQLMT7NIH22P7CVXGTKJV2P3KF';

    expect(getAssetIssuer('CETES')).toBe('GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4');

    process.env.STELLAR_NETWORK = 'PUBLIC';
    expect(getAssetIssuer('CETES')).toBe('GCGI6NT5KO6BH5FGPIKPZWDKTEL7XQJQLMT7NIH22P7CVXGTKJV2P3KF');
  });
});
