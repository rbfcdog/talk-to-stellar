import { normalizeAssetCode } from '../../config/assets';

const DEFAULT_USD_BRL_SANITY_MIN = 3;
const DEFAULT_USD_BRL_SANITY_MAX = 10;

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
  return normalizeAssetCode(code) === 'BRL';
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

export function assertSaneBrlUsdcQuote(input: {
  sourceAssetCode: string;
  destinationAssetCode: string;
  sourceAmount: string | number;
  destinationAmount: string | number;
  context?: string;
}): void {
  const brlPerUsdc = computeBrlPerUsdc(input);
  if (brlPerUsdc === null) return;

  const { min, max } = getUsdBrlSanityRange();
  if (brlPerUsdc >= min && brlPerUsdc <= max) return;

  const context = input.context ? `${input.context}: ` : '';
  throw new Error(
    `${context}Cotação BRL/USDC da Stellar fora da faixa segura: 1 US$ = R$ ${brlPerUsdc.toFixed(4)}. ` +
    `Faixa configurada: R$ ${min.toFixed(2)} a R$ ${max.toFixed(2)}. ` +
    'A liquidez da testnet está distorcida; rebalanceie o mercado BRL/USDC antes de gerar o link de confirmação.',
  );
}
