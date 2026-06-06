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

  it('counts persisted savings events when a payment log with the same hash has no savings values yet', async () => {
    const EconomyEngineService = loadEconomyEngineService();
    const { supabase } = require('../src/config/supabase');
    const fromMock = supabase.from as jest.Mock;
    const originalFrom = fromMock.getMockImplementation();

    const builder = (data: any[], extra: Record<string, any> = {}) => {
      const query: any = {};
      ['select', 'eq', 'gte', 'order', 'limit'].forEach((method) => {
        query[method] = jest.fn(() => query);
      });
      query.maybeSingle = jest.fn(async () => ({ data: extra.single || null, error: null }));
      query.then = (resolve: any, reject: any) => Promise.resolve({ data, error: null }).then(resolve, reject);
      return query;
    };

    fromMock.mockImplementation((table: string) => {
      if (table === 'agent_sessions') {
        return builder([], {
          single: {
            session_id: 'session-savings',
            user_id: 'user-savings',
            public_key: 'GTEST',
          },
        });
      }
      if (table === 'payment_logs') {
        return builder([{
          payment_hash: 'tx-savings',
          source_amount: '450.09',
          source_asset_code: 'BRL',
          metadata: {},
          completed_at: '2026-06-05T21:23:55.000Z',
          status: 'success',
          estimated_savings: null,
          actual_fee: null,
          estimated_traditional_fee: null,
        }]);
      }
      if (table === 'financial_events') {
        return builder([{
          amount: 18.01,
          currency: 'BRL',
          created_at: '2026-06-05T21:23:55.000Z',
          dedupe_key: 'user-savings:receipt_savings:test',
          metadata_json: {
            payment_hash: 'tx-savings',
            gross_amount_brl: 450.09,
            estimated_traditional_fee: 20.25,
            actual_fee: 2.24,
            estimated_savings: 18.01,
            savings_percentage: 88.94,
          },
        }]);
      }
      if (table === 'operations') {
        return builder([]);
      }
      if (table === 'audit_events') {
        const query: any = {};
        query.insert = jest.fn(async () => ({ data: null, error: null }));
        return query;
      }
      return originalFrom ? originalFrom(table) : builder([]);
    });

    try {
      const identity = await EconomyEngineService.calculateIdentity({
        sessionId: 'session-savings',
        userId: 'user-savings',
        period: 'lifetime',
      });

      expect(identity.estimatedSavings).toBeCloseTo(18.01, 2);
      expect(identity.estimatedTraditionalFee).toBeCloseTo(20.25, 2);
      expect(identity.actualFee).toBeCloseTo(2.24, 2);
      expect(identity.operationCount).toBe(1);
    } finally {
      fromMock.mockImplementation(originalFrom as any);
    }
  });
});
