export interface SwapToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  network: string;
}

export interface SwapQuoteInput {
  assetIn: string;     // token symbol like 'USDC', 'XLM', or contract address
  assetOut: string;
  amount: string;      // human-readable amount like "10.5"
  tradeType?: 'EXACT_IN' | 'EXACT_OUT';
  senderAddress?: string; // optional for quote, required for build
}

export interface SwapQuoteResult {
  assetIn: string;
  assetOut: string;
  amountIn: string;
  amountOut: string;
  amountInStroops: string;
  amountOutStroops: string;
  priceImpact: number;
  protocols: string[];
  route: any;
  rawQuote: any; // full API response, passed to build step
  source?: string;
  buildAvailable?: boolean;
  warning?: string;
  network?: string;
  networkPassphrase?: string;
}

export interface SwapBuildInput {
  quote: SwapQuoteResult;
  senderAddress: string;
  slippageBps?: number;
}

export interface SwapBuildResult {
  xdr: string;
  quote: SwapQuoteResult;
  network: string;
  networkPassphrase: string;
}

export interface SwapSendResult {
  hash: string;
  ledger?: number;
  successful: boolean;
  network: string;
  networkPassphrase: string;
  envelopeXdr?: string;
  resultXdr?: string;
}
