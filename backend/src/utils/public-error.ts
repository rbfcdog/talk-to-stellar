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

export function publicErrorCode(error: unknown) {
  const explicitCode = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || '').trim()
    : '';
  if (explicitCode) return explicitCode;
  const normalized = normalizedMessage(error);

  if (/(quote|cotacao).*(expired|expirad)|not active:\s*expired/.test(normalized)) return 'quote_expired';
  if (/(link|token).*(expired|expirad|used|utilizado|invalid|invalido)|invalid or expired link|already used|ja foi utilizado/.test(normalized)) return 'link_expired';
  if (/(session|sessao).*(expired|expirad|required|obrigator)|session_id|session_token|login required|unauthorized|internal authorization|invalid jwt|jwt/.test(normalized)) return 'session_expired';
  if (/schema cache|could not find the table|relation .* does not exist|violates row-level security|permission denied|migration/.test(normalized)) return 'setup_unavailable';
  if (/duplicate key|unique constraint|violates unique|idx_[a-z0-9_]+|23505/.test(normalized)) return 'identity_conflict';
  if (/friendbot|createaccountalreadyexist|failed to fund account|account.*prepar|conta.*prepar|horizon.*not found/.test(normalized)) return 'account_preparing';
  if (/(invalid|incorrect|wrong).*(pin)|pin.*(invalid|incorrect|wrong)|senha/.test(normalized)) return 'invalid_pin';
  if (/insufficient|saldo insuficiente|not enough balance/.test(normalized)) return 'insufficient_balance';
  if (/defindex.*desativad|execucao defindex|defindex_enable_execution|yield.*execution.*disabled|execution.*yield.*disabled/.test(normalized)) return 'yield_execution_disabled';
  if (/(wallet private key|source wallet secret|private key|secret).*(defindex|yield|rendimento)|(defindex|yield|rendimento).*(wallet private key|source wallet secret|private key|secret)/.test(normalized)) return 'account_signing_unavailable';
  if (/defindex|yield confirmation|yield operation|yield service|rendimento/.test(normalized)) return 'yield_unavailable';
  if (/recipient .*not found|destinatario.*nao encontrado|destinatario.*nao existe|not found in your saved contacts|saved contacts|contatos salvos|choose a real recipient|escolha.*contato/.test(normalized)) return 'recipient_not_found';
  if (/customer[_\s-]?id.*required|customer.*required|missing customer|cliente.*pix|conta pix|cadastro pix|kyc|programmatic onboarding|onboarding/.test(normalized)) return 'pix_account_not_ready';
  if (/uuid parsing|json deserialize error|accountregistration/.test(normalized)) return 'pix_account_not_ready';
  if (/timeout|timed out|abort|aborted|operation was aborted|fetch failed|network|econn|service unavailable|failed to fetch|gateway timeout|etimedout/.test(normalized)) return 'service_timeout';
  if (/nao consegui encontrar uma rota segura|nao foi encontrado caminho|não foi encontrado caminho|nenhum caminho encontrado|sem rota|no path|path not found|liquidez|source_issuer|dest_issuer|issuer=|_issuer|trustline|horizon|path payment|strictsend|strict send|xdr|dex/.test(normalized)) return 'conversion_route_unavailable';
  if (/etherfuse|evolution|provider|pix provider|sandbox provider/.test(normalized)) return 'provider_unavailable';

  return 'temporary_unavailable';
}

function supportCode() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TTS-${stamp}-${suffix}`;
}

export function publicErrorMessage(error: unknown, fallback = 'Nao consegui concluir agora. Tente novamente em alguns segundos.') {
  const raw = rawMessage(error);

  switch (publicErrorCode(error)) {
    case 'quote_expired':
      return 'A estimativa expirou. Atualize o valor ou peca uma nova estimativa no chat.';
    case 'link_expired':
      return 'Esse link expirou ou ja foi usado. Peca um novo link no chat.';
    case 'session_expired':
      return 'Sua sessao expirou. Entre novamente para continuar.';
    case 'setup_unavailable':
      return 'Este ambiente ainda esta finalizando uma configuracao. Tente novamente em alguns segundos.';
    case 'identity_conflict':
      return 'Ja existe uma conta com esses dados. Entre na conta existente ou use outro e-mail, telefone ou CPF.';
    case 'account_preparing':
      return 'Sua conta ainda esta sendo preparada. Tente novamente em alguns segundos.';
    case 'yield_execution_disabled':
      return 'A confirmacao de rendimento ainda nao esta ativada neste ambiente. Voce pode revisar a simulacao, mas nao confirmar com PIN.';
    case 'account_signing_unavailable':
      return 'Esta conta ainda nao esta pronta para assinar rendimento. Entre novamente e tente outra vez.';
    case 'yield_unavailable':
      return 'Nao foi possivel atualizar o rendimento agora. Tente novamente em alguns segundos.';
    case 'invalid_pin':
      return 'Nao consegui validar o PIN. Confira e tente novamente.';
    case 'insufficient_balance':
      return 'Saldo insuficiente para concluir. Complete o saldo via PIX e tente novamente.';
    case 'recipient_not_found':
      return 'Esse destinatario nao esta nos seus contatos salvos. Digite "contatos" no chat e escolha uma pessoa salva antes de gerar o PIX.';
    case 'pix_account_not_ready':
      return 'Sua conta PIX ainda esta sendo preparada. Aguarde alguns segundos e toque em Gerar PIX novamente.';
    case 'service_timeout':
      return 'A operacao demorou demais. Tente novamente em alguns segundos; se o PIX ja foi pago, consulte o status antes de gerar outro.';
    case 'conversion_route_unavailable':
      return 'Nao consegui encontrar uma rota segura para essa conversao agora. Tente novamente em alguns segundos ou escolha outro valor.';
    case 'provider_unavailable':
      return 'O servico de pagamento nao respondeu agora. Tente novamente em alguns segundos; se ja confirmou algo, consulte o status antes de repetir.';
  }

  return fallback || raw || 'Nao consegui concluir agora. Tente novamente em alguns segundos.';
}

export function publicErrorPayload(error: unknown, options: { code?: string; includeSupportCode?: boolean; fallback?: string } = {}): PublicErrorPayload {
  const code = options.code || publicErrorCode(error);
  return {
    success: false,
    message: publicErrorMessage(error, options.fallback),
    ...(code ? { code } : {}),
    ...(options.includeSupportCode ? { support_code: supportCode() } : {}),
  };
}
