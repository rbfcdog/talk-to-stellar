import { formatCustomerAssetAmount } from '../src/utils/fee-display';

describe('customer amount display', () => {
  it('caps asset quantities at two decimal places without rounding up', () => {
    expect(formatCustomerAssetAmount('15.3254281', 'XLM')).toBe('15.32 XLM');
    expect(formatCustomerAssetAmount('1539.9100000', 'CETES')).toBe('1539.91 CETES');
    expect(formatCustomerAssetAmount('62.519', 'BRL')).toBe('R$ 62.51');
  });

  it('always includes two decimal places for customer-visible amounts', () => {
    expect(formatCustomerAssetAmount('10', 'USDC')).toBe('US$ 10.00');
    expect(formatCustomerAssetAmount('100', 'XLM')).toBe('100.00 XLM');
  });
});
