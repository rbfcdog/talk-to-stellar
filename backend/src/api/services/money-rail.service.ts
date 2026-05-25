import {
  ETHERFUSE_TESOURO_ISSUER,
  getAssetIssuer,
  normalizeAssetCode,
} from '../../config/assets';

export type FiatCurrency = 'BRL' | 'USD';
export type MoneyRail = 'PIX' | 'STELLAR' | 'INTERNAL_LEDGER';

export type FiatBalance = {
  currency: FiatCurrency;
  amount: string;
  rail: MoneyRail;
  provider?: string;
  status?: 'available' | 'pending' | 'settling';
};

export type VirtualAsset = {
  code: FiatCurrency;
  kind: 'fiat-abstraction';
  rail: 'PIX' | 'INTERNAL_LEDGER';
};

export type SettlementAsset = {
  code: string;
  issuer?: string;
  rail: 'STELLAR';
  temporary: boolean;
};

export type SettlementRoute = {
  publicCurrency: FiatCurrency;
  publicAsset: VirtualAsset;
  settlementAsset?: SettlementAsset;
  settlementMode: 'off_chain_ledger' | 'stellar_asset';
};

export function isFiatCurrency(value: unknown): value is FiatCurrency {
  const code = normalizeAssetCode(value);
  return code === 'BRL' || code === 'USD';
}

export function isVirtualFiatAsset(asset: { code?: unknown; issuer?: unknown } | null | undefined): boolean {
  if (!asset) return false;
  const code = normalizeAssetCode(asset.code);
  return (code === 'BRL' || code === 'USD') && !String(asset.issuer || '').trim();
}

export function createFiatBalance(input: {
  currency: FiatCurrency;
  amount: string;
  rail?: MoneyRail;
  provider?: string;
  status?: FiatBalance['status'];
}): FiatBalance {
  return {
    currency: input.currency,
    amount: input.amount,
    rail: input.rail || 'INTERNAL_LEDGER',
    provider: input.provider,
    status: input.status || 'available',
  };
}

export function resolveBrlSettlementRoute(): SettlementRoute {
  const issuer = getAssetIssuer('TESOURO') || ETHERFUSE_TESOURO_ISSUER;
  return {
    publicCurrency: 'BRL',
    publicAsset: {
      code: 'BRL',
      kind: 'fiat-abstraction',
      rail: 'PIX',
    },
    settlementAsset: {
      code: 'TESOURO',
      issuer,
      rail: 'STELLAR',
      temporary: false,
    },
    settlementMode: 'stellar_asset',
  };
}

export function resolveMoneyRailForCurrency(currency: FiatCurrency): SettlementRoute {
  if (currency === 'BRL') return resolveBrlSettlementRoute();
  return {
    publicCurrency: currency,
    publicAsset: {
      code: currency,
      kind: 'fiat-abstraction',
      rail: 'INTERNAL_LEDGER',
    },
    settlementMode: 'off_chain_ledger',
  };
}
