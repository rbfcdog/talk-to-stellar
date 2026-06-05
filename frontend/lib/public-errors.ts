export type PublicErrorPayload = {
  success: false;
  code: string;
  message: string;
  support_code: string;
};

type PublicErrorOptions = {
  code?: string;
  message?: string;
  language?: string;
  prefix?: string;
};

function pickLanguage(language?: string) {
  return String(language || "").toLowerCase().startsWith("en") ? "en" : "pt-BR";
}

function copy(language: string | undefined, pt: string, en: string) {
  return pickLanguage(language) === "en" ? en : pt;
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

function normalizeMessage(message: string) {
  return message
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Generate a unique support reference (e.g. TTS-20260525...-AB12CD) for correlating user reports with logs. */
export function createSupportCode(prefix = "TTS") {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

/** Map a raw backend/network error into a stable code + localized user-safe message. */
export function mapPublicError(error: unknown, language?: string) {
  const raw = extractErrorMessage(error);
  const normalized = normalizeMessage(raw);

  if (/(quote|cotacao|cotação).*(expired|expirad)|not active:\s*expired/.test(normalized)) {
    return {
      code: "quote_expired",
      message: copy(language, "A estimativa expirou. Gere uma nova estimativa para continuar.", "The estimate expired. Create a new estimate to continue."),
    };
  }

  if (/(link|token).*(expired|expirad|used|utilizado|invalid|invalido)|invalid or expired link|already used|ja foi utilizado/.test(normalized)) {
    return {
      code: "link_expired",
      message: copy(language, "Esse link expirou ou já foi usado. Peça um novo link no chat.", "This link expired or was already used. Request a new link in chat."),
    };
  }

  if (/(session|sessao|sessão).*(expired|expirad|required|obrigator)|session_id|session_token|login required|unauthorized|internal authorization|invalid jwt|jwt/.test(normalized)) {
    return {
      code: "session_expired",
      message: copy(language, "Sua sessão expirou. Entre novamente para continuar.", "Your session expired. Sign in again to continue."),
    };
  }

  if (/schema cache|could not find the table|relation .* does not exist|migration|migracao|migração/.test(normalized)) {
    return {
      code: "setup_unavailable",
      message: copy(language, "Este ambiente ainda está finalizando uma configuração. Tente novamente em alguns segundos.", "This environment is still finishing setup. Try again in a few seconds."),
    };
  }

  if (/duplicate key|unique constraint|violates unique|idx_[a-z0-9_]+|23505/.test(normalized)) {
    return {
      code: "identity_conflict",
      message: copy(language, "Já existe uma conta com esses dados. Entre na conta existente ou use outro e-mail, telefone ou CPF.", "An account already exists with this information. Sign in to the existing account or use another email, phone, or CPF."),
    };
  }

  if (/friendbot|createaccountalreadyexist|failed to fund account|account.*prepar|conta.*prepar|horizon.*not found/.test(normalized)) {
    return {
      code: "account_preparing",
      message: copy(language, "Sua conta ainda está sendo preparada. Tente novamente em alguns segundos.", "Your account is still being prepared. Try again in a few seconds."),
    };
  }

  if (/(invalid|incorrect|wrong).*(pin)|pin.*(invalid|incorrect|wrong)|senha/.test(normalized)) {
    return {
      code: "invalid_pin",
      message: copy(language, "Não consegui validar o PIN. Confira e tente novamente.", "I could not validate the PIN. Check it and try again."),
    };
  }

  if (/insufficient|saldo insuficiente|not enough balance|balance/.test(normalized)) {
    return {
      code: "insufficient_balance",
      message: copy(language, "Saldo insuficiente para concluir. Complete o saldo via PIX e tente novamente.", "Insufficient balance. Add funds with PIX and try again."),
    };
  }

  if (/recipient .*not found|destinatario.*nao encontrado|destinatario.*nao existe|not found in your saved contacts|saved contacts|contatos salvos|choose a real recipient|escolha.*contato/.test(normalized)) {
    return {
      code: "recipient_not_found",
      message: copy(language, "Esse destinatário não está nos seus contatos salvos. Digite \"contatos\" no chat e escolha uma pessoa salva antes de gerar o PIX.", "This recipient is not in your saved contacts. Type \"contacts\" in chat and choose a saved person before creating PIX."),
    };
  }

  if (/recipient_asset_not_ready|ainda nao pode receber|ativar esse ativo|ativar recebimento|op_no_trust|no_trust|trustline.*destinatario|destinatario.*trustline|recipient.*cannot receive|recipient.*asset/.test(normalized)) {
    return {
      code: "recipient_asset_not_ready",
      message: copy(language, "O destinatário ainda não está pronto para receber esse ativo. Peça para a pessoa entrar na conta TalkToStellar e ativar o ativo; depois gere um novo link.", "The recipient is not ready to receive this asset yet. Ask them to sign in and activate the asset, then create a new link."),
    };
  }

  if (/customer[_\s-]?id.*required|customer.*required|missing customer|cliente.*pix|conta pix|cadastro pix|kyc|programmatic onboarding|onboarding/.test(normalized)) {
    return {
      code: "pix_account_not_ready",
      message: copy(language, "Sua conta PIX está sendo preparada. Aguarde alguns segundos e toque em Gerar PIX novamente.", "Your PIX account is being prepared. Wait a few seconds and tap Generate PIX again."),
    };
  }

  if (/tesouro_distributor|sandbox pix settlement|sandbox.*settlement/.test(normalized)) {
    return {
      code: "pix_sandbox_settlement_unavailable",
      message: copy(language, "O PIX em testnet ainda está finalizando a configuração. Tente novamente em alguns segundos.", "The testnet PIX flow is still finishing setup. Try again in a few seconds."),
    };
  }

  if (/timeout|timed out|abort|aborted|operation was aborted|fetch failed|network|econn|service unavailable|failed to fetch|gateway timeout|etimedout/.test(normalized)) {
    return {
      code: "service_timeout",
      message: copy(language, "A operação demorou demais. Tente novamente em alguns segundos; se o PIX já foi pago, consulte o status antes de gerar outro.", "The operation took too long. Try again in a few seconds; if PIX was already paid, check the status before creating another one."),
    };
  }

  if (/stellar_payment_submit_failed|falha ao enviar.*transacao stellar|failed to submit|submit.*transaction|transaction failed|tx_failed|payment failed/.test(normalized)) {
    return {
      code: "execution_unavailable",
      message: copy(language, "Não consegui enviar essa transação agora. Nenhum valor saiu da conta. Gere uma nova confirmação e tente novamente.", "I could not submit this transaction right now. No funds left the account. Create a new confirmation and try again."),
    };
  }

  if (/nao consegui encontrar uma rota segura|nao foi encontrado caminho|nenhum caminho encontrado|sem rota|no path|path not found|liquidez|source_issuer|dest_issuer|issuer=|_issuer|trustline|horizon|path payment|strictsend|strict send|xdr|dex/.test(normalized)) {
    return {
      code: "conversion_route_unavailable",
      message: copy(language, "Não consegui encontrar uma rota segura para essa conversão agora. Tente novamente em alguns segundos ou escolha outro valor.", "I could not find a safe route for this conversion right now. Try again in a few seconds or choose another amount."),
    };
  }

  if (/etherfuse|evolution|provider|pix provider|sandbox provider/.test(normalized)) {
    return {
      code: "provider_unavailable",
      message: copy(language, "O serviço de pagamento não respondeu agora. Tente novamente em alguns segundos.", "The payment service did not respond right now. Try again in a few seconds."),
    };
  }

  return {
    code: "temporary_unavailable",
    message: copy(language, "Não consegui concluir agora. Tente novamente em alguns segundos.", "I could not finish that right now. Try again in a few seconds."),
  };
}

/** Build the standard JSON error body returned by our API routes (code + message + support_code). */
export function publicErrorPayload(error: unknown, options: PublicErrorOptions = {}): PublicErrorPayload {
  const mapped = mapPublicError(error, options.language);
  return {
    success: false,
    code: options.code || mapped.code,
    message: options.message || mapped.message,
    support_code: createSupportCode(options.prefix || "TTS"),
  };
}
