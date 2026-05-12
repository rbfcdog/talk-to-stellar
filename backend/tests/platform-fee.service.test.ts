import { PlatformFeeService } from '../src/api/services/platform-fee.service';

describe('PlatformFeeService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY =
      'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5';
    process.env.TALKTOSTELLAR_SPREAD_BPS = '35';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('deducts spread from strict-send source amount', () => {
    const fee = PlatformFeeService.calculateSpread({
      sourceAmount: '500',
      sourceAssetCode: 'BRL',
      mode: 'deduct_from_source',
    });

    expect(fee.enabled).toBe(true);
    expect(fee.feeAmount).toBe('1.75');
    expect(fee.grossSourceAmount).toBe('500');
    expect(fee.netSourceAmount).toBe('498.25');
    expect(fee.feeAssetCode).toBe('BRL');
  });

  it('uses 0.30% spread by default', () => {
    delete process.env.TALKTOSTELLAR_SPREAD_BPS;

    const fee = PlatformFeeService.calculateSpread({
      sourceAmount: '1000',
      sourceAssetCode: 'BRL',
      mode: 'deduct_from_source',
    });

    expect(fee.feeBps).toBe(30);
    expect(fee.feeAmount).toBe('3');
    expect(fee.netSourceAmount).toBe('997');
  });

  it('adds spread on top for strict-receive path payments', () => {
    const fee = PlatformFeeService.calculateSpread({
      sourceAmount: '100',
      sourceAssetCode: 'USDC',
      mode: 'add_on_top',
    });

    expect(fee.enabled).toBe(true);
    expect(fee.feeAmount).toBe('0.35');
    expect(fee.grossSourceAmount).toBe('100.35');
    expect(fee.netSourceAmount).toBe('100');
  });
});
