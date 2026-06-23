/**
 * Blend v2 — DeFi Lending Protocol on Stellar/Soroban
 *
 * Users supply USDC to earn variable APY from borrower interest.
 * All complexity is invisible — user just sees "seu dinheiro está rendendo".
 *
 * Mainnet pools (real liquidity):
 *   Stellar Pool: CBLLNN4MFMABJBA6O7DFEBZJBXJLBTJEKUZHLBAJ7U2KHTM4HFMVNKVT
 *   Orbit Pool:   CAUIKL3IYGMERDRUN5YVVYBV3BKEC7XKJMIDBJZZWIOEBSAWIL26YJEX
 *
 * Contract interaction:
 *   1. PoolV2.load() → read APY from on-chain reserve data
 *   2. pool.loadUser() → read user supply positions
 *   3. PoolContractV2.submit() → build supply/withdraw operation
 *   4. rpc.simulateTransaction() → populate SorobanData
 *   5. rpc.assembleTransaction() → ready for signing
 */

import { Networks, TransactionBuilder, rpc as SorobanRpc, xdr, BASE_FEE } from '@stellar/stellar-sdk';
import { PoolV2, PoolContractV2, RequestType } from '@blend-capital/blend-sdk';
import { stellarConfig } from '../../config/stellar';
import { logger } from '../../utils/logger';

// ── Network config ─────────────────────────────────────────────────────────
const NETWORKS = {
  mainnet: {
    rpc: process.env.BLEND_MAINNET_RPC || 'https://mainnet.sorobanrpc.com',
    passphrase: Networks.PUBLIC,
    pool: 'CBLLNN4MFMABJBA6O7DFEBZJBXJLBTJEKUZHLBAJ7U2KHTM4HFMVNKVT',
    label: 'mainnet',
  },
  testnet: {
    rpc: process.env.BLEND_TESTNET_RPC || 'https://soroban-testnet.stellar.org',
    passphrase: Networks.TESTNET,
    // Blend testnet pool — if unavailable, service falls back to mainnet APY data
    pool: process.env.BLEND_TESTNET_POOL || 'CAQFFD3ZNXB5LFHBY5SQCNIWAHUBQFMZP25M7FXRGXIHPHNLBM5AXGJ',
    label: 'testnet',
  },
} as const;

type NetKey = 'mainnet' | 'testnet';

function resolveNet(network?: string): (typeof NETWORKS)[NetKey] {
  if (network === 'mainnet' || network === 'public') return NETWORKS.mainnet;
  if (network === 'testnet') return NETWORKS.testnet;
  return stellarConfig.networkName === 'PUBLIC' ? NETWORKS.mainnet : NETWORKS.testnet;
}

function getRpcServer(net: (typeof NETWORKS)[NetKey]) {
  return new SorobanRpc.Server(net.rpc, { allowHttp: net.rpc.startsWith('http://') });
}

// ── APY cache (1 min TTL) ──────────────────────────────────────────────────
interface PoolCache {
  data: PoolInfoResult;
  ts: number;
}
const CACHE_TTL = 60_000;
const poolCache: Record<string, PoolCache> = {};

// ── Types ──────────────────────────────────────────────────────────────────
export interface ReserveInfo {
  assetId: string;
  supplyApy: number;
  borrowApy: number;
  supplied: bigint;
  liabilities: bigint;
  utilization: number;
}

export interface PoolInfoResult {
  poolId: string;
  network: string;
  reserves: ReserveInfo[];
  usdc?: ReserveInfo;
  xlm?: ReserveInfo;
  timestamp: number;
}

// known asset IDs used as hints for identifying USDC/XLM reserves
const USDC_HINTS = [
  'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7EJJUD', // mainnet Circle USDC SAC
  'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', // testnet USDC
  'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F', // alt testnet USDC
];

function findReserveByHints(reserves: ReserveInfo[], hints: string[]) {
  for (const hint of hints) {
    const r = reserves.find((res) => res.assetId.toUpperCase() === hint.toUpperCase());
    if (r) return r;
  }
  return undefined;
}

