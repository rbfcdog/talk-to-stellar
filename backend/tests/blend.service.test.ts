process.env.STELLAR_NETWORK = 'PUBLIC';
process.env.STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION = 'true';
process.env.STELLAR_HORIZON_URL = 'https://horizon.stellar.org';
process.env.BLEND_MAINNET_POOL = 'CBLLNN4MFMABJBA6O7DFEBZJBXJLBTJEKUZHLBAJ7U2KHTM4HFMVNKVT';

const mockBackstopConfigLoad = jest.fn();
const mockPoolLoad = jest.fn();
const mockPoolContractSubmit = jest.fn();

jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('@blend-capital/blend-sdk', () => ({
  BackstopConfig: { load: mockBackstopConfigLoad },
  PoolV2: { load: mockPoolLoad },
  PoolContractV2: jest.fn().mockImplementation(() => ({ submit: mockPoolContractSubmit })),
  RequestType: { Supply: 0, Withdraw: 1 },
}));

import { BlendService } from '../src/integrations/blend/service';

const ACTIVE_POOL = 'CDMAVJPFXPADND3YRL4BSM3AKZWCTFMX27GLLXCML3PD62HEQS5FPVAI';
const MAINNET_USDC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75';
const MAINNET_XLM = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA';

function reserve(supplyApy: number, borrowApy: number, utilization: number) {
  return {
    estSupplyApy: supplyApy,
    estBorrowApy: borrowApy,
    data: { dSupply: 1000n, bSupply: 250n },
    getUtilizationFloat: () => utilization,
  };
}

describe('BlendService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBackstopConfigLoad.mockResolvedValue({ rewardZone: [ACTIVE_POOL] });
    mockPoolLoad.mockResolvedValue({
      reserves: new Map([
        [MAINNET_XLM, reserve(0.013, 0.031, 0.42)],
        [MAINNET_USDC, reserve(0.0235, 0.052, 0.51)],
      ]),
    });
  });

  it('ignores stale invalid configured pool ids and discovers the reward-zone pool', async () => {
    const info = await BlendService.getPoolInfo('mainnet');

    expect(mockBackstopConfigLoad).toHaveBeenCalledWith(
      expect.objectContaining({ passphrase: 'Public Global Stellar Network ; September 2015' }),
      'CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7',
    );
    expect(mockPoolLoad).toHaveBeenCalledWith(
      expect.objectContaining({ passphrase: 'Public Global Stellar Network ; September 2015' }),
      ACTIVE_POOL,
    );
    expect(info).toMatchObject({
      poolId: ACTIVE_POOL,
      poolSource: 'reward_zone',
      network: 'mainnet',
      usdc: expect.objectContaining({ assetId: MAINNET_USDC, supplyApy: 2.35 }),
      xlm: expect.objectContaining({ assetId: MAINNET_XLM, supplyApy: 1.3 }),
    });
  });
});
