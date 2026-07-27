/** CPF utilities shared by the Pix cash-in flow. */

export function cpfDigits(value: string): string {
  return String(value || "").replace(/\D+/g, "");
}

/** Check-digit validation over the 11-digit CPF string (accepts formatting). */
export function isValidCpf(value: string): boolean {
  const cpf = cpfDigits(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const position of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < position; i++) sum += Number(cpf[i]) * (position + 1 - i);
    const expected = ((sum * 10) % 11) % 10;
    if (expected !== Number(cpf[position])) return false;
  }
  return true;
}

/** 123.456.789-09 display formatting for an 11-digit CPF. */
export function formatCpf(value: string): string {
  const cpf = cpfDigits(value).slice(0, 11);
  if (cpf.length <= 3) return cpf;
  if (cpf.length <= 6) return `${cpf.slice(0, 3)}.${cpf.slice(3)}`;
  if (cpf.length <= 9) return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6)}`;
  return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
}
