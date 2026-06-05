describe('EconomyEngineService', () => {
  const originalTraditionalFeePct = process.env.TRADITIONAL_FEE_PCT;

  afterEach(() => {
    if (originalTraditionalFeePct === undefined) {
      delete process.env.TRADITIONAL_FEE_PCT;
    } else {
      process.env.TRADITIONAL_FEE_PCT = originalTraditionalFeePct;
    }
    jest.resetModules();
  });

  function loadEconomyEngineService() {
    delete process.env.TRADITIONAL_FEE_PCT;
    jest.resetModules();
    return require('../src/api/services/economy-engine.service').EconomyEngineService as typeof import('../src/api/services/economy-engine.service').EconomyEngineService;
  }

  it('uses the product comparison baseline and actual effective cost', () => {
    const EconomyEngineService = loadEconomyEngineService();
    const savings = EconomyEngineService.calculateForOperation({
      grossAmount: 5000,
      actualFee: 37,
    });

    expect(savings.estimatedTraditionalFee).toBe(62.5);
    expect(savings.actualFee).toBe(37);
    expect(savings.estimatedSavings).toBe(25.5);
    expect(savings.comparisonMethod).toBe('traditional_providers_average_1_25pct');
  });

  it('captures implicit FX spread when a mid-market rate is available', () => {
    const EconomyEngineService = loadEconomyEngineService();
    const effectiveCost = EconomyEngineService.effectiveCostFromQuote({
      grossAmountBrl: 5000,
      platformFeeBrl: 15,
      networkFeeBrl: 0.5,
      quote: {
        sourceAmount: '5000',
        sourceAsset: { code: 'TESOURO' },
        destinationAmount: String(5000 / 5.62 - 10),
        destinationAsset: { code: 'USDC' },
        midMarketRate: 5.62,
      },
    });

    expect(effectiveCost).toBeCloseTo(71.7, 1);
  });
});
