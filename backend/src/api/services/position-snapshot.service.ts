import { supabase } from "../../config/supabase";
import { logger } from "../../utils/logger";
import { DefindexYieldService } from "./defindex-yield.service";
import { DEFINDEX_USDC_VAULT_MAINNET } from "../../integrations/defindex/config";
import { BlendService } from "../../integrations/blend/service";

export type MainnetPosition = { defindexUsdc: number; blendUsdc: number; totalUsdc: number };

/** Read a wallet's live mainnet invested position (DeFindex vault + Blend supply). */
export async function computeMainnetPosition(publicKey: string): Promise<MainnetPosition> {
  const vault = (process.env.DEFINDEX_USDC_VAULT_MAINNET || "").trim() || DEFINDEX_USDC_VAULT_MAINNET;

  let defindexUsdc = 0;
  try {
    const bal: any = await DefindexYieldService.getVaultBalance(vault, publicKey, "mainnet");
    const underlying = bal?.balance?.underlyingBalance ?? bal?.underlyingBalance ?? bal?.balance?.underlying ?? null;
    const raw = Array.isArray(underlying) ? underlying[0] : underlying;
    if (raw != null) defindexUsdc = Number(raw) / 1e7;
  } catch (e: any) {
    logger.warn(`[position-snapshot] defindex fetch failed for ${publicKey}: ${e?.message || e}`);
  }

  let blendUsdc = 0;
  try {
    const pos: any = await BlendService.getUserPosition(publicKey, "mainnet");
    blendUsdc = (pos?.positions || []).reduce((s: number, p: any) => s + (Number(p.supply) || 0), 0);
  } catch (e: any) {
    logger.warn(`[position-snapshot] blend fetch failed for ${publicKey}: ${e?.message || e}`);
  }

  return { defindexUsdc, blendUsdc, totalUsdc: defindexUsdc + blendUsdc };
}

/**
 * Write a FIXED 1-minute snapshot point for a wallet. The point is set on the
 * first write of the minute and never overwritten until the next minute, so the
 * balance chart advances one stable point per minute.
 */
export async function writeMinuteSnapshot(
  publicKey: string,
  email: string | null,
  pos: MainnetPosition,
): Promise<void> {
  try {
    const now = new Date();
    const bucket = new Date(now);
    bucket.setUTCSeconds(0, 0); // floor to the start of the current minute
    const snapshotDate = bucket.toISOString();

    const { data: existing } = await supabase
      .from("bridge_position_snapshots")
      .select("public_key")
      .eq("public_key", publicKey)
      .eq("snapshot_date", snapshotDate)
      .maybeSingle();
    if (existing) return; // this minute is already fixed

    await supabase.from("bridge_position_snapshots").upsert(
      {
        public_key: publicKey,
        email,
        snapshot_date: snapshotDate,
        defindex_usdc: pos.defindexUsdc,
        blend_usdc: pos.blendUsdc,
        total_usdc: pos.totalUsdc,
        updated_at: now.toISOString(),
      },
      { onConflict: "public_key,snapshot_date" },
    );
  } catch (e: any) {
    logger.warn(`[position-snapshot] upsert failed for ${publicKey}: ${e?.message || e}`);
  }
}

/**
 * Snapshot the ACTIVE investor wallets — those with a recent non-zero snapshot.
 * This keeps the per-minute series continuous without computing positions for
 * every (often empty) wallet each minute. A brand-new investor is bootstrapped
 * by the read-path write the first time they open the yield page, after which
 * the scheduler picks them up.
 */
export async function snapshotAllTrackedWallets(): Promise<number> {
  const wallets = new Map<string, string | null>(); // public_key → email
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("bridge_position_snapshots")
      .select("public_key, email, total_usdc, snapshot_date")
      .gt("total_usdc", 0)
      .gte("snapshot_date", since)
      .order("snapshot_date", { ascending: false })
      .limit(1000);
    if (error) throw error;
    for (const r of (data || []) as any[]) {
      const pk = String(r.public_key || "").trim();
      if (pk && !wallets.has(pk)) wallets.set(pk, r.email || null);
    }
  } catch (e: any) {
    logger.warn(`[position-snapshot] could not list active wallets: ${e?.message || e}`);
    return 0;
  }

  let written = 0;
  for (const [pk, email] of wallets) {
    try {
      const pos = await computeMainnetPosition(pk);
      if (pos.totalUsdc > 1e-7) {
        await writeMinuteSnapshot(pk, email, pos);
        written += 1;
      }
    } catch (e: any) {
      logger.warn(`[position-snapshot] wallet ${pk} failed: ${e?.message || e}`);
    }
  }
  return written;
}

let _started = false;

/** Start the per-minute position snapshot scheduler (idempotent per process). */
export function startPositionSnapshotScheduler(): void {
  if (_started) return;
  _started = true;

  const enabled = String(process.env.POSITION_SNAPSHOT_ENABLED ?? "true").trim().toLowerCase() !== "false";
  if (!enabled) {
    logger.info("[position-snapshot] disabled (set POSITION_SNAPSHOT_ENABLED=true to activate)");
    return;
  }

  logger.info("[position-snapshot] scheduler started interval=60s");
  const tick = () => {
    snapshotAllTrackedWallets()
      .then((n) => { if (n) logger.info(`[position-snapshot] wrote ${n} minute snapshot(s)`); })
      .catch((e) => logger.error(`[position-snapshot] tick error: ${e instanceof Error ? e.message : String(e)}`));
  };

  setTimeout(tick, 20_000);   // first run shortly after boot
  setInterval(tick, 60_000);  // every minute thereafter
}
