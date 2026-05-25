import { getTrustedPathAssetCodes, getUserFacingAssetCodes } from '../src/config/assets';

describe('asset configuration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('supports env-driven visible multi-asset lists while keeping BRL settled as TESOURO', () => {
    process.env.ENABLE_TESOURO_ASSET = 'true';
    process.env.ENABLE_EURC_ASSET = 'true';
    process.env.TTS_VISIBLE_ASSET_CODES = 'BRL,USDC,EUR,GBP,MXN';

    expect(getUserFacingAssetCodes()).toEqual(['TESOURO', 'USDC', 'EURC', 'GBP', 'MXN']);
    expect(getTrustedPathAssetCodes()).toEqual(['TESOURO', 'USDC', 'EURC', 'GBP', 'MXN']);
  });
});
