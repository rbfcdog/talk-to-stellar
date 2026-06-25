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

import { Networks, TransactionBuilder, rpc as SorobanRpc, xdr, BASE_FEE, StrKey } from '@stellar/stellar-sdk';
import { BackstopConfig, PoolV2, PoolContractV2, RequestType } from '@blend-capital/blend-sdk';
import { stellarConfig } from '../../config/stellar';
import { logger } from '../../utils/logger';

// ── Network config ─────────────────────────────────────────────────────────
const NETWORKS = {
  mainnet: {
    rpc: process.env.BLEND_MAINNET_RPC || 'https://mainnet.sorobanrpc.com',
    passphrase: Networks.PUBLIC,
    pool: process.env.BLEND_MAINNET_POOL || '',
    backstop: process.env.BLEND_MAINNET_BACKSTOP_V2 || 'CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7',
    label: 'mainnet',
  },
  testnet: {
    rpc: process.env.BLEND_TESTNET_RPC || 'https://soroban-testnet.stellar.org',
    passphrase: Networks.TESTNET,
    pool: process.env.BLEND_TESTNET_POOL || 'CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF',
    backstop: process.env.BLEND_TESTNET_BACKSTOP_V2 || 'CBDVWXT433PRVTUNM56C3JREF3HIZHRBA64NB2C3B2UNCKIS65ZYCLZA',
    label: 'testnet',
  },
} as const;

type NetKey = 'mainnet' | 'testnet';
type NetConfig = (typeof NETWORKS)[NetKey];

/** JSON.stringify that won't crash on BigInt values (Soroban sim results carry them). */
function stringifyWithBigInt(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return String(value);
  }
}

function resolveNet(network?: string): NetConfig {
  if (network === 'mainnet' || network === 'public') return NETWORKS.mainnet;
  if (network === 'testnet') return NETWORKS.testnet;
  return stellarConfig.networkName === 'PUBLIC' ? NETWORKS.mainnet : NETWORKS.testnet;
}

function getRpcServer(net: NetConfig) {
  return new SorobanRpc.Server(net.rpc, { allowHttp: net.rpc.startsWith('http://') });
}

// ── APY cache (1 min TTL) ──────────────────────────────────────────────────
interface PoolCache {
  data: PoolInfoResult;
  ts: number;
}
interface PoolIdCache {
  poolId: string;
  ts: number;
}
const CACHE_TTL = 60_000;
const poolCache: Record<string, PoolCache> = {};
const poolIdCache: Record<string, PoolIdCache> = {};

// ── Types ──────────────────────────────────────────────────────────────────
export interface ReserveInfo {
  assetId: string;
  symbol?: string;       // best-effort human label (USDC / XLM) from known asset hints
  supplyApy: number;
  borrowApy: number;
  // Stringified token amounts — bigint can't be JSON-serialized in API responses.
  supplied: string;
  liabilities: string;
  utilization: number;
}

export interface PoolInfoResult {
  poolId: string;
  network: string;
  poolSource?: 'configured' | 'reward_zone';
  backstopId?: string;
  reserves: ReserveInfo[];
  usdc?: ReserveInfo;
  xlm?: ReserveInfo;
  timestamp: number;
}

// known asset IDs used as hints for identifying USDC/XLM reserves
const USDC_HINTS = [
  'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75', // mainnet Circle USDC SAC
  'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU', // current Blend testnet USDC
  'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA', // testnet USDC
  'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F', // alt testnet USDC
];
const XLM_HINTS = [
  'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA', // mainnet XLM SAC
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', // testnet XLM SAC
];

function findReserveByHints(reserves: ReserveInfo[], hints: string[]) {
  for (const hint of hints) {
    const r = reserves.find((res) => res.assetId.toUpperCase() === hint.toUpperCase());
    if (r) return r;
  }
  return undefined;
}

// Best-effort human label for a reserve's contract assetId.
function symbolForAssetId(assetId: string): string | undefined {
  const up = String(assetId || '').toUpperCase();
  if (USDC_HINTS.some((h) => h.toUpperCase() === up)) return 'USDC';
  if (XLM_HINTS.some((h) => h.toUpperCase() === up)) return 'XLM';
  return undefined;
}

function validContractId(value: unknown): string {
  const contractId = String(value || '').trim();
  return contractId && StrKey.isValidContract(contractId) ? contractId : '';
}

async function resolvePoolId(net: NetConfig): Promise<{ poolId: string; source: 'configured' | 'reward_zone' }> {
  const configured = String(net.pool || '').trim();
  const validConfigured = validContractId(configured);
  if (validConfigured) {
    return { poolId: validConfigured, source: 'configured' };
  }
  if (configured) {
    logger.warn(`[blend] ignoring invalid ${net.label} pool id: ${configured}`);
  }

  const cacheKey = `${net.label}:pool-id`;
  const now = Date.now();
  if (poolIdCache[cacheKey] && now - poolIdCache[cacheKey].ts < CACHE_TTL) {
    return { poolId: poolIdCache[cacheKey].poolId, source: 'reward_zone' };
  }

  const backstopId = validContractId(net.backstop);
  if (!backstopId) {
    throw new Error(`Invalid Blend ${net.label} backstop contract id`);
  }

  const config = await BackstopConfig.load({ rpc: net.rpc, passphrase: net.passphrase }, backstopId);
  const poolId = config.rewardZone.find((id) => StrKey.isValidContract(id));
  if (!poolId) {
    throw new Error(`Blend ${net.label} backstop reward zone has no valid pool`);
  }

  poolIdCache[cacheKey] = { poolId, ts: now };
  return { poolId, source: 'reward_zone' };
}

