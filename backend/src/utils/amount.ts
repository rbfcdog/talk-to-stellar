export function normalizeHumanAmountText(value: unknown): string {
  const raw = String(value || '').trim().replace(/\s+/g, '');
  if (!raw) return '';

  const withoutSymbols = raw.replace(/[^\d.,-]/g, '');
  if (!withoutSymbols || withoutSymbols === '-' || withoutSymbols === '.' || withoutSymbols === ',') {
    return '';
  }

  const negative = withoutSymbols.startsWith('-') ? '-' : '';
  const unsigned = withoutSymbols.replace(/^-/, '');

  if (unsigned.includes(',') && unsigned.includes('.')) {
    return `${negative}${unsigned.replace(/\./g, '').replace(',', '.')}`;
  }

  if (unsigned.includes(',')) {
    return `${negative}${unsigned.replace(/\./g, '').replace(',', '.')}`;
  }

  if (/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(unsigned)) {
    return `${negative}${unsigned.replace(/\./g, '')}`;
  }

  return `${negative}${unsigned}`;
}

export function parseHumanAmountNumber(value: unknown): number {
  const parsed = Number(normalizeHumanAmountText(value));
  return Number.isFinite(parsed) ? parsed : 0;
}
