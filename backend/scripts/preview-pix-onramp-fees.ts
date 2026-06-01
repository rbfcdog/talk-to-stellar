function readNumber(keys: string[], fallback: number): number {
  for (const key of keys) {
    const raw = process.env[key];
    if (raw === undefined || raw === '') continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return fallback;
}

function ceilCents(value: number): number {
  return Math.ceil((value - Number.EPSILON) * 100) / 100;
}

function money(value: number): string {
  return value.toFixed(2);
}

const providerFeeBps = Math.min(readNumber(['ETHERFUSE_ONRAMP_FEE_BPS', 'ETHERFUSE_TESTNET_FEE_BPS'], 20), 1000);
const appFeeBps = Math.min(readNumber(['TALKTOSTELLAR_SPREAD_BPS', 'TTS_SPREAD_BPS'], 30), 1000);
const appFeeMinBrl = readNumber(['TALKTOSTELLAR_SPREAD_MIN_BRL', 'TTS_SPREAD_MIN_BRL'], 0.05);
const values = process.argv
  .slice(2)
  .map((value) => Number(String(value).replace(',', '.')))
  .filter((value) => Number.isFinite(value) && value > 0);
const targets = values.length ? values : [1, 10, 50, 100, 500, 1000];

console.log(`PIX on-ramp fee model: provider ${providerFeeBps} bps, app ${appFeeBps} bps, app min R$ ${money(appFeeMinBrl)}`);
console.table(targets.map((target) => {
  const providerFee = target * (providerFeeBps / 10000);
  const appFee = Math.max(target * (appFeeBps / 10000), appFeeMinBrl);
  const totalFee = providerFee + appFee;
  const pixCharge = ceilCents(target + totalFee);

  return {
    'entra_na_conta_brl': money(target),
    'taxa_etherfuse_brl': money(providerFee),
    'taxa_app_brl': money(appFee),
    'taxa_total_brl': money(totalFee),
    'pix_a_pagar_brl': money(pixCharge),
  };
}));
