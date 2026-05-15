import { normalizeHumanAmountText, parseHumanAmountNumber } from '../src/utils/amount';

describe('amount utils', () => {
  it('parses pt-BR thousand separators from chat and PIX URLs', () => {
    expect(normalizeHumanAmountText('10.000')).toBe('10000');
    expect(normalizeHumanAmountText('1.234.567,89')).toBe('1234567.89');
    expect(parseHumanAmountNumber('10.000 USDC')).toBe(10000);
  });

  it('keeps Stellar decimal precision amounts as decimals', () => {
    expect(normalizeHumanAmountText('10.0000000')).toBe('10.0000000');
    expect(parseHumanAmountNumber('0.001')).toBe(0.001);
  });
});
