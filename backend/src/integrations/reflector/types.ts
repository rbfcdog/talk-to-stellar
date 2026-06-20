export interface AssetPrice {
  asset: string;
  price: number;       // in USD
  priceStr: string;    // formatted string
  timestamp: number;   // unix ms
  source: 'reflector' | 'horizon_fallback' | 'cache';
  age_seconds: number;
}

export interface PriceMap {
  [asset: string]: AssetPrice;
}