// ── Core Service ───────────────────────────────────────────────────────────
export const BlendService = {
  // Legacy list helpers (kept for existing routes)
  async listPools() {
    const pools = [NETWORKS.mainnet, NETWORKS.testnet];
    return Promise.all(
      pools.map(async (p) => {
        let contract = validContractId(p.pool);
        let poolSource = contract ? 'configured' : 'unavailable';
        try {
          const resolved = await resolvePoolId(p);
          contract = resolved.poolId;
          poolSource = resolved.source;
        } catch (error: any) {
          logger.warn(`[blend] ${p.label} pool discovery failed: ${error.message}`);
        }
        return {
          id: p.label,
          name: `Blend Stellar Pool (${p.label})`,
          contract,
          assets: ['USDC', 'XLM'],
          network: p.label,
          poolSource,
          explorer: contract ? `https://stellar.expert/explorer/${p.label}/contract/${contract}` : null,
        };
      }),
    );
  },

  async getPool(poolId: string) {
    const all = await BlendService.listPools();
    const pool = all.find((p) => p.id === poolId || p.contract === poolId);
    if (!pool) throw new Error(`Pool not found: ${poolId}`);
    return pool;
  },

  getPoolAddresses() {
    return [
      { id: 'mainnet', name: 'Blend Stellar Pool (mainnet)', contract: validContractId(NETWORKS.mainnet.pool), backstop: NETWORKS.mainnet.backstop, assets: ['USDC', 'XLM'] },
      { id: 'testnet', name: 'Blend Stellar Pool (testnet)', contract: validContractId(NETWORKS.testnet.pool), backstop: NETWORKS.testnet.backstop, assets: ['USDC', 'XLM'] },
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
    const { poolId, source } = await resolvePoolId(net);
    let pool: PoolV2;

    try {
      pool = await PoolV2.load(blendNet, poolId);
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
        symbol: symbolForAssetId(assetId),
        supplyApy: parseFloat((reserve.estSupplyApy * 100).toFixed(2)),
        borrowApy: parseFloat((reserve.estBorrowApy * 100).toFixed(2)),
        supplied: reserve.data.dSupply?.toString() ?? '0',
        liabilities: reserve.data.bSupply?.toString() ?? '0',
        utilization: parseFloat((reserve.getUtilizationFloat() * 100).toFixed(2)),
      });
    });

    const usdcReserve = findReserveByHints(reserves, USDC_HINTS) || reserves[0];
    const xlmReserve = findReserveByHints(reserves, XLM_HINTS) || reserves.find((reserve) => reserve.assetId !== usdcReserve?.assetId);
    const result: PoolInfoResult = {
      poolId,
      network: net.label,
      poolSource: source,
      backstopId: net.backstop,
      reserves,
      usdc: usdcReserve,
      xlm: xlmReserve,
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
    const { poolId } = await resolvePoolId(net);

    let pool: PoolV2;
    try {
      pool = await PoolV2.load(blendNet, poolId);
    } catch (e: any) {
      if (net.label === 'testnet') {
        return { userAddress, poolId, network: net.label, positions: [], note: 'testnet pool unavailable' };
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

    return { userAddress, poolId, network: net.label, positions };
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
    const { poolId } = await resolvePoolId(net);
    const amountBigInt = BigInt(amount);

    const poolContract = new PoolContractV2(poolId);
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
      const msg = (simResult as any).error || stringifyWithBigInt(simResult);
      throw new Error(`Blend supply simulation failed: ${msg}`);
    }

    const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
    logger.debug(`[blend] supply XDR built — ${amount} of ${assetId.slice(0, 8)}… for ${userAddress.slice(0, 8)}…`);
    return {
      xdr: assembled.toEnvelope().toXDR().toString('base64'),
      networkPassphrase: net.passphrase,
      network: net.label,
      poolId,
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
    const { poolId } = await resolvePoolId(net);
    const amountBigInt = BigInt(amount);

    const poolContract = new PoolContractV2(poolId);
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
      const msg = (simResult as any).error || stringifyWithBigInt(simResult);
      throw new Error(`Blend withdraw simulation failed: ${msg}`);
    }

    const assembled = SorobanRpc.assembleTransaction(tx, simResult).build();
    logger.debug(`[blend] withdraw XDR built — ${amount} of ${assetId.slice(0, 8)}… for ${userAddress.slice(0, 8)}…`);
    return {
      xdr: assembled.toEnvelope().toXDR().toString('base64'),
      networkPassphrase: net.passphrase,
      network: net.label,
      poolId,
      assetId,
      amountRaw: amount,
    };
  },

  // ── Submit a signed Blend transaction on the given network ───────────────
  async submitSignedXdr(signedXdr: string, network?: string): Promise<{ hash: string; status: string }> {
    const net = resolveNet(network);
    const rpc = getRpcServer(net);
    const tx = TransactionBuilder.fromXDR(signedXdr, net.passphrase);
    const send = await rpc.sendTransaction(tx);
    if (send.status === 'ERROR') {
      throw new Error(`Blend submit failed: ${stringifyWithBigInt((send as any).errorResult ?? send)}`);
    }
    const hash = send.hash;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await rpc.getTransaction(hash);
      if (res.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return { hash, status: 'SUCCESS' };
      if (res.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Blend tx failed: ${stringifyWithBigInt(res)}`);
      }
    }
    return { hash, status: 'PENDING' };
  },
};
