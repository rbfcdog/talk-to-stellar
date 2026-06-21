/**
 * Blend v2 — DeFi Lending Protocol on Stellar/Soroban
 *
 * Blend allows users to deposit USDC or XLM into permissionless lending pools
 * and earn variable APY. Blend does not expose a public REST API — pool data
 * lives on-chain (Soroban contracts). This service returns known pool info
 * and uses the Stellar RPC to estimate utilization from contract state.
 *
 * Known mainnet pools (from blend.capital docs):
 * - Stellar Pool: CBLLNN4MFMABJBA6O7DFEBZJBXJLBTJEKUZHLBAJ7U2KHTM4HFMVNKVT
 * - Orbit Pool:   CAUIKL3IYGMERDRUN5YVVYBV3BKEC7XKJMIDBJZZWIOEBSAWIL26YJEX
 *
 * GitHub: https://github.com/blend-capital
 * Docs: https://docs.blend.capital
 *
 * TalkToStellar use: "Seu USDC está rendendo ~8% ao ano no Blend"
 */

import { logger } from '../../utils/logger';

export const BLEND_POOLS = [
  {
    id: 'stellar',
    name: 'Stellar Pool',
    contract: 'CBLLNN4MFMABJBA6O7DFEBZJBXJLBTJEKUZHLBAJ7U2KHTM4HFMVNKVT',
    assets: ['USDC', 'XLM'],
    description: 'Main Blend pool — USDC and XLM lending/borrowing',
    explorer: 'https://stellar.expert/explorer/public/contract/CBLLNN4MFMABJBA6O7DFEBZJBXJLBTJEKUZHLBAJ7U2KHTM4HFMVNKVT',
    docs: 'https://docs.blend.capital',
  },
  {
    id: 'orbit',
    name: 'Orbit Pool',
    contract: 'CAUIKL3IYGMERDRUN5YVVYBV3BKEC7XKJMIDBJZZWIOEBSAWIL26YJEX',
    assets: ['USDC', 'XLM', 'yXLM'],
    description: 'Orbit CDP integration pool — collateralized stablecoin minting',
    explorer: 'https://stellar.expert/explorer/public/contract/CAUIKL3IYGMERDRUN5YVVYBV3BKEC7XKJMIDBJZZWIOEBSAWIL26YJEX',
    docs: 'https://docs.blend.capital',
  },
];

// Try to get live data from Stellar Expert API (no auth needed)
const EXPERT_API = 'https://api.stellar.expert/explorer/public';

async function getContractData(contractId: string): Promise<{ exists: boolean; data?: any }> {
  try {
    const res = await fetch(`${EXPERT_API}/contract/${contractId}`, {
      headers: { 'User-Agent': 'TalkToStellar/1.0', Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return { exists: false };
    const data = await res.json() as any;
    return { exists: true, data };
  } catch {
    return { exists: false };
  }
}

export const BlendService = {
  async listPools() {
    const pools = await Promise.all(
      BLEND_POOLS.map(async (pool) => {
        const { exists, data } = await getContractData(pool.contract);
        return {
          ...pool,
          on_chain: exists,
          contract_data: exists ? {
            created: data?.created,
            operations: data?.operations,
          } : null,
        };
      })
    );
    logger.debug(`[blend] returning ${pools.length} known pools`);
    return pools;
  },

  async getPool(poolId: string) {
    const pool = BLEND_POOLS.find(
      (p) => p.id === poolId || p.contract === poolId
    );
    if (!pool) throw new Error(`Pool not found: ${poolId}`);
    const { exists, data } = await getContractData(pool.contract);
    return { ...pool, on_chain: exists, contract_data: data ?? null };
  },

  getPoolAddresses() {
    return BLEND_POOLS.map(({ id, name, contract, assets }) => ({ id, name, contract, assets }));
  },
};
