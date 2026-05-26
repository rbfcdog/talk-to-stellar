import { getTrustedPathAssetCodes, getUserFacingAssetCodes } from '../src/config/assets';

describe('asset configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('supports env-driven visible assets while keeping only EUR enabled for now', () => {
    process.env.ENABLE_TESOURO_ASSET = 'true';
    process.env.ENABLE_EURC_ASSET = 'true';
    process.env.TTS_VISIBLE_ASSET_CODES = 'BRL,USDC,EUR';

    expect(getUserFacingAssetCodes()).toEqual(['TESOURO', 'USDC', 'EURC']);
    expect(getTrustedPathAssetCodes()).toEqual(['TESOURO', 'USDC', 'EURC']);
  });
});
