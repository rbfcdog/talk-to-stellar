export interface CctpConfig {
  network: 'mainnet' | 'testnet';
  attestationApiUrl: string;
  stellarContractAddress: string;
}

export function loadCctpConfig(): CctpConfig {
  const network = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
  const isMainnet = network === 'mainnet' || network === 'public';
  return {
    network: isMainnet ? 'mainnet' : 'testnet',
    attestationApiUrl: isMainnet
      ? 'https://iris-api.circle.com/v2'
      : 'https://iris-api-sandbox.circle.com/v2',
    stellarContractAddress: process.env.CCTP_STELLAR_CONTRACT_ADDRESS || '',
  };
}

// Source chain CCTP contracts (where user calls burn on source chain)
// These are the V2 MessageTransmitter addresses
export const CCTP_SOURCE_CONTRACTS: Record<string, { contractAddress: string; explorerBase: string }> = {
  ethereum: {
    contractAddress: '0x0a992d191DEeC32aFe36203Ad87D7d289a738F81',
    explorerBase: 'https://etherscan.io/tx/',
  },
  base: {
    contractAddress: '0x1682Ae6375C4E4A97e4B583BC394c861A46D8962',
    explorerBase: 'https://basescan.org/tx/',
  },
  solana: {
    contractAddress: 'CCTPiPYPc6AsJuwueEnWgSgucamXDZwBd53dQ11YiKX3',
    explorerBase: 'https://solscan.io/tx/',
  },
};
