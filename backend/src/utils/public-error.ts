export type PublicErrorPayload = {
  success: false;
  message: string;
  code?: string;
  support_code?: string;
};

function rawMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || '');
}

function normalizedMessage(error: unknown) {
  return rawMessage(error)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function supportCode() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TTS-${stamp}-${suffix}`;
}

export function publicErrorMessage(error: unknown, fallback = 'Nao consegui concluir agora. Tente novamente em alguns segundos.') {
  const raw = rawMessage(error);
  const normalized = normalizedMessage(error);

  if (/(quote|cotacao).*(expired|expirad)|not active:\s*expired/.test(normalized)) {
    return 'A cotacao expirou. Gere uma nova cotacao para continuar.';
  }
  if (/(link|token).*(expired|expirad|used|utilizado|invalid|invalido)|invalid or expired link|already used|ja foi utilizado/.test(normalized)) {
    return 'Esse link expirou ou ja foi usado. Peca um novo link no chat.';
  }
  if (/(session|sessao).*(expired|expirad)|login required|unauthorized|internal authorization|invalid jwt|jwt/.test(normalized)) {
    return 'Sua sessao expirou. Entre novamente para continuar.';
  }
  if (/schema cache|could not find the table|relation .* does not exist|violates row-level security|permission denied|migration/.test(normalized)) {
    return 'Este ambiente ainda esta finalizando uma configuracao. Tente novamente em alguns segundos.';
  }
  if (/(invalid|incorrect|wrong).*(pin)|pin.*(invalid|incorrect|wrong)|senha/.test(normalized)) {
    return 'Nao consegui validar o PIN. Confira e tente novamente.';
  }
  if (/insufficient|saldo insuficiente|not enough balance/.test(normalized)) {
    return 'Saldo insuficiente para concluir. Complete o saldo via PIX e tente novamente.';
  }
  if (
    /nao consegui encontrar uma rota segura|nao foi encontrado caminho|não foi encontrado caminho|nenhum caminho encontrado|sem rota|no path|path not found|liquidez|source_issuer|dest_issuer|issuer=|_issuer|trustline|horizon|path payment|strictsend|strict send|xdr|dex/.test(normalized)
  ) {
    return 'Nao consegui encontrar uma rota segura para essa conversao agora. Tente novamente em alguns segundos ou escolha outro valor.';
  }
  if (/etherfuse|evolution|provider|pix provider|sandbox provider|fetch failed|timeout|timed out|econn/.test(normalized)) {
    return 'O servico de pagamento nao respondeu agora. Tente novamente em alguns segundos.';
  }

  return fallback || raw || 'Nao consegui concluir agora. Tente novamente em alguns segundos.';
}

export function publicErrorPayload(error: unknown, options: { code?: string; includeSupportCode?: boolean; fallback?: string } = {}): PublicErrorPayload {
  return {
    success: false,
    message: publicErrorMessage(error, options.fallback),
    ...(options.code ? { code: options.code } : {}),
    ...(options.includeSupportCode ? { support_code: supportCode() } : {}),
  };
}
