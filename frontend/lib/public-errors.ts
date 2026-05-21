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

export function createSupportCode(prefix = "TTS") {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${stamp}-${suffix}`;
}

export function mapPublicError(error: unknown, language?: string) {
  const raw = extractErrorMessage(error);
  const normalized = normalizeMessage(raw);

  if (/(quote|cotacao|cotação).*(expired|expirad)|not active:\s*expired/.test(normalized)) {
    return {
      code: "quote_expired",
      message: copy(language, "A cotação expirou. Gere uma nova cotação para continuar.", "The quote expired. Create a new quote to continue."),
    };
  }

  if (/(link|token).*(expired|expirad|used|utilizado|invalid|invalido)|already used|ja foi utilizado/.test(normalized)) {
    return {
      code: "link_expired",
      message: copy(language, "Esse link expirou ou já foi usado. Peça um novo link no chat.", "This link expired or was already used. Request a new link in chat."),
    };
  }

  if (/(session|sessao|sessão).*(expired|expirad)|login required|unauthorized|invalid jwt|jwt/.test(normalized)) {
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

  if (/etherfuse|evolution|provider|pix provider|sandbox provider/.test(normalized)) {
    return {
      code: "provider_unavailable",
      message: copy(language, "O provedor de pagamento não respondeu agora. Tente novamente em alguns segundos.", "The payment provider did not respond right now. Try again in a few seconds."),
    };
  }

  if (/timeout|timed out|abort|fetch failed|network|econn|service unavailable|failed to fetch/.test(normalized)) {
    return {
      code: "service_unavailable",
      message: copy(language, "Não consegui conectar ao serviço agora. Tente novamente em alguns segundos.", "I could not connect to the service right now. Try again in a few seconds."),
    };
  }

  return {
    code: "temporary_unavailable",
    message: copy(language, "Não consegui concluir agora. Tente novamente em alguns segundos.", "I could not finish that right now. Try again in a few seconds."),
  };
}

export function publicErrorPayload(error: unknown, options: PublicErrorOptions = {}): PublicErrorPayload {
  const mapped = mapPublicError(error, options.language);
  return {
    success: false,
    code: options.code || mapped.code,
    message: options.message || mapped.message,
    support_code: createSupportCode(options.prefix || "TTS"),
  };
}
