export type AbroadBlockchain = 'STELLAR' | 'SOLANA' | 'CELO';
export type AbroadCrypto = 'USDC' | 'USDT';
export type AbroadFiat = 'BRL' | 'COP';
export type AbroadPaymentMethod = 'PIX' | 'PSE';

export interface AbroadCorridor {
  blockchain: AbroadBlockchain;
  chainFamily: string;
  chainId: string;
  cryptoCurrency: AbroadCrypto;
  maxAmount: number | null;
  minAmount: number;
  paymentMethod: AbroadPaymentMethod;
  targetCurrency: AbroadFiat;
}

export interface StellarCorridor extends AbroadCorridor {
  blockchain: 'STELLAR';
}

export interface AbroadQuote {
  inputAmount: number;
  outputAmount: number;
  exchangeRate: number;
  fee: number;
  feePercent: number;
  cryptoCurrency: AbroadCrypto;
  fiatCurrency: AbroadFiat;
  blockchain: AbroadBlockchain;
  expiresAt?: string;
}

export interface DecodedPixQr {
  pixKey?: string;
  recipientName?: string;
  amount?: number;
  merchantName?: string;
  city?: string;
  description?: string;
  rawData: any;
}
