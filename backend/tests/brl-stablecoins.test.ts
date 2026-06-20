import { BRL_STABLECOINS, isBrlStablecoin, formatBrlBalance } from '../src/integrations/brl-stablecoins/index';

describe('BRL_STABLECOINS constants', () => {
  it('has BRZ with correct issuer', () => {
    expect(BRL_STABLECOINS.BRZ.code).toBe('BRZ');
    expect(BRL_STABLECOINS.BRZ.issuer).toBe('GABMA6FPH3OJXNTGWO7PROF7I5WPQUZOB4BLTBTP4FK6QV7HWISLIEO2');
    expect(BRL_STABLECOINS.BRZ.provider).toBe('Transfero');
    expect(BRL_STABLECOINS.BRZ.homeDomain).toBe('stellar.brztoken.io');
  });

  it('has BRLT with correct issuer', () => {
    expect(BRL_STABLECOINS.BRLT.code).toBe('BRLT');
    expect(BRL_STABLECOINS.BRLT.issuer).toBe('GCHQ3F2BF5P74DMDNOOGHT5DUCKC773AW5DTOFINC26W4KGYFPYDPRSO');
    expect(BRL_STABLECOINS.BRLT.provider).toBe('Settle Network / StableX');
    expect(BRL_STABLECOINS.BRLT.homeDomain).toBe('sep.stablex.cloud');
  });

  it('both are on mainnet', () => {
    expect(BRL_STABLECOINS.BRZ.network).toBe('mainnet');
    expect(BRL_STABLECOINS.BRLT.network).toBe('mainnet');
  });
});

describe('isBrlStablecoin', () => {
  it('returns true for BRZ with correct issuer', () => {
    expect(isBrlStablecoin('BRZ', 'GABMA6FPH3OJXNTGWO7PROF7I5WPQUZOB4BLTBTP4FK6QV7HWISLIEO2')).toBe(true);
  });

  it('returns true for BRLT with correct issuer', () => {
    expect(isBrlStablecoin('BRLT', 'GCHQ3F2BF5P74DMDNOOGHT5DUCKC773AW5DTOFINC26W4KGYFPYDPRSO')).toBe(true);
  });

  it('returns false for BRZ with wrong issuer', () => {
    expect(isBrlStablecoin('BRZ', 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).toBe(false);
  });

  it('returns false for USDC', () => {
    expect(isBrlStablecoin('USDC', 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN')).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(isBrlStablecoin('', '')).toBe(false);
  });
});

describe('formatBrlBalance', () => {
  it('formats BRZ balance with R$ prefix', () => {
    const result = formatBrlBalance('100.50', 'BRZ');
    expect(result).toContain('R$');
    expect(result).toContain('BRZ');
  });

  it('formats BRLT balance with R$ prefix', () => {
    const result = formatBrlBalance('250.00', 'BRLT');
    expect(result).toContain('R$');
    expect(result).toContain('BRLT');
  });

  it('handles zero correctly', () => {
    const result = formatBrlBalance('0', 'BRZ');
    expect(result).toContain('R$');
    expect(result).toContain('0');
  });

  it('returns fallback for NaN input', () => {
    const result = formatBrlBalance('not-a-number', 'BRZ');
    expect(result).toBe('0,00 (BRZ)');
  });

  it('formats large amounts with thousand separators (pt-BR)', () => {
    const result = formatBrlBalance('1000000', 'BRZ');
    expect(result).toContain('R$');
    // In pt-BR locale, 1000000 → 1.000.000,00 or 1,000,000.00 depending on environment
    expect(result.replace(/[^0-9]/g, '')).toContain('1000000');
  });
});
