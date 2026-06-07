export function stripUserFacingSummaryLabels(value: unknown): string {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line
      .replace(/^\s*(?:summary|resumo)\s*[:\-–—]\s*/i, '')
      .trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
