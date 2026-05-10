const mockSetAlertThreshold = jest.fn().mockResolvedValue(true);
const mockGetWalletConversionRules = jest.fn().mockResolvedValue([
  {
    id: 'rule-123',
    from_asset_code: 'XLM',
    to_asset_code: 'USDC',
    min_amount: 10,
    trigger_type: 'on_receive',
    enabled: true,
  },
]);
const mockDisableConversionRule = jest.fn().mockResolvedValue(true);

jest.mock('../src/api/services/balance-alert.service', () => ({
  BalanceAlertService: {
    setAlertThreshold: mockSetAlertThreshold,
  },
}));

jest.mock('../src/api/services/auto-conversion.service', () => ({
  AutoConversionService: {
    getWalletConversionRules: mockGetWalletConversionRules,
    disableConversionRule: mockDisableConversionRule,
  },
}));

describe('Agent tool execution', () => {
  let executeTool: (toolName: string, toolInput: Record<string, any>) => Promise<string>;

  beforeAll(() => {
    ({ executeTool } = require('../src/agent/tools'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('executes set_alert_threshold with mock data', async () => {
    const output = await executeTool('set_alert_threshold', {
      wallet_id: 42,
      threshold_usdc: 7.5,
    });

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.wallet_id).toBe(42);
    expect(parsed.threshold_usdc).toBe(7.5);
    expect(mockSetAlertThreshold).toHaveBeenCalledWith(42, 7.5);
  });

  it('executes get_conversion_rules with mock data', async () => {
    const output = await executeTool('get_conversion_rules', {
      wallet_id: 42,
    });

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.rules).toHaveLength(1);
    expect(parsed.rules[0]).toMatchObject({
      id: 'rule-123',
      from_asset: 'XLM',
      to_asset: 'USDC',
      min_amount: 10,
      trigger: 'on_receive',
      enabled: true,
    });
    expect(mockGetWalletConversionRules).toHaveBeenCalledWith(42);
  });

  it('executes disable_conversion_rule with mock data', async () => {
    const output = await executeTool('disable_conversion_rule', {
      rule_id: 'rule-123',
    });

    const parsed = JSON.parse(output);

    expect(parsed.success).toBe(true);
    expect(parsed.rule_id).toBe('rule-123');
    expect(mockDisableConversionRule).toHaveBeenCalledWith('rule-123');
  });
});
