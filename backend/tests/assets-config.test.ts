import { getTrustedPathAssetCodes, getUserFacingAssetCodes } from '../src/config/assets';

describe('asset configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('supports the canonical visible asset list without separate BRL or EUR aliases', () => {
    process.env.ENABLE_TESOURO_ASSET = 'true';
    process.env.ENABLE_EURC_ASSET = 'true';
    process.env.TTS_VISIBLE_ASSET_CODES = 'TESOURO,USDC,EURC,XLM';

    expect(getUserFacingAssetCodes()).toEqual(['TESOURO', 'USDC', 'EURC', 'XLM']);
    expect(getTrustedPathAssetCodes()).toEqual(['TESOURO', 'USDC', 'EURC', 'XLM']);
  });
});
