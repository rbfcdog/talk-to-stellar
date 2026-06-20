export interface AquaMarketKey {
  asset1_code: string;
  asset1_issuer: string;
  asset2_code: string;
  asset2_issuer: string;
}

export interface AquaPoolReward {
  market_key: AquaMarketKey;
  daily_sdex_reward: number;
  daily_amm_reward: number;
  daily_total_reward: number;
  last_updated: string;
}

export interface AquaRewardsPage {
  count: number;
  results: AquaPoolReward[];
}

export interface PoolRewardSummary {
  pair: string;
  asset1: string;
  asset2: string;
  dailySdexReward: number;
  dailyAmmReward: number;
  dailyTotalReward: number;
  updatedAt: string;
}

export interface AquaRewardsResponse {
  topPools: PoolRewardSummary[];
  xlmUsdcDailyAqua: number;
  aquaIssuer: string;
  fetchedAt: string;
}
