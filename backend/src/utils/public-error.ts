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
  if (/wallet not found for payment confirmation|wallet not found for conversion confirmation|wallet.*vault|vault[_\s-]?secret|source wallet secret|wallet private key|private key|failed to read secret from vault|get_private_key|not ready to sign|assinar esta operacao/.test(normalized)) return 'account_signing_unavailable';
  if (/pin.*(required|obrigator|obrigatorio)|pin da wallet|pin da conta/.test(normalized)) return 'missing_pin';
  if (/(invalid|incorrect|wrong|invalido).*(pin)|pin.*(invalid|incorrect|wrong|invalido)|senha/.test(normalized)) return 'invalid_pin';
  if (/insufficient|saldo insuficiente|not enough balance/.test(normalized)) return 'insufficient_balance';
  if (/defindex.*desativad|execucao defindex|defindex_enable_execution|defindex_compliance_approved|compliance approval|yield.*execution.*(disabled|requires)|execution.*yield.*disabled/.test(normalized)) return 'yield_execution_disabled';
  if (/review.*not ready|prepare.*again|revisao.*nao.*pronta|prepare.*revisao/.test(normalized)) return 'review_not_prepared';
  if (/(wallet private key|source wallet secret|private key|secret|failed to read secret from vault|get_private_key|assinar esta operacao|not ready to sign).*(defindex|yield|rendimento|operacao)|(defindex|yield|rendimento|operacao).*(wallet private key|source wallet secret|private key|secret|failed to read secret from vault|get_private_key|assinar esta operacao|not ready to sign)/.test(normalized)) return 'account_signing_unavailable';
  if (/send transaction|submit.*transaction|external execution|confirmacao.*externa|operacao.*externa|transacao.*externa|envio.*transacao|failed to submit|transaction failed/.test(normalized)) return 'execution_unavailable';
  if (/defindex|yield confirmation|yield operation|yield service|rendimento/.test(normalized)) return 'yield_unavailable';
  if (/recipient .*not found|destinatario.*nao encontrado|destinatario.*nao existe|not found in your saved contacts|saved contacts|contatos salvos|choose a real recipient|escolha.*contato/.test(normalized)) return 'recipient_not_found';
  if (/recipient_asset_not_ready|ainda nao pode receber|ativar esse ativo|ativar recebimento|op_no_trust|no_trust|trustline.*destinatario|destinatario.*trustline|recipient.*cannot receive|recipient.*asset/.test(normalized)) return 'recipient_asset_not_ready';
  if (/customer[_\s-]?id.*required|customer.*required|missing customer|cliente.*pix|conta pix|cadastro pix|kyc|programmatic onboarding|onboarding/.test(normalized)) return 'pix_account_not_ready';
  if (/tesouro_distributor|sandbox pix settlement|sandbox.*settlement/.test(normalized)) return 'pix_sandbox_settlement_unavailable';
  if (/uuid parsing|json deserialize error|accountregistration/.test(normalized)) return 'pix_account_not_ready';
  if (/timeout|timed out|abort|aborted|operation was aborted|fetch failed|network|econn|service unavailable|failed to fetch|gateway timeout|etimedout/.test(normalized)) return 'service_timeout';
  if (/stellar_payment_submit_failed|falha ao enviar.*transacao stellar|failed to submit|submit.*transaction|transaction failed|tx_failed|payment failed/.test(normalized)) return 'execution_unavailable';
  if (/nao consegui encontrar uma rota segura|nao foi encontrado caminho|não foi encontrado caminho|nenhum caminho encontrado|sem rota|no path|path not found|liquidez|source_issuer|dest_issuer|issuer=|_issuer|trustline|horizon|path payment|strictsend|strict send|xdr|dex/.test(normalized)) return 'conversion_route_unavailable';
  if (/etherfuse|evolution|provider|pix provider|sandbox provider/.test(normalized)) return 'provider_unavailable';

  return 'temporary_unavailable';
}

function supportCode() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TTS-${stamp}-${suffix}`;
}

export function publicErrorMessage(error: unknown, fallback = 'Não consegui concluir agora. Tente novamente em alguns segundos.') {
  const raw = rawMessage(error);

  switch (publicErrorCode(error)) {
    case 'quote_expired':
      return 'A estimativa expirou. Atualize o valor ou peça uma nova estimativa no chat.';
    case 'link_expired':
      return 'Esse link expirou ou já foi usado. Peça um novo link no chat.';
    case 'session_expired':
      return 'Sua sessão expirou. Entre novamente para continuar.';
    case 'setup_unavailable':
      return 'Este ambiente ainda está finalizando uma configuração. Tente novamente em alguns segundos.';
    case 'identity_conflict':
      return 'Já existe uma conta com esses dados. Entre na conta existente ou use outro e-mail, telefone ou CPF.';
    case 'account_preparing':
      return 'Sua conta ainda está sendo preparada. Tente novamente em alguns segundos.';
    case 'yield_execution_disabled':
      return 'A confirmação ainda não está ativada neste ambiente de teste. Você pode consultar a tela, mas a execução real está bloqueada.';
    case 'account_signing_unavailable':
      return 'Esta conta ainda não está pronta para assinar esta operação. Entre novamente e tente outra vez.';
    case 'missing_pin':
      return 'Digite o PIN da conta para confirmar.';
    case 'review_not_prepared':
      return 'Prepare a confirmação novamente e confirme em seguida.';
    case 'execution_unavailable':
      return 'Não consegui enviar essa transação agora. Nenhum valor saiu da conta. Prepare uma nova confirmação e tente novamente.';
    case 'yield_unavailable':
      return 'Não foi possível atualizar a aplicação agora. Tente novamente em alguns segundos.';
    case 'invalid_pin':
      return 'Não consegui validar o PIN. Confira e tente novamente.';
    case 'insufficient_balance':
      return 'Saldo insuficiente para concluir. Complete o saldo via PIX e tente novamente.';
    case 'recipient_not_found':
      return 'Esse destinatário não está nos seus contatos salvos. Digite "contatos" no chat e escolha uma pessoa salva antes de gerar o PIX.';
    case 'recipient_asset_not_ready':
      return 'O destinatário ainda não está pronto para receber esse ativo. Peça para a pessoa entrar na conta TalkToStellar e ativar o ativo; depois gere um novo link.';
    case 'pix_account_not_ready':
      return 'Sua conta PIX ainda está sendo preparada. Aguarde alguns segundos e toque em Gerar PIX novamente.';
    case 'pix_sandbox_settlement_unavailable':
      return 'O PIX em testnet ainda está finalizando a configuração. Tente novamente em alguns segundos.';
    case 'service_timeout':
      return 'A operação demorou demais. Tente novamente em alguns segundos; se o PIX já foi pago, consulte o status antes de gerar outro.';
    case 'conversion_route_unavailable':
      return 'Não consegui encontrar uma rota segura para essa conversão agora. Tente novamente em alguns segundos ou escolha outro valor.';
    case 'provider_unavailable':
      return 'O serviço de pagamento não respondeu agora. Tente novamente em alguns segundos; se já confirmou algo, consulte o status antes de repetir.';
  }

  return fallback || raw || 'Não consegui concluir agora. Tente novamente em alguns segundos.';
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
