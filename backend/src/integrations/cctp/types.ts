export type CctpSourceChain = 'ethereum' | 'base' | 'solana' | 'avalanche' | 'polygon';

export const CCTP_DOMAIN_IDS: Record<CctpSourceChain, number> = {
  ethereum: 0,
  avalanche: 1,
  solana: 5,
  base: 6,
  polygon: 7,
};

export const STELLAR_DOMAIN_ID = 4;

export interface CctpTransferStatus {
  sourceTxHash: string;
  sourceChain: CctpSourceChain;
  status: 'pending' | 'attested' | 'complete' | 'unknown';
  attestation?: string;
  message?: string;
  canMint: boolean;
  error?: string;
}

export interface CctpChainInfo {
  chain: CctpSourceChain;
  domainId: number;
  contractAddress: string;  // CCTP MessageTransmitter contract on that chain
  explorerUrl: string;
  instructions: string;
}
