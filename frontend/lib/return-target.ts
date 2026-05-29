export type ReturnTarget = {
  href: string;
  label: string;
  source: string;
};

function isPortuguese(language?: string) {
  return String(language || "").toLowerCase().startsWith("pt");
}

function copy(language: string | undefined, pt: string, en: string) {
  return isPortuguese(language) ? pt : en;
}

function withLanguage(href: string, language?: string) {
  const normalizedLanguage = isPortuguese(language) ? "pt-BR" : String(language || "").toLowerCase().startsWith("en") ? "en" : "";
  if (!normalizedLanguage) return href;
  try {
    const url = new URL(href, "https://talktostellar.local");
    if (!url.searchParams.has("lang")) url.searchParams.set("lang", normalizedLanguage);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function sanitizeInternalHref(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "";
  try {
    const url = new URL(raw, "https://talktostellar.local");
    if (url.origin !== "https://talktostellar.local") return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

function normalizeSource(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function targetForSource(source: string, language?: string): ReturnTarget | null {
  const normalized = normalizeSource(source);
  const match = (values: string[]) => values.includes(normalized);

  if (match(["rendimentos", "rendimento", "investimentos", "investments", "returns", "positions", "current-investments"])) {
    return {
      href: withLanguage("/rendimentos", language),
      label: copy(language, "Voltar aos investimentos", "Back to investments"),
      source: normalized,
    };
  }

  if (match(["review", "yield", "application", "aplicacao", "aplicação", "aplicar", "investir", "investment"])) {
    return {
      href: withLanguage("/review", language),
      label: copy(language, "Voltar à aplicação", "Back to application"),
      source: normalized,
    };
  }

  if (match(["convert", "conversion", "confirm-conversion", "conversao", "conversão"])) {
    return {
      href: withLanguage("/convert", language),
      label: copy(language, "Voltar à conversão", "Back to conversion"),
      source: normalized,
    };
  }

  if (match(["pix", "pix-ramp", "pix-on", "pix-off", "onramp", "offramp"])) {
    return {
      href: withLanguage("/pix-ramp", language),
      label: copy(language, "Voltar ao PIX", "Back to PIX"),
      source: normalized,
    };
  }

  if (match(["money-cycle", "cycle", "ciclo"])) {
    return {
      href: withLanguage("/review", language),
      label: copy(language, "Voltar à aplicação", "Back to application"),
      source: normalized,
    };
  }

  if (match(["transactions", "history", "historico", "histórico"])) {
    return {
      href: withLanguage("/transactions", language),
      label: copy(language, "Voltar ao histórico", "Back to history"),
      source: normalized,
    };
  }

  if (match(["chat", "whatsapp", "telegram", "phone", "evolution", "whatsapp-evolution"])) {
    return {
      href: withLanguage("/transactions", language),
      label: copy(language, "Ver histórico", "View history"),
      source: normalized,
    };
  }

  return null;
}

export function resolveReturnTarget(input: {
  language?: string;
  returnTo?: unknown;
  source?: unknown;
  fallbackSource?: string;
  fallbackHref?: string;
}): ReturnTarget {
  const source = normalizeSource(input.source || input.fallbackSource || "");
  const sourceTarget = targetForSource(source, input.language);
  const sanitizedReturnTo = sanitizeInternalHref(input.returnTo);

  if (sanitizedReturnTo) {
    return {
      href: withLanguage(sanitizedReturnTo, input.language),
      label: sourceTarget?.label || copy(input.language, "Voltar", "Back"),
      source: source || "custom",
    };
  }

  if (sourceTarget) return sourceTarget;

  return {
    href: withLanguage(sanitizeInternalHref(input.fallbackHref) || "/convert", input.language),
    label: copy(input.language, "Voltar", "Back"),
    source: source || "fallback",
  };
}
