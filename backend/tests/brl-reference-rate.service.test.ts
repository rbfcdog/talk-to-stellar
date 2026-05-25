jest.mock('../src/config/stellar', () => ({
  server: {
    strictSendPaths: jest.fn(),
  },
}));

import { Asset } from '@stellar/stellar-sdk';
import { server } from '../src/config/stellar';
import { BrlReferenceRateService } from '../src/api/services/brl-reference-rate.service';

const strictSendPathsMock = server.strictSendPaths as jest.Mock;

describe('BrlReferenceRateService', () => {
  const originalEnv = { ...process.env };
  const usdcIssuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
  const tesouroIssuer = 'GCGI6NT5KO6BH5FGPIKPZWDKTEL7XQJQLMT7NIH22P7CVXGTKJV2P3KF';

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.USDC_ISSUER = usdcIssuer;
    process.env.TESOURO_ISSUER = tesouroIssuer;
    process.env.BRL_USDC_REFERENCE_SAMPLE_USDC = '100';
    strictSendPathsMock.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('quotes the BRL reference from the configured TESOURO asset, not an external USD/BRL fallback', async () => {
    strictSendPathsMock.mockReturnValue({
      call: jest.fn().mockResolvedValue({
        records: [{ destination_amount: '520.0000000', path: [] }],
      }),
    });

    const quote = await BrlReferenceRateService.getReferenceRate();
    const [sourceAsset, sourceAmount, destinationAssets] = strictSendPathsMock.mock.calls[0] as [Asset, string, Asset[]];

    expect(sourceAsset.getCode()).toBe('USDC');
    expect(sourceAsset.getIssuer()).toBe(usdcIssuer);
    expect(sourceAmount).toBe('100.0000000');
    expect(destinationAssets[0].getCode()).toBe('TESOURO');
    expect(destinationAssets[0].getIssuer()).toBe(tesouroIssuer);
    expect(quote.brlPerUsdc).toBe('5.20000000');
    expect(quote.usdcPerBrl).toBe('0.19230769');
    expect(quote.source).toBe('configured_tesouro_asset');
  });

  it('keeps USDC -> BRL and BRL -> USDC conversions aligned to the same on-chain reference', async () => {
    const rate = 5.13;
    strictSendPathsMock.mockImplementation((sourceAsset: Asset, sourceAmount: string) => ({
      call: jest.fn().mockResolvedValue({
        records: [{
          destination_amount: sourceAsset.getCode() === 'USDC'
            ? (Number(sourceAmount) * rate).toFixed(7)
            : (Number(sourceAmount) / rate).toFixed(7),
          path: [],
        }],
      }),
    }));

    const offChainOut = await BrlReferenceRateService.quoteUsdcToBrl('1000');
    const insideConversionOut = await BrlReferenceRateService.quoteBrlToUsdc(offChainOut.destinationAmount);

    expect(Number(offChainOut.destinationAmount)).toBeCloseTo(5130, 6);
    expect(Number(insideConversionOut.destinationAmount)).toBeCloseTo(1000, 4);
    expect(Number(offChainOut.brlPerUsdc)).toBeCloseTo(Number(insideConversionOut.brlPerUsdc), 8);
  });

  it('rejects paths that do not use configured trusted issuers', async () => {
    strictSendPathsMock.mockReturnValue({
      call: jest.fn().mockResolvedValue({
        records: [{
          destination_amount: '560.0000000',
          path: [{
            asset_type: 'credit_alphanum4',
            asset_code: 'BRL',
            asset_issuer: 'GDYAZKZBGC2NNI2FYVPJW5FNAGKUVJIIB3WO3JZFCGURG6TDU3JZNLTQ',
          }],
        }],
      }),
    });

    await expect(BrlReferenceRateService.getReferenceRate()).rejects.toThrow(/trusted on-chain BRL\/USDC path/);
  });

  it('rejects configured on-chain BRL prices that are outside the safe fiat range', async () => {
    strictSendPathsMock.mockReturnValue({
      call: jest.fn().mockResolvedValue({
        records: [{ destination_amount: '119.0600000', path: [] }],
      }),
    });

    await expect(BrlReferenceRateService.getReferenceRate()).rejects.toThrow(/fora da faixa segura/);
  });
});
