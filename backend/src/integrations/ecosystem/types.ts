export interface WalletBalance {
  asset: string;
  balance: string;
  issuer: string | null;
}

export interface YieldPosition {
  protocol: string;
  vault?: string;
  estimatedApy?: number;
  balance?: string;
  description: string;
}

export interface EcosystemOverview {
  address: string;
  network: string;
  fetchedAt: string;

  // Stellar Network health
  network_stats: {
    latestLedger: number;
    tps: number;
    capacityUsage: number;
    recommendedFeeStoops: number;
    healthy: boolean;
  };

  // On-chain balances
  balances: WalletBalance[];
  usdcBalance: string;
  xlmBalance: string;

  // Current exchange rates
  rates: {
    xlm_usd: number;
    brl_usd: number;
    usdc_usd: number;
  };

  // Portfolio value
  portfolioUsd: number;
  portfolioBrl: number;

  // DeFi opportunities
  defi: {
    aquarius_xlm_usdc_daily_aqua: number;
    top_yield_pools: Array<{
      pair: string;
      dailyAqua: number;
    }>;
    blend_usdc_apy_note: string;
  };

  // BRL stablecoin balances (native BRL layer on Stellar)
  brl_stablecoins: {
    brz_balance: string;
    brlt_balance: string;
    total_brl_usd: number;
  };

  // Abroad Finance — USDC→PIX settlement corridor
  abroad: {
    stellar_usdc_pix_available: boolean;
    min_amount: number;
    max_amount: number | null;
  };

  // Cross-chain
  cctp: {
    supported_source_chains: string[];
    stellar_domain_id: number;
  };

  // Fraud flag (if address was screened)
  fraud_screen?: {
    blocked: boolean;
    tags: string[];
  };
}
