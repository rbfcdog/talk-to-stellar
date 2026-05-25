import {
  createFiatBalance,
  isVirtualFiatAsset,
  resolveBrlSettlementRoute,
  resolveMoneyRailForCurrency,
} from '../src/api/services/money-rail.service';

describe('money rail service', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('models BRL as a fiat abstraction without a Stellar issuer', () => {
    expect(isVirtualFiatAsset({ code: 'BRL' })).toBe(true);
    expect(isVirtualFiatAsset({ code: 'BRL', issuer: 'GBRLISSUER' })).toBe(false);
  });

  it('keeps BRL balance in the fiat ledger domain', () => {
    expect(createFiatBalance({ currency: 'BRL', amount: '10.00', rail: 'PIX' })).toEqual({
      currency: 'BRL',
      amount: '10.00',
      rail: 'PIX',
      provider: undefined,
      status: 'available',
    });
  });

  it('maps BRL settlement to TESOURO on Stellar', () => {
    process.env.TESOURO_ISSUER = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';

    const route = resolveBrlSettlementRoute();

    expect(route.publicAsset).toEqual({
      code: 'BRL',
      kind: 'fiat-abstraction',
      rail: 'PIX',
    });
    expect(route.settlementAsset).toEqual({
      code: 'TESOURO',
      issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
      rail: 'STELLAR',
      temporary: false,
    });
    expect(route.settlementMode).toBe('stellar_asset');
  });

  it('uses off-chain ledger mode for fiat currencies without an explicit settlement bridge', () => {
    expect(resolveMoneyRailForCurrency('USD')).toEqual({
      publicCurrency: 'USD',
      publicAsset: {
        code: 'USD',
        kind: 'fiat-abstraction',
        rail: 'INTERNAL_LEDGER',
      },
      settlementMode: 'off_chain_ledger',
    });
  });
});
