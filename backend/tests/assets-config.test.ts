import { getTrustedPathAssetCodes, getUserFacingAssetCodes } from '../src/config/assets';

describe('asset configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('supports the canonical testnet visible asset list without separate BRL or EUR aliases', () => {
    process.env.ENABLE_TESOURO_ASSET = 'true';
    process.env.ENABLE_CETES_ASSET = 'true';
    process.env.ENABLE_EURC_ASSET = 'false';
    process.env.TTS_VISIBLE_ASSET_CODES = 'TESOURO,USDC,CETES,XLM';

    expect(getUserFacingAssetCodes()).toEqual(['TESOURO', 'USDC', 'CETES', 'XLM']);
    expect(getTrustedPathAssetCodes()).toEqual(['TESOURO', 'USDC', 'CETES', 'XLM']);
  });
});
