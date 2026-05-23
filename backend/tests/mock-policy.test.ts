import { AnchorService } from '../src/api/services/anchor.service';
import { PixFundingService } from '../src/api/services/pix-funding.service';
import { StellarSettlementService } from '../src/api/services/stellar-settlement.service';
import { getPayoutProviderAdapter } from '../src/api/services/usd-payout-adapters';

describe('mock policy hardening', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ALLOW_USER_FACING_MOCKS: 'false',
      ALLOW_OPS_MOCKS: 'false',
      INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX: 'false',
      ALLOW_STELLAR_MOCK_SETTLEMENT: 'false',
      ALLOW_MOCK_USD_PAYOUTS: 'false',
      STELLAR_NETWORK: 'TESTNET',
      STELLAR_SECRET_KEY: '',
      USD_OFFRAMP_STELLAR_DESTINATION: '',
      PAYOUT_STELLAR_DESTINATION_PUBLIC_KEY: '',
      PAYOUT_PROVIDER: '',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('blocks mock Pix funding intents by default', async () => {
    jest.spyOn(AnchorService, 'assertEtherfuseTestnetRuntime').mockImplementation(() => undefined);
    const service = new PixFundingService();

    await expect(service.createPixIntent({
      mock: true,
      session_id: '',
      session_token: '',
      transfer: {
        transfer_id: 'tr-test',
        brl_amount: '100',
        sender_identity: {},
      } as any,
    })).rejects.toMatchObject({
      code: 'mock_disabled',
      statusCode: 409,
    });
  });

  it('blocks mock Stellar settlement evidence by default', async () => {
    const service = new StellarSettlementService();

    await expect(service.settleUsdc({
      transfer_id: 'tr-test',
      quoted_usd_amount: '10',
    } as any)).rejects.toMatchObject({
      code: 'mock_disabled',
      statusCode: 409,
    });
  });

  it('uses a provider adapter by default and blocks explicit mock USD payouts', async () => {
    expect(getPayoutProviderAdapter().providerName).toBe('etherfuse');

    await expect(getPayoutProviderAdapter('mock').createPayoutInstruction({
      transferId: 'tr-test',
      amountUsd: '10',
      destination: {
        accountHolderName: 'Destination LLC',
        accountHolderType: 'business',
        country: 'US',
      },
    })).rejects.toMatchObject({
      code: 'mock_disabled',
      statusCode: 409,
    });
  });
});
