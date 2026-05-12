import { EconomyEngineService } from '../src/api/services/economy-engine.service';

describe('EconomyEngineService', () => {
  it('uses the official traditional provider baseline and actual effective cost', () => {
    const savings = EconomyEngineService.calculateForOperation({
      grossAmount: 5000,
      actualFee: 37,
    });

    expect(savings.estimatedTraditionalFee).toBe(225);
    expect(savings.actualFee).toBe(37);
    expect(savings.estimatedSavings).toBe(188);
    expect(savings.comparisonMethod).toBe('traditional_providers_average_4_5pct');
  });

  it('captures implicit FX spread when a mid-market rate is available', () => {
    const effectiveCost = EconomyEngineService.effectiveCostFromQuote({
      grossAmountBrl: 5000,
      platformFeeBrl: 15,
      networkFeeBrl: 0.5,
      quote: {
        sourceAmount: '5000',
        sourceAsset: { code: 'BRL' },
        destinationAmount: String(5000 / 5.62 - 10),
        destinationAsset: { code: 'USDC' },
        midMarketRate: 5.62,
      },
    });

    expect(effectiveCost).toBeCloseTo(71.7, 1);
  });
});
