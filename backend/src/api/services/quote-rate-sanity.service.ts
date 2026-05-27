import { getStellarNetworkName, normalizeAssetCode } from '../../config/assets';
import { FiatRateService } from './fiat-rate.service';

const DEFAULT_USD_BRL_SANITY_MIN = 3;
const DEFAULT_USD_BRL_SANITY_MAX = 10;
const DEFAULT_USD_BRL_MAX_MARKET_DEVIATION_PCT = 10;

function readPositiveNumber(names: string[], fallback: number): number {
  for (const name of names) {
    const parsed = Number(String(process.env[name] || '').replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return fallback;
}

function toPositiveNumber(value: unknown): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function isUsdLike(code: string): boolean {
  return normalizeAssetCode(code) === 'USDC';
}

function isBrlLike(code: string): boolean {
  const normalized = normalizeAssetCode(code);
  return normalized === 'BRL' || normalized === 'TESOURO';
}

export function getUsdBrlSanityRange(): { min: number; max: number } {
  const min = readPositiveNumber(
    ['USD_BRL_SANITY_MIN', 'DEFAULT_USD_BRL_SANITY_MIN'],
    DEFAULT_USD_BRL_SANITY_MIN,
  );
  const max = readPositiveNumber(
    ['USD_BRL_SANITY_MAX', 'DEFAULT_USD_BRL_SANITY_MAX'],
    DEFAULT_USD_BRL_SANITY_MAX,
  );

  if (min >= max) {
    return {
      min: DEFAULT_USD_BRL_SANITY_MIN,
      max: DEFAULT_USD_BRL_SANITY_MAX,
    };
  }

  return { min, max };
}

export function getUsdBrlMaxMarketDeviationPct(): number {
  return readPositiveNumber(
    ['USD_BRL_MAX_MARKET_DEVIATION_PCT', 'USD_BRL_MARKET_DEVIATION_MAX_PCT'],
    DEFAULT_USD_BRL_MAX_MARKET_DEVIATION_PCT,
  );
}

export function computeUsdBrlMarketDeviationPct(
  brlPerUsdc: number,
  referenceBrlPerUsd: number,
): number {
  if (!Number.isFinite(brlPerUsdc) || brlPerUsdc <= 0) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(referenceBrlPerUsd) || referenceBrlPerUsd <= 0) return Number.POSITIVE_INFINITY;
  return Math.abs(brlPerUsdc - referenceBrlPerUsd) / referenceBrlPerUsd * 100;
}

export function isUsdBrlMarketDeviationAllowed(
  brlPerUsdc: number,
  referenceBrlPerUsd: number,
): boolean {
  return computeUsdBrlMarketDeviationPct(brlPerUsdc, referenceBrlPerUsd) <= getUsdBrlMaxMarketDeviationPct();
}

export function computeBrlPerUsdc(input: {
  sourceAssetCode: string;
  destinationAssetCode: string;
  sourceAmount: string | number;
  destinationAmount: string | number;
}): number | null {
  const sourceCode = normalizeAssetCode(input.sourceAssetCode);
  const destinationCode = normalizeAssetCode(input.destinationAssetCode);
  const sourceAmount = toPositiveNumber(input.sourceAmount);
  const destinationAmount = toPositiveNumber(input.destinationAmount);

  if (!sourceAmount || !destinationAmount) return null;

  if (isUsdLike(sourceCode) && isBrlLike(destinationCode)) {
    return destinationAmount / sourceAmount;
  }

  if (isBrlLike(sourceCode) && isUsdLike(destinationCode)) {
    return sourceAmount / destinationAmount;
  }

  return null;
}

function shouldSkipMarketDeviationCheck(input: {
  sourceAssetCode: string;
  destinationAssetCode: string;
}): boolean {
  const sourceCode = normalizeAssetCode(input.sourceAssetCode);
  const destinationCode = normalizeAssetCode(input.destinationAssetCode);
  const isBrlUsdcPair =
    (isUsdLike(sourceCode) && isBrlLike(destinationCode)) ||
    (isBrlLike(sourceCode) && isUsdLike(destinationCode));

  return getStellarNetworkName() === 'TESTNET' && isBrlUsdcPair;
}

export async function assertSaneBrlUsdcQuote(input: {
  sourceAssetCode: string;
  destinationAssetCode: string;
  sourceAmount: string | number;
  destinationAmount: string | number;
  context?: string;
}): Promise<void> {
  const brlPerUsdc = computeBrlPerUsdc(input);
  if (brlPerUsdc === null) return;

  const { min, max } = getUsdBrlSanityRange();
  const context = input.context ? `${input.context}: ` : '';

  if (brlPerUsdc < min || brlPerUsdc > max) {
    throw new Error(
      `${context}Cotação BRL/USDC da Stellar fora da faixa segura: 1 US$ = R$ ${brlPerUsdc.toFixed(4)}. ` +
      `Faixa configurada: R$ ${min.toFixed(2)} a R$ ${max.toFixed(2)}. ` +
      'A liquidez da testnet está distorcida; rebalanceie o mercado BRL/USDC antes de gerar o link de confirmação.',
    );
  }

  if (shouldSkipMarketDeviationCheck(input)) {
    return;
  }

  let marketQuote;
  try {
    marketQuote = await FiatRateService.getUsdBrlRate();
  } catch (error) {
    throw new Error(
      `${context}Não consegui validar a rota BRL/USDC contra a cotação USD/BRL de mercado. ` +
      `Quote da rota: 1 US$ = R$ ${brlPerUsdc.toFixed(4)}. ` +
      `Motivo: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const deviationPct = computeUsdBrlMarketDeviationPct(brlPerUsdc, marketQuote.brlPerUsd);
  const maxDeviationPct = getUsdBrlMaxMarketDeviationPct();
  if (deviationPct <= maxDeviationPct) return;

  throw new Error(
    `${context}Cotação BRL/USDC da Stellar desvia ${deviationPct.toFixed(2)}% da referência USD/BRL de mercado: ` +
    `rota 1 US$ = R$ ${brlPerUsdc.toFixed(4)}, referência ${marketQuote.source} = R$ ${marketQuote.brlPerUsd.toFixed(4)}. ` +
    `Limite configurado: ${maxDeviationPct.toFixed(2)}%. ` +
    'A liquidez da testnet está distorcida; rebalanceie o mercado BRL/USDC antes de gerar o link de confirmação.',
  );
}