// ── Core Service ───────────────────────────────────────────────────────────
export const BlendService = {
  // Legacy list helpers (kept for existing routes)
  async listPools() {
    const pools = [NETWORKS.mainnet, NETWORKS.testnet];
    return pools.map((p) => ({
      id: p.label,
      name: `Blend Stellar Pool (${p.label})`,
      contract: p.pool,
      assets: ['USDC', 'XLM'],
      network: p.label,
      explorer: `https://stellar.expert/explorer/${p.label}/contract/${p.pool}`,
    }));
  },

  async getPool(poolId: string) {
    const all = await BlendService.listPools();
    const pool = all.find((p) => p.id === poolId || p.contract === poolId);
    if (!pool) throw new Error(`Pool not found: ${poolId}`);
    return pool;
  },

  getPoolAddresses() {
    return [
      { id: 'mainnet', name: 'Blend Stellar Pool (mainnet)', contract: NETWORKS.mainnet.pool, assets: ['USDC', 'XLM'] },
      { id: 'testnet', name: 'Blend Stellar Pool (testnet)', contract: NETWORKS.testnet.pool, assets: ['USDC', 'XLM'] },
    ];
  },

  // ── New: on-chain pool data ──────────────────────────────────────────────
  async getPoolInfo(network?: string): Promise<PoolInfoResult> {
    const net = resolveNet(network);
    const cacheKey = net.label;
    const now = Date.now();
    if (poolCache[cacheKey] && now - poolCache[cacheKey].ts < CACHE_TTL) {
      return poolCache[cacheKey].data;
    }

    const blendNet = { rpc: net.rpc, passphrase: net.passphrase };
    let pool: PoolV2;

    try {
      pool = await PoolV2.load(blendNet, net.pool);
    } catch (e: any) {
      // If testnet pool isn't deployed, fall back to mainnet data as reference
      if (net.label === 'testnet') {
        logger.warn('[blend] testnet pool unavailable, falling back to mainnet APY reference');
        return BlendService.getPoolInfo('mainnet');
      }
      throw new Error(`Failed to load Blend pool: ${e.message}`);
    }

    const reserves: ReserveInfo[] = [];
    pool.reserves.forEach((reserve, assetId) => {
      reserves.push({
        assetId,
        supplyApy: parseFloat((reserve.estSupplyApy * 100).toFixed(2)),
        borrowApy: parseFloat((reserve.estBorrowApy * 100).toFixed(2)),
        supplied: reserve.data.dSupply,
        liabilities: reserve.data.bSupply,
        utilization: parseFloat((reserve.getUtilizationFloat() * 100).toFixed(2)),
      });
    });

    const result: PoolInfoResult = {
      poolId: net.pool,
      network: net.label,
      reserves,
      usdc: findReserveByHints(reserves, USDC_HINTS) || reserves[0],
      xlm: reserves.length > 1 ? reserves[1] : undefined,
      timestamp: now,
    };

    poolCache[cacheKey] = { data: result, ts: now };
    logger.debug(`[blend] pool info loaded — ${reserves.length} reserves, USDC APY ${result.usdc?.supplyApy ?? 'n/a'}%`);
    return result;
  },

  // ── User position ────────────────────────────────────────────────────────
  async getUserPosition(userAddress: string, network?: string) {
    const net = resolveNet(network);
    const blendNet = { rpc: net.rpc, passphrase: net.passphrase };

    let pool: PoolV2;
    try {
      pool = await PoolV2.load(blendNet, net.pool);
    } catch (e: any) {
      if (net.label === 'testnet') {
        return { userAddress, poolId: net.pool, network: net.label, positions: [], note: 'testnet pool unavailable' };
      }
      throw new Error(`Failed to load Blend pool: ${e.message}`);
    }

    const user = await pool.loadUser(userAddress);
    const positions: Array<{ assetId: string; supply: number; collateral: number; liability: number }> = [];

    pool.reserves.forEach((reserve, assetId) => {
      const supply = user.getSupplyFloat(reserve);
      const collateral = user.getCollateralFloat(reserve);
      const liability = user.getLiabilitiesFloat(reserve);
      positions.push({ assetId, supply, collateral, liability });
    });

    return { userAddress, poolId: net.pool, network: net.label, positions };
  },

  // ── Build supply XDR ─────────────────────────────────────────────────────
  async buildSupplyXdr(params: {
    userAddress: string;
    assetId: string;
    amount: string; // in stroops (7 decimals) as string
    network?: string;
  }) {
    const { userAddress, assetId, amount, network } = params;
    const net = resolveNet(network);
    const amountBigInt = BigInt(amount);

    const poolContract = new PoolContractV2(net.pool);
    const opXdr = poolContract.submit({
      from: userAddress,
      spender: userAddress,
      to: userAddress,
      requests: [{ amount: amountBigInt, request_type: RequestType.Supply, address: assetId }],
    });

    const op = xdr.Operation.fromXDR(opXdr, 'base64');
    const rpc = getRpcServer(net);
    const account = await rpc.getAccount(userAddress);

    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: net.passphrase })
      .addOperation(op)
      .setTimeout(300)
      .build();

    const simResult = await rpc.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(simResult)) {
      const msg = (simResult as any).error || JSON.stringify(simResult);
      throw new Error(`Blend supply simulation failed: ${msg}`);
    }

    const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
    logger.debug(`[blend] supply XDR built — ${amount} of ${assetId.slice(0, 8)}… for ${userAddress.slice(0, 8)}…`);
    return {
      xdr: assembled.toEnvelope().toXDR().toString('base64'),
      networkPassphrase: net.passphrase,
      network: net.label,
      poolId: net.pool,
      assetId,
      amountRaw: amount,
    };
  },

  // ── Build withdraw XDR ───────────────────────────────────────────────────
  async buildWithdrawXdr(params: {
    userAddress: string;
    assetId: string;
    amount: string;
    network?: string;
  }) {
    const { userAddress, assetId, amount, network } = params;
    const net = resolveNet(network);
    const amountBigInt = BigInt(amount);

    const poolContract = new PoolContractV2(net.pool);
    const opXdr = poolContract.submit({
      from: userAddress,
      spender: userAddress,
      to: userAddress,
      requests: [{ amount: amountBigInt, request_type: RequestType.Withdraw, address: assetId }],
    });

    const op = xdr.Operation.fromXDR(opXdr, 'base64');
    const rpc = getRpcServer(net);
    const account = await rpc.getAccount(userAddress);

    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: net.passphrase })
      .addOperation(op)
      .setTimeout(300)
      .build();

    const simResult = await rpc.simulateTransaction(tx);
    if (!SorobanRpc.Api.isSimulationSuccess(simResult)) {
      const msg = (simResult as any).error || JSON.stringify(simResult);
      throw new Error(`Blend withdraw simulation failed: ${msg}`);
    }

    const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
    logger.debug(`[blend] withdraw XDR built — ${amount} of ${assetId.slice(0, 8)}… for ${userAddress.slice(0, 8)}…`);
    return {
      xdr: assembled.toEnvelope().toXDR().toString('base64'),
      networkPassphrase: net.passphrase,
      network: net.label,
      poolId: net.pool,
      assetId,
      amountRaw: amount,
    };
  },
};
