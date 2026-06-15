import type {
  OpsHistoryCategory,
  OpsHistoryRecord,
  OpsHistorySource,
} from "../repository/ops-history.repository";
import {
  TRANSFER_STATES,
  Transfer,
  TransferEvent,
  TransferState,
} from "../../orchestration/types";

export const OPS_HISTORY_SOURCES: readonly OpsHistorySource[] = [
  "transfers",
  "international_transfers",
  "operations",
  "payment_logs",
];

export const HISTORY_SOURCE_LABELS: Record<OpsHistorySource, string> = {
  transfers: "D1 lifecycle",
  international_transfers: "International",
  operations: "Operations",
  payment_logs: "Payment logs",
};

export const STATE_LABELS: Record<TransferState, string> = {
  CREATED: "Created",
  QUOTED: "Quoted",
  PIX_CHARGE_ISSUED: "PIX issued",
  PIX_FUNDED: "PIX funded",
  CONVERTING: "Converting",
  STELLAR_SETTLED: "Stellar settled",
  PAYOUT_ROUTING: "Routing",
  PAYOUT_INSTRUCTED: "Payout instructed",
  RECONCILED: "Reconciled",
  QUOTE_EXPIRED: "Quote expired",
  PIX_EXPIRED: "PIX expired",
  FAILED: "Failed",
  REFUND_REQUIRED: "Refund required",
};

export const PRIMARY_STAGES: TransferState[] = [
  "CREATED",
  "QUOTED",
  "PIX_CHARGE_ISSUED",
  "PIX_FUNDED",
  "CONVERTING",
  "STELLAR_SETTLED",
  "PAYOUT_ROUTING",
  "PAYOUT_INSTRUCTED",
  "RECONCILED",
];

const FAILURE_STATES = new Set<TransferState>([
  "QUOTE_EXPIRED",
  "PIX_EXPIRED",
  "FAILED",
  "REFUND_REQUIRED",
]);
const ACTIVE_STATES = new Set<TransferState>([
  "PIX_FUNDED",
  "CONVERTING",
  "PAYOUT_ROUTING",
]);
const SUCCESS_STATES = new Set<TransferState>([
  "STELLAR_SETTLED",
  "PAYOUT_INSTRUCTED",
  "RECONCILED",
]);
const NEUTRAL_STATES = new Set<TransferState>([
  "CREATED",
  "QUOTED",
  "PIX_CHARGE_ISSUED",
]);

export type OpsSortDirection = "asc" | "desc";

export type OpsDashboardFilters = {
  token: string;
  source: string;
  category: string;
  states: string[];
  search: string;
  from: string;
  to: string;
  needsAttention: boolean;
  sort: string;
  direction: OpsSortDirection;
  page: number;
  pageSize: number;
};

export type OpsDashboardMetric = {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "active" | "success" | "attention";
};

export type OpsDashboardPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
};

export type OpsDashboardRenderInput = {
  title: string;
  subtitle: string;
  environment: string;
  updatedAt: string;
  records: OpsHistoryRecord[];
  totalRecords: number;
  allStatuses: string[];
  filters: OpsDashboardFilters;
  metrics: OpsDashboardMetric[];
  pagination: OpsDashboardPagination;
  sourceErrors: Partial<Record<OpsHistorySource, string>>;
  operatorLogin: string;
  csrfToken: string;
};

export type OpsTransferDetailRenderInput = {
  transfer: Transfer;
  events: TransferEvent[];
  token: string;
  environment: string;
  updatedAt: string;
  operatorLogin: string;
  csrfToken: string;
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value);
}

function titleizeStatus(value: string): string {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "Unknown";
  return cleaned
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeAsset(asset: string | null | undefined): string {
  return String(asset || "")
    .trim()
    .toUpperCase();
}

function groupInteger(value: string): string {
  const sign = value.startsWith("-") ? "-" : "";
  const digits = sign ? value.slice(1) : value;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function formatDecimal(
  value: string | null | undefined,
  maxDecimals: number,
  minDecimals = 0,
): string {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!text) return "";
  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return text;

  const sign = match[1] || "";
  const integer = match[2] || "0";
  const fraction = (match[3] || "").slice(0, maxDecimals);
  let trimmed = fraction.replace(/0+$/g, "");
  if (trimmed.length < minDecimals) {
    trimmed = trimmed.padEnd(minDecimals, "0");
  }
  return trimmed
    ? `${groupInteger(`${sign}${integer}`)}.${trimmed}`
    : groupInteger(`${sign}${integer}`);
}

export function formatCurrency(
  value: string | null | undefined,
  asset: string | null | undefined,
): string {
  const text = String(value ?? "").trim();
  if (!text) return "-";
  const normalizedAsset = normalizeAsset(asset);
  if (normalizedAsset === "BRL")
    return `R$ ${escapeHtml(formatDecimal(text, 2, 2))}`;
  if (normalizedAsset === "USDC")
    return `USDC ${escapeHtml(formatDecimal(text, 6, 2))}`;
  if (normalizedAsset === "USD")
    return `US$ ${escapeHtml(formatDecimal(text, 2, 2))}`;
  if (normalizedAsset === "XLM")
    return `XLM ${escapeHtml(formatDecimal(text, 7, 2))}`;
  return `${escapeHtml(normalizedAsset || "Amount")} ${escapeHtml(formatDecimal(text, 6, 0))}`;
}

function formatAbsoluteDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date
    .toISOString()
    .replace("T", " ")
    .replace(/\.\d{3}Z$/, "Z");
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const diffMs = Date.now() - date.getTime();
  const future = diffMs < 0;
  const seconds = Math.max(0, Math.round(Math.abs(diffMs) / 1000));
  const units: Array<[number, string]> = [
    [60 * 60 * 24 * 30, "mo"],
    [60 * 60 * 24, "d"],
    [60 * 60, "h"],
    [60, "m"],
  ];
  for (const [unitSeconds, label] of units) {
    if (seconds >= unitSeconds) {
      const amount = Math.floor(seconds / unitSeconds);
      return future ? `in ${amount}${label}` : `${amount}${label} ago`;
    }
  }
  return future ? "in seconds" : "just now";
}

function renderTime(
  value: string | null | undefined,
  mode: "compact" | "stack" = "compact",
): string {
  const absolute = formatAbsoluteDate(value);
  if (!value || absolute === "-") return '<span class="muted">-</span>';
  const iso = Number.isNaN(new Date(value).getTime())
    ? String(value)
    : new Date(value).toISOString();
  const relative = formatRelativeTime(value);
  if (mode === "stack") {
    return `<span class="time-stack"><time datetime="${escapeAttr(iso)}" title="${escapeAttr(absolute)}" data-relative-time="${escapeAttr(iso)}">${escapeHtml(relative)}</time><span>${escapeHtml(absolute)}</span></span>`;
  }
  return `<time datetime="${escapeAttr(iso)}" title="${escapeAttr(absolute)}" data-relative-time="${escapeAttr(iso)}">${escapeHtml(relative)}</time>`;
}

function shortValue(
  value: string | null | undefined,
  left = 10,
  right = 6,
): string {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= left + right + 3) return text;
  return `${text.slice(0, left)}...${text.slice(-right)}`;
}

function tokenHiddenInput(token: string): string {
  return token
    ? `<input type="hidden" name="token" value="${escapeAttr(token)}">`
    : "";
}

function isKnownTransferState(status: string): status is TransferState {
  return (TRANSFER_STATES as readonly string[]).includes(status);
}

function statusTone(
  status: string,
  category?: OpsHistoryCategory,
): "neutral" | "info" | "active" | "success" | "attention" {
  const normalized = String(status || "")
    .trim()
    .toUpperCase();
  if (isKnownTransferState(normalized) && FAILURE_STATES.has(normalized))
    return "attention";
  if (category === "failed") return "attention";
  if (/FAIL|ERROR|EXPIRED|REFUND|CANCEL|DISCREP/.test(normalized))
    return "attention";
  if (isKnownTransferState(normalized) && SUCCESS_STATES.has(normalized))
    return "success";
  if (category === "completed") return "success";
  if (isKnownTransferState(normalized) && ACTIVE_STATES.has(normalized))
    return "active";
  if (/FUNDED|CONVERT|ROUT|PAYOUT|PENDING|PROCESS/.test(normalized))
    return "active";
  if (isKnownTransferState(normalized) && NEUTRAL_STATES.has(normalized))
    return normalized === "PIX_CHARGE_ISSUED" ? "info" : "neutral";
  return "neutral";
}

export function renderStatusPill(
  status: string,
  category?: OpsHistoryCategory,
): string {
  const normalized = String(status || "")
    .trim()
    .toUpperCase();
  const label = isKnownTransferState(normalized)
    ? STATE_LABELS[normalized]
    : titleizeStatus(status);
  const tone = statusTone(status, category);
  return `<span class="status-pill status-${tone}" role="status" aria-label="Status: ${escapeAttr(label)}"><span class="status-dot" aria-hidden="true"></span><span class="status-text">${escapeHtml(label)}</span></span>`;
}

function renderBadge(
  label: string,
  tone: "default" | "active" | "success" | "attention" = "default",
): string {
  return `<span class="ops-badge ops-badge-${tone}">${escapeHtml(label)}</span>`;
}

function renderCopyButton(
  value: string | null | undefined,
  label: string,
): string {
  const text = String(value || "").trim();
  if (!text) return "";
  return `<button class="copy-button" type="button" data-copy-value="${escapeAttr(text)}" aria-label="Copy ${escapeAttr(label)}" title="Copy ${escapeAttr(label)}">Copy</button>`;
}

function renderExternalLink(href: string, label: string): string {
  if (!href) return "";
  return `<a class="external-link" href="${escapeAttr(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)} <span aria-hidden="true">&nearr;</span></a>`;
}

function buildOpsUrl(
  filters: OpsDashboardFilters,
  overrides: Partial<OpsDashboardFilters> = {},
): string {
  const next: OpsDashboardFilters = {
    ...filters,
    ...overrides,
    states: overrides.states ?? filters.states,
  };
  const params = new URLSearchParams();
  if (next.token) params.set("token", next.token);
  if (next.source) params.set("source", next.source);
  if (next.category) params.set("category", next.category);
  for (const state of next.states) params.append("state", state);
  if (next.search) params.set("q", next.search);
  if (next.from) params.set("from", next.from);
  if (next.to) params.set("to", next.to);
  if (next.needsAttention) params.set("needs_attention", "1");
  if (next.sort) params.set("sort", next.sort);
  if (next.direction) params.set("dir", next.direction);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== 50) params.set("page_size", String(next.pageSize));
  const query = params.toString();
  return query ? `/ops?${query}` : "/ops";
}

export function tokenQuery(token: string): string {
  return token ? `?token=${encodeURIComponent(token)}` : "";
}

function renderBrandMark(): string {
  return `<svg class="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.348 10.052L4.174 14.881L2.943 12.28L13.117 7.451L14.348 10.052Z" fill="currentColor"/><path d="M21.057 11.72L10.883 16.549L9.652 13.948L19.826 9.119L21.057 11.72Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20Z" fill="currentColor"/></svg>`;
}

function renderPageShell(input: {
  title: string;
  subtitle: string;
  environment: string;
  updatedAt: string;
  body: string;
  active: "history" | "detail";
  operatorLogin: string;
  csrfToken: string;
}): string {
  const activeHistory =
    input.active === "history" ? ' aria-current="page"' : "";
  const activeDetail = input.active === "detail" ? ' aria-current="page"' : "";
  const forensicsHref =
    input.active === "detail" ? "#transfer-detail" : "/ops?source=transfers";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<style>${OPS_DASHBOARD_CSS}</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="ops-topbar">
  <div class="topbar-inner">
    <a class="brand" href="/ops" aria-label="TalkToStellar ops dashboard">
      ${renderBrandMark()}
      <span class="brand-copy"><strong>TalkToStellar</strong><span>Operational console</span></span>
    </a>
    <nav class="top-nav" aria-label="Operations sections">
      <a href="/ops"${activeHistory}>Ledger</a>
      <a href="${escapeAttr(forensicsHref)}"${activeDetail}>Forensics</a>
    </nav>
    <div class="top-actions">
      <span class="environment-badge">${escapeHtml(input.environment)}</span>
      <span class="updated-text">Updated <span data-updated-ago data-updated-at="${escapeAttr(input.updatedAt)}">${escapeHtml(formatRelativeTime(input.updatedAt))}</span></span>
      <button class="button button-secondary button-quiet" type="button" data-refresh-button>Refresh</button>
      <button class="button button-secondary button-quiet" type="button" data-print-button>Print</button>
      <span class="operator-chip mono" title="${escapeAttr(input.operatorLogin)}">${escapeHtml(shortValue(input.operatorLogin, 20, 8))}</span>
      <form class="logout-form" method="post" action="/ops/logout">
        <input type="hidden" name="csrf_token" value="${escapeAttr(input.csrfToken)}">
        <button class="button button-secondary button-quiet" type="submit">Sign out</button>
      </form>
    </div>
  </div>
</header>
<main id="main" class="ops-frame">
  <section class="page-heading" aria-label="Page summary">
    <div>
      <h1>${escapeHtml(input.title)}</h1>
      <p>${escapeHtml(input.subtitle)}</p>
    </div>
  </section>
  ${input.body}
</main>
<div class="toast-region" aria-live="polite" aria-atomic="true" data-toast-region></div>
<script>${OPS_DASHBOARD_SCRIPT}</script>
</body>
</html>`;
}

function renderMetricCards(metrics: OpsDashboardMetric[]): string {
  return `<section class="metric-bar" data-refresh-fragment="metrics" aria-label="Operational metrics">
${metrics
  .map(
    (metric) =>
      `<article class="metric-item metric-${metric.tone || "default"}"><span>${escapeHtml(metric.label)}</span><strong>${escapeHtml(metric.value)}</strong><small>${escapeHtml(metric.detail)}</small></article>`,
  )
  .join("")}
</section>`;
}

function renderSourceErrors(
  sourceErrors: Partial<Record<OpsHistorySource, string>>,
): string {
  const entries = Object.entries(sourceErrors);
  if (!entries.length)
    return '<div data-refresh-fragment="source-errors"></div>';
  return `<section class="error-state" data-refresh-fragment="source-errors" role="alert">
  <div><strong>Some database sources could not be loaded.</strong><p>Available sources still rendered. Retry after checking Supabase connectivity.</p></div>
  <button class="button button-secondary" type="button" data-refresh-button>Retry</button>
  <ul>${entries.map(([source, error]) => `<li><span class="mono">${escapeHtml(source)}</span>: ${escapeHtml(error)}</li>`).join("")}</ul>
</section>`;
}

function renderControls(input: OpsDashboardRenderInput): string {
  const { filters } = input;
  const clearHref = buildOpsUrl(filters, {
    source: "",
    category: "",
    states: [],
    search: "",
    from: "",
    to: "",
    needsAttention: false,
    sort: "created_at",
    direction: "desc",
    page: 1,
    pageSize: 50,
  });

  return `<section class="controls-shell" aria-label="Ledger controls">
  <form class="ops-controls" method="get" action="/ops">
    ${tokenHiddenInput(filters.token)}
    <div class="control-grid">
      <label>
        <span>Source</span>
        <select name="source">
          <option value="">All sources</option>
          ${OPS_HISTORY_SOURCES.map((source) => `<option value="${escapeAttr(source)}"${filters.source === source ? " selected" : ""}>${escapeHtml(HISTORY_SOURCE_LABELS[source])}</option>`).join("")}
        </select>
      </label>
      <label>
        <span>Group</span>
        <select name="category">
          <option value="">All groups</option>
          <option value="active"${filters.category === "active" ? " selected" : ""}>Active</option>
          <option value="completed"${filters.category === "completed" ? " selected" : ""}>Completed</option>
          <option value="failed"${filters.category === "failed" ? " selected" : ""}>Failed</option>
        </select>
      </label>
      <label class="control-search">
        <span>Search</span>
        <input type="search" name="q" value="${escapeAttr(filters.search)}" placeholder="Reference, tx hash, key, user">
      </label>
      <label>
        <span>From</span>
        <input type="date" name="from" value="${escapeAttr(filters.from)}">
      </label>
      <label>
        <span>To</span>
        <input type="date" name="to" value="${escapeAttr(filters.to)}">
      </label>
      <label>
        <span>Rows</span>
        <select name="page_size">
          ${[25, 50, 100].map((size) => `<option value="${size}"${filters.pageSize === size ? " selected" : ""}>${size}</option>`).join("")}
        </select>
      </label>
      <label class="check-control">
        <input type="checkbox" name="needs_attention" value="1"${filters.needsAttention ? " checked" : ""}>
        <span>Needs attention</span>
      </label>
      <div class="control-actions">
        <button class="button button-primary" type="submit">Apply filters</button>
        ${filters.source || filters.category || filters.search || filters.from || filters.to || filters.needsAttention || filters.states.length || filters.pageSize !== 50 ? `<a class="button button-secondary" href="${escapeAttr(clearHref)}">Clear</a>` : ""}
      </div>
    </div>
  </form>
</section>`;
}

function sortHeader(
  label: string,
  field: string,
  filters: OpsDashboardFilters,
  align: "left" | "right" = "left",
): string {
  const active = filters.sort === field;
  const nextDir: OpsSortDirection =
    active && filters.direction === "desc" ? "asc" : "desc";
  const href = buildOpsUrl(filters, {
    sort: field,
    direction: nextDir,
    page: 1,
  });
  const marker = active
    ? filters.direction === "desc"
      ? "&darr;"
      : "&uarr;"
    : "";
  return `<th class="${align === "right" ? "align-right" : ""}" scope="col"><a class="sort-link${active ? " active" : ""}" href="${escapeAttr(href)}">${escapeHtml(label)} <span aria-hidden="true">${marker}</span></a></th>`;
}

function renderAmountChain(record: OpsHistoryRecord): string {
  const source = formatCurrency(record.source_amount, record.source_asset);
  const destination = formatCurrency(
    record.destination_amount,
    record.destination_asset,
  );
  return `<div class="amount-chain">
    <span>${source}</span>
    <span class="route-arrow" aria-hidden="true">&rarr;</span>
    <span>${destination}</span>
  </div>
  <div class="muted mono">${escapeHtml(normalizeAsset(record.source_asset) || "source")} to ${escapeHtml(normalizeAsset(record.destination_asset) || "destination")}</div>`;
}

function renderEvidenceCell(record: OpsHistoryRecord): string {
  const primary = record.transaction_hash || record.external_reference || "";
  const secondary =
    record.transaction_hash && record.external_reference
      ? record.external_reference
      : "";
  if (!primary && !secondary) return '<span class="muted">-</span>';
  return `<div class="evidence-cell">
    <span class="mono" title="${escapeAttr(primary)}">${escapeHtml(shortValue(primary, 10, 7))}</span>
    ${renderCopyButton(primary, "evidence value")}
    ${secondary ? `<span class="muted mono" title="${escapeAttr(secondary)}">${escapeHtml(shortValue(secondary, 10, 7))}</span>` : ""}
  </div>`;
}

function renderFeeCell(record: OpsHistoryRecord): string {
  if (!record.fee_amount) return '<span class="muted">-</span>';
  return `<div class="fee-cell"><span class="mono">${formatCurrency(record.fee_amount, record.fee_asset)}</span><span class="muted">${escapeHtml(record.fee_label || "app fee")}</span></div>`;
}

function renderRows(
  records: OpsHistoryRecord[],
  filters: OpsDashboardFilters,
): string {
  if (!records.length) {
    return `<tr><td colspan="5">${renderEmptyState("No transaction records match this view.", "Adjust filters, widen the date range, or clear the needs-attention quick filter.")}</td></tr>`;
  }
  const q = tokenQuery(filters.token);
  return records
    .map((record) => {
      const detailHref = record.lifecycle_transfer_id
        ? `/ops/transfers/${encodeURIComponent(record.lifecycle_transfer_id)}${q}`
        : "";
      const rowAttrs = detailHref
        ? ` tabindex="0" data-row-href="${escapeAttr(detailHref)}" aria-label="Open transfer ${escapeAttr(record.reference)}"`
        : "";
      const refContent = detailHref
        ? `<a class="mono ref-link" href="${escapeAttr(detailHref)}">${escapeHtml(record.reference)}</a>`
        : `<span class="mono ref-link">${escapeHtml(record.reference)}</span>`;
      return `<tr class="ops-row" data-row-id="${escapeAttr(record.id)}"${rowAttrs}>
      <td data-label="Reference">${refContent}</td>
      <td data-label="Status">${renderStatusPill(record.status, record.category)}</td>
      <td data-label="Route"><strong>${escapeHtml(record.kind)}</strong><div class="muted">${escapeHtml(record.route)}</div></td>
      <td data-label="Amount" class="align-right">${renderAmountChain(record)}</td>
      <td data-label="Created">${renderTime(record.created_at)}</td>
    </tr>`;
    })
    .join("");
}

function renderTable(input: OpsDashboardRenderInput): string {
  const { records, filters, pagination } = input;
  return `<section class="table-shell" data-refresh-fragment="table" aria-label="Transaction ledger" aria-busy="false">
  <div class="table-meta" data-refresh-fragment="result-count">
    <strong>${escapeHtml(String(pagination.total))}</strong>
    <span>matching records from ${escapeHtml(String(input.totalRecords))} loaded rows</span>
  </div>
  <table>
    <thead>
      <tr>
        ${sortHeader("Reference", "reference", filters)}
        ${sortHeader("Status", "status", filters)}
        ${sortHeader("Route", "kind", filters)}
        ${sortHeader("Amount", "source_amount", filters, "right")}
        ${sortHeader("Created", "created_at", filters)}
      </tr>
    </thead>
    <tbody>${renderRows(records, filters)}</tbody>
  </table>
</section>`;
}

function renderPagination(
  filters: OpsDashboardFilters,
  pagination: OpsDashboardPagination,
): string {
  const previousHref = buildOpsUrl(filters, {
    page: Math.max(1, pagination.page - 1),
  });
  const nextHref = buildOpsUrl(filters, {
    page: Math.min(pagination.totalPages, pagination.page + 1),
  });
  const previousDisabled = pagination.page <= 1;
  const nextDisabled = pagination.page >= pagination.totalPages;
  return `<nav class="pagination" aria-label="Ledger pagination" data-refresh-fragment="pagination">
    <span>Showing <strong>${escapeHtml(String(pagination.from))}-${escapeHtml(String(pagination.to))}</strong> of <strong>${escapeHtml(String(pagination.total))}</strong></span>
    <div>
      ${previousDisabled ? '<span class="button button-disabled" aria-disabled="true">Previous</span>' : `<a class="button button-secondary" href="${escapeAttr(previousHref)}">Previous</a>`}
      <span class="page-chip">Page ${escapeHtml(String(pagination.page))} / ${escapeHtml(String(pagination.totalPages))}</span>
      ${nextDisabled ? '<span class="button button-disabled" aria-disabled="true">Next</span>' : `<a class="button button-secondary" href="${escapeAttr(nextHref)}">Next</a>`}
    </div>
  </nav>`;
}

function renderEmptyState(title: string, detail: string): string {
  return `<div class="empty-state"><div class="empty-icon" aria-hidden="true"></div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(detail)}</p></div>`;
}

export function renderDashboardPage(input: OpsDashboardRenderInput): string {
  const body = `<div data-ops-dashboard-page="list">
  ${renderMetricCards(input.metrics)}
  ${renderSourceErrors(input.sourceErrors)}
  ${renderControls(input)}
  ${renderTable(input)}
  ${renderPagination(input.filters, input.pagination)}
</div>`;
  return renderPageShell({
    title: input.title,
    subtitle: input.subtitle,
    environment: input.environment,
    updatedAt: input.updatedAt,
    body,
    active: "history",
    operatorLogin: input.operatorLogin,
    csrfToken: input.csrfToken,
  });
}

export function renderDashboardErrorPage(input: {
  environment: string;
  updatedAt: string;
  error: string;
  operatorLogin: string;
  csrfToken: string;
}): string {
  const body = `<section class="error-state error-state-large" role="alert">
    <div><strong>Could not load the operations ledger.</strong><p>${escapeHtml(input.error)}</p></div>
    <a class="button button-primary" href="/ops">Retry</a>
  </section>`;
  return renderPageShell({
    title: "Ops dashboard unavailable",
    subtitle: "The dashboard could not read the protected ledger.",
    environment: input.environment,
    updatedAt: input.updatedAt,
    body,
    active: "history",
    operatorLogin: input.operatorLogin,
    csrfToken: input.csrfToken,
  });
}

function transferAmountSummary(transfer: Transfer): string {
  const items = [
    ["BRL in", formatCurrency(transfer.amount_brl_in, "BRL")],
    ["USDC settled", formatCurrency(transfer.amount_usdc_settled, "USDC")],
    ["USD out", formatCurrency(transfer.amount_usd_out_expected, "USD")],
  ];
  return `<div class="amount-summary" aria-label="Transfer amount summary">
${items.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong class="mono">${value}</strong></div>`).join("")}
</div>`;
}

function transferNetwork(transfer: Transfer, fallback: string): string {
  return String(
    transfer.stellar?.network || fallback || "testnet",
  ).toLowerCase() === "mainnet"
    ? "MAINNET"
    : "TESTNET";
}

function stellarExpertUrl(transfer: Transfer): string {
  const txHash = transfer.stellar?.tx_hash;
  if (!txHash) return "";
  const network =
    transfer.stellar?.network === "mainnet" ? "public" : "testnet";
  return `https://stellar.expert/explorer/${network}/tx/${encodeURIComponent(txHash)}`;
}

function receiptUrl(transfer: Transfer): string {
  const txHash = transfer.stellar?.tx_hash;
  return txHash ? `/api/external/receipts/${encodeURIComponent(txHash)}` : "";
}

function renderDetailHero(input: OpsTransferDetailRenderInput): string {
  const { transfer } = input;
  const network = transferNetwork(transfer, input.environment);
  return `<section id="transfer-detail" class="detail-hero">
  <div class="detail-title">
    <a class="back-link" href="/ops${tokenQuery(input.token)}">Back to ledger</a>
    <div class="detail-ref">
      <h2 class="mono">${escapeHtml(transfer.public_ref)}</h2>
      ${renderCopyButton(transfer.public_ref, "public reference")}
      ${renderStatusPill(transfer.state)}
      <span class="environment-badge">${escapeHtml(network)}</span>
    </div>
    ${transfer.failure_reason ? `<p class="failure-reason">${escapeHtml(transfer.failure_reason)}</p>` : ""}
  </div>
  ${transferAmountSummary(transfer)}
  <dl class="detail-meta">
    <div><dt>Transfer ID</dt><dd class="mono">${escapeHtml(transfer.id)}</dd></div>
    <div><dt>Created</dt><dd>${renderTime(transfer.created_at, "stack")}</dd></div>
    <div><dt>Updated</dt><dd>${renderTime(transfer.updated_at, "stack")}</dd></div>
    <div><dt>State version</dt><dd class="mono">${escapeHtml(String(transfer.state_version))}</dd></div>
  </dl>
</section>`;
}

function renderStageRail(transfer: Transfer): string {
  const activeIndex = PRIMARY_STAGES.indexOf(transfer.state);
  const failed = FAILURE_STATES.has(transfer.state);
  return `<div class="stage-rail" aria-label="Transfer lifecycle">
${PRIMARY_STAGES.map((stage, index) => {
  const done = !failed && activeIndex >= 0 && index < activeIndex;
  const active = !failed && index === activeIndex;
  const className =
    failed && index === Math.max(0, activeIndex)
      ? "failed"
      : done
        ? "done"
        : active
          ? "active"
          : "";
  return `<span class="${className}" title="${escapeAttr(STATE_LABELS[stage])}"><span class="sr-only">${escapeHtml(STATE_LABELS[stage])}</span></span>`;
}).join("")}
</div>`;
}

function syntaxHighlightJson(value: unknown): string {
  const escaped = escapeHtml(JSON.stringify(value, null, 2));
  return escaped.replace(
    /(&quot;(?:\\.|[^\\])*?&quot;)(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match, stringToken: string, colon: string) => {
      if (stringToken) {
        return colon
          ? `<span class="json-key">${stringToken}</span>${colon}`
          : `<span class="json-string">${stringToken}</span>`;
      }
      if (/true|false/.test(match))
        return `<span class="json-boolean">${match}</span>`;
      if (/null/.test(match)) return `<span class="json-null">${match}</span>`;
      return `<span class="json-number">${match}</span>`;
    },
  );
}

function renderJsonBlock(value: unknown, id: string): string {
  const raw = JSON.stringify(value, null, 2);
  return `<div class="json-block">
    <div class="json-toolbar"><span>JSON</span>${renderCopyButton(raw, "JSON")}</div>
    <pre id="${escapeAttr(id)}"><code>${syntaxHighlightJson(value)}</code></pre>
  </div>`;
}

function eventTone(
  event: TransferEvent,
  transfer: Transfer,
  index: number,
  events: TransferEvent[],
): string {
  if (FAILURE_STATES.has(event.to_state) || event.event_type === "failed")
    return "attention";
  const latestEvent = events[events.length - 1];
  if (
    latestEvent?.id === event.id &&
    event.to_state === transfer.state &&
    !FAILURE_STATES.has(transfer.state)
  )
    return "active";
  return "success";
}

function renderTimeline(input: OpsTransferDetailRenderInput): string {
  const { transfer, events } = input;
  if (!events.length) {
    return `<section class="panel timeline-panel"><h2>Lifecycle timeline</h2>${renderStageRail(transfer)}${renderEmptyState("No lifecycle events recorded.", "The transfer record exists, but transfer_events has no entries yet.")}</section>`;
  }

  return `<section class="panel timeline-panel">
  <h2>Lifecycle timeline</h2>
  ${renderStageRail(transfer)}
  <ol class="timeline" aria-label="Transfer lifecycle events">
    ${events
      .map((event, index) => {
        const tone = eventTone(event, transfer, index, events);
        const from = event.from_state
          ? STATE_LABELS[event.from_state] || event.from_state
          : "Start";
        const to = STATE_LABELS[event.to_state] || event.to_state;
        return `<li class="timeline-event timeline-${tone}">
        <div class="timeline-node" aria-hidden="true"></div>
        <article>
          <header>
            <div>
              <strong>${escapeHtml(from)} <span aria-hidden="true">&rarr;</span> ${escapeHtml(to)}</strong>
              <span class="muted mono">${escapeHtml(event.event_type)}</span>
            </div>
            <div class="timeline-meta">${renderTime(event.created_at, "stack")}</div>
          </header>
          <div class="event-chips">${renderBadge(event.actor)}${event.correlation_id ? renderBadge(shortValue(event.correlation_id, 8, 5)) : ""}</div>
          <details>
            <summary>Payload</summary>
            ${renderJsonBlock(event.payload || {}, `event-${escapeAttr(event.id)}-payload`)}
          </details>
        </article>
      </li>`;
      })
      .join("")}
  </ol>
</section>`;
}

function renderReconciliation(transfer: Transfer): string {
  const rec = transfer.reconciliation;
  const discrepancies = rec?.discrepancies || [];
  const fees = rec?.fees_total || transfer.quote?.fee_breakdown || [];
  const passed = Boolean(rec?.amounts_match && discrepancies.length === 0);
  return `<section class="panel">
  <h2>Reconciliation</h2>
  <div class="reconciliation-banner ${passed ? "reconciliation-pass" : "reconciliation-fail"}">
    <strong>${passed ? "Amounts matched" : "Review required"}</strong>
    <span>${passed ? "No discrepancies recorded." : "Mismatch, missing reconciliation, or discrepancy detected."}</span>
  </div>
  <dl class="kv-list">
    <div><dt>Amounts match</dt><dd>${rec?.amounts_match ? "Yes" : "No"}</dd></div>
    <div><dt>Reconciled by</dt><dd>${escapeHtml(rec?.reconciled_by || "-")}</dd></div>
    <div><dt>Reconciled at</dt><dd>${renderTime(rec?.reconciled_at, "stack")}</dd></div>
  </dl>
  <div class="fee-table" role="table" aria-label="Fee breakdown">
    <div role="row" class="fee-heading"><span role="columnheader">Fee</span><span role="columnheader">Amount</span></div>
    ${fees.length ? fees.map((fee) => `<div role="row"><span role="cell">${escapeHtml(fee.label || "fee")}</span><span role="cell" class="mono">${formatCurrency(fee.amount, fee.currency)}</span></div>`).join("") : '<div role="row"><span role="cell" class="muted">No fees recorded</span><span role="cell">-</span></div>'}
  </div>
  <div class="discrepancies">
    <strong>Discrepancies</strong>
    ${discrepancies.length ? `<ul>${discrepancies.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : '<p class="muted">None</p>'}
  </div>
</section>`;
}

function renderEvidencePanel(transfer: Transfer, environment: string): string {
  const txUrl = stellarExpertUrl(transfer);
  const receipt = receiptUrl(transfer);
  const network = transferNetwork(transfer, environment);
  return `<section class="panel">
  <h2>Evidence and links</h2>
  <dl class="evidence-list">
    <div><dt>Stellar tx</dt><dd><span class="mono">${escapeHtml(shortValue(transfer.stellar?.tx_hash, 12, 8))}</span>${renderCopyButton(transfer.stellar?.tx_hash, "Stellar transaction hash")}${renderExternalLink(txUrl, `stellar.expert ${network.toLowerCase()}`)}</dd></div>
    <div><dt>PIX e2e id</dt><dd><span class="mono">${escapeHtml(transfer.pix?.e2e_id || transfer.pix?.txid || "-")}</span>${renderCopyButton(transfer.pix?.e2e_id || transfer.pix?.txid, "PIX evidence id")}</dd></div>
    <div><dt>PIX charge</dt><dd><span class="mono">${escapeHtml(transfer.pix?.charge_id || "-")}</span>${renderCopyButton(transfer.pix?.charge_id, "PIX charge id")}</dd></div>
    <div><dt>Payout reference</dt><dd><span class="mono">${escapeHtml(transfer.payout?.reference_id || transfer.payout?.routing_status || "-")}</span>${renderCopyButton(transfer.payout?.reference_id || transfer.payout?.routing_status, "payout reference")}</dd></div>
    <div><dt>Receipt</dt><dd>${receipt ? renderExternalLink(receipt, "receipt") : '<span class="muted">No receipt link available</span>'}</dd></div>
  </dl>
</section>`;
}

function renderRawTransfer(
  transfer: Transfer,
  events: TransferEvent[],
): string {
  return `<section class="panel raw-panel">
  <details>
    <summary><span>Raw Transfer Record</span><span class="muted">Collapsed by default</span></summary>
    ${renderJsonBlock({ ...transfer, events }, "raw-transfer-record")}
  </details>
</section>`;
}

export function renderTransferDetailPage(
  input: OpsTransferDetailRenderInput,
): string {
  const { transfer, events } = input;
  const body = `${renderDetailHero(input)}
  <div class="detail-layout">
    ${renderTimeline(input)}
    <aside class="side-panels">
      ${renderReconciliation(transfer)}
      ${renderEvidencePanel(transfer, input.environment)}
    </aside>
  </div>
  ${renderRawTransfer(transfer, events)}`;
  return renderPageShell({
    title: `${transfer.public_ref} forensics`,
    subtitle:
      "Lifecycle events, reconciliation, and immutable evidence for one transfer.",
    environment: transferNetwork(transfer, input.environment),
    updatedAt: input.updatedAt,
    body,
    active: "detail",
    operatorLogin: input.operatorLogin,
    csrfToken: input.csrfToken,
  });
}

export function renderOpsLoginPage(input: {
  title: string;
  environment: string;
  csrfToken: string;
  returnTo: string;
  login?: string;
  error?: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<style>${OPS_DASHBOARD_CSS}</style>
</head>
<body class="login-body">
<main class="login-frame" aria-label="Ops login">
  <section class="login-panel">
    <div class="login-brand">
      ${renderBrandMark()}
      <div>
        <span class="environment-badge">${escapeHtml(input.environment)}</span>
        <h1>Transfers console</h1>
        <p>Sign in to review transfer status, payout progress, and reconciliation evidence.</p>
      </div>
    </div>
    ${input.error ? `<div class="login-error" role="alert">${escapeHtml(input.error)}</div>` : ""}
    <form class="login-form" method="post" action="/ops/login" autocomplete="off">
      <input type="hidden" name="csrf_token" value="${escapeAttr(input.csrfToken)}">
      <input type="hidden" name="return_to" value="${escapeAttr(input.returnTo || "/ops")}">
      <label>
        <span>Operator email</span>
        <input name="login" value="${escapeAttr(input.login || "")}" autocomplete="username" inputmode="email" required autofocus>
      </label>
      <label>
        <span>Password</span>
        <input name="password" type="password" autocomplete="current-password" required>
      </label>
      <button class="button button-primary" type="submit">Open transfers</button>
    </form>
    <p class="login-footnote">For authorized transfer operators. Use this console to follow live transfers from intake to payout.</p>
  </section>
</main>
</body>
</html>`;
}

const OPS_DASHBOARD_CSS = `
:root {
  color-scheme: dark;
  --ops-bg: #06070a;
  --ops-bg-raised: #090b0f;
  --ops-surface: #0d1117;
  --ops-surface-2: #111821;
  --ops-surface-3: #16202c;
  --ops-text: #f4f6f8;
  --ops-text-soft: #d9dee7;
  --ops-muted: #8b949e;
  --ops-border: rgba(255, 255, 255, 0.1);
  --ops-border-strong: rgba(255, 255, 255, 0.16);
  --ops-gold: #c8aa68;
  --ops-gold-light: #dcc78d;
  --ops-blue: #7bb7ff;
  --ops-amber: #f2b84b;
  --ops-green: #54d69a;
  --ops-red: #ef7777;
  --ops-shadow: 0 1px 0 rgba(255, 255, 255, 0.065) inset, 0 18px 44px rgba(0, 0, 0, 0.34);
  --ops-shadow-hover: 0 1px 0 rgba(255, 255, 255, 0.085) inset, 0 24px 60px rgba(0, 0, 0, 0.42);
  --ops-radius: 8px;
  --ops-radius-sm: 6px;
  --ops-space-1: 4px;
  --ops-space-2: 8px;
  --ops-space-3: 12px;
  --ops-space-4: 16px;
  --ops-space-5: 20px;
  --ops-space-6: 24px;
  --ops-space-8: 32px;
  --ops-font-sans: "Geist", Aptos, "Segoe UI", sans-serif;
  --ops-font-mono: "Geist Mono", "Iosevka", Consolas, monospace;
  --ops-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
}
* { box-sizing: border-box; min-width: 0; }
html { min-height: 100%; background: var(--ops-bg); }
body {
  min-height: 100vh;
  margin: 0;
  background: var(--ops-bg);
  color: var(--ops-text);
  font-family: var(--ops-font-sans);
  font-size: 14px;
  font-feature-settings: "tnum" 1;
  letter-spacing: 0;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
a:hover { color: var(--ops-gold-light); }
button, input, select, textarea { font: inherit; letter-spacing: 0; }
button { cursor: pointer; }
:focus-visible { outline: 2px solid var(--ops-gold-light); outline-offset: 2px; }
.skip-link {
  position: fixed;
  left: var(--ops-space-4);
  top: var(--ops-space-4);
  z-index: 100;
  transform: translateY(-160%);
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  background: var(--ops-surface-3);
  color: var(--ops-text);
  padding: var(--ops-space-2) var(--ops-space-3);
}
.skip-link:focus { transform: translateY(0); }
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.mono, code, pre, .amount-chain, .fee-cell {
  font-family: var(--ops-font-mono);
  font-feature-settings: "tnum" 1, "zero" 1;
}
.muted { color: var(--ops-muted); }
.ops-topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--ops-border);
  background: color-mix(in oklab, var(--ops-bg) 94%, black 6%);
}
.topbar-inner {
  max-width: 1360px;
  margin: 0 auto;
  padding: var(--ops-space-3) var(--ops-space-5);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ops-space-3);
}
.brand { display: inline-flex; align-items: center; gap: var(--ops-space-2); }
.brand-mark { width: 24px; height: 24px; color: var(--ops-gold-light); flex: none; }
.brand-copy { display: flex; gap: 6px; align-items: baseline; }
.brand-copy strong { font-size: 14px; }
.brand-copy span { color: var(--ops-muted); font-size: 11px; }
.top-nav {
  display: flex;
  gap: var(--ops-space-1);
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  padding: 2px;
  background: var(--ops-bg-raised);
}
.top-nav a {
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  border-radius: 4px;
  padding: 0 var(--ops-space-3);
  color: var(--ops-muted);
  font-weight: 800;
  font-size: 12px;
}
.top-nav a[aria-current="page"] { background: var(--ops-surface-2); color: var(--ops-text); }
.top-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--ops-space-2); flex-wrap: wrap; }
.updated-text { color: var(--ops-muted); font-size: 12px; font-family: var(--ops-font-mono); }
.operator-chip {
  max-width: 240px;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  padding: 0 var(--ops-space-2);
  color: var(--ops-text-soft);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.logout-form { margin: 0; display: inline-flex; }
.ops-frame {
  width: min(1360px, 100%);
  margin: 0 auto;
  padding: var(--ops-space-5);
  display: grid;
  gap: var(--ops-space-5);
}
.page-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--ops-space-4);
  border-bottom: 1px solid var(--ops-border);
  padding-bottom: var(--ops-space-4);
}
.page-heading h1 { margin: 0; font-size: 22px; line-height: 1.1; font-weight: 800; }
.page-heading p { max-width: 72ch; margin: var(--ops-space-2) 0 0; color: var(--ops-muted); line-height: 1.45; font-size: 13px; }
.button, .copy-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 30px;
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  padding: 0 var(--ops-space-2);
  background: var(--ops-surface);
  color: var(--ops-muted);
  font-weight: 800;
  font-size: 12px;
  transition: border-color 160ms var(--ops-ease), color 160ms var(--ops-ease), background-color 160ms var(--ops-ease);
}
.button:hover { border-color: var(--ops-border-strong); color: var(--ops-text); background: var(--ops-surface-2); }
.button-primary { border-color: var(--ops-gold); background: var(--ops-gold); color: var(--ops-bg); }
.button-primary:hover { border-color: var(--ops-gold-light); background: var(--ops-gold-light); color: var(--ops-bg); }
.button-quiet { min-height: 28px; background: transparent; }
.button-disabled { opacity: 0.4; cursor: not-allowed; }
.copy-button { min-height: 24px; font-size: 10px; padding: 0 var(--ops-space-1); }
.ops-badge, .page-chip {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  padding: 0 var(--ops-space-1);
  font-size: 10px;
  font-weight: 700;
  color: var(--ops-muted);
}
.ops-badge-active { border-color: color-mix(in oklab, var(--ops-amber) 38%, var(--ops-border)); color: var(--ops-amber); }
.ops-badge-success { border-color: color-mix(in oklab, var(--ops-green) 34%, var(--ops-border)); color: var(--ops-green); }
.ops-badge-attention { border-color: color-mix(in oklab, var(--ops-red) 38%, var(--ops-border)); color: var(--ops-red); }
.environment-badge {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  border: 1px solid color-mix(in oklab, var(--ops-gold) 35%, var(--ops-border));
  border-radius: var(--ops-radius-sm);
  padding: 0 var(--ops-space-1);
  font-size: 10px;
  font-weight: 700;
  color: var(--ops-gold-light);
}
.metric-bar {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: var(--ops-space-3);
}
.metric-item {
  min-height: 104px;
  display: grid;
  align-content: space-between;
  gap: var(--ops-space-2);
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  background: var(--ops-surface);
  padding: var(--ops-space-4);
  color: var(--ops-muted);
}
.metric-item span {
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
}
.metric-item strong {
  font-family: var(--ops-font-mono);
  font-size: 24px;
  line-height: 1;
  color: var(--ops-text);
}
.metric-item small {
  color: var(--ops-muted);
  font-size: 12px;
  line-height: 1.35;
}
.metric-active strong { color: var(--ops-amber); }
.metric-success strong { color: var(--ops-green); }
.metric-attention strong { color: var(--ops-red); }
.table-shell, .panel, .detail-hero, .error-state, .raw-panel {
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  background: var(--ops-surface);
}
.login-body {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: var(--ops-space-6);
  background:
    radial-gradient(circle at 16% 12%, color-mix(in oklab, var(--ops-gold) 18%, transparent), transparent 26rem),
    linear-gradient(180deg, var(--ops-bg-raised), var(--ops-bg));
}
.login-frame { width: min(100%, 460px); }
.login-panel {
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius);
  background: linear-gradient(180deg, color-mix(in oklab, var(--ops-surface) 94%, white 6%), var(--ops-surface));
  box-shadow: var(--ops-shadow);
  padding: var(--ops-space-6);
  display: grid;
  gap: var(--ops-space-5);
}
.login-brand { display: flex; gap: var(--ops-space-4); align-items: flex-start; }
.login-brand .brand-mark { width: 42px; height: 42px; }
.login-brand h1 { margin: var(--ops-space-4) 0 var(--ops-space-2); font-size: 30px; line-height: 1.1; }
.login-brand p, .login-footnote { margin: 0; color: var(--ops-muted); line-height: 1.55; }
.login-error {
  border: 1px solid color-mix(in oklab, var(--ops-red) 42%, var(--ops-border));
  border-radius: var(--ops-radius);
  background: color-mix(in oklab, var(--ops-red) 12%, var(--ops-bg));
  color: var(--ops-text);
  padding: var(--ops-space-3);
}
.login-form { display: grid; gap: var(--ops-space-4); }
.login-form label { display: grid; gap: var(--ops-space-2); color: var(--ops-muted); font-size: 12px; font-weight: 900; }
.login-form input {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius);
  background: color-mix(in oklab, var(--ops-bg) 88%, white 12%);
  color: var(--ops-text);
  padding: 0 var(--ops-space-3);
}
.controls-shell {
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  background: var(--ops-surface);
  padding: var(--ops-space-3);
}
.ops-controls { margin: 0; }
.control-grid {
  display: grid;
  grid-template-columns: minmax(140px, 0.9fr) minmax(128px, 0.8fr) minmax(240px, 1.5fr) repeat(3, minmax(112px, 0.7fr)) minmax(140px, 0.8fr) auto;
  gap: var(--ops-space-2);
  align-items: end;
}
.control-grid label {
  display: grid;
  gap: var(--ops-space-1);
}
.control-grid label > span {
  color: var(--ops-muted);
  font-size: 10px;
  font-weight: 900;
  text-transform: uppercase;
}
.control-grid input, .control-grid select {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  background: var(--ops-bg-raised);
  color: var(--ops-text);
  padding: 0 var(--ops-space-2);
  font-size: 13px;
}
.control-grid input::placeholder { color: color-mix(in oklab, var(--ops-muted) 80%, transparent); }
.check-control {
  min-height: 34px;
  display: flex !important;
  align-items: center;
  gap: var(--ops-space-2) !important;
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  background: var(--ops-bg-raised);
  padding: 0 var(--ops-space-2);
}
.check-control input {
  width: 16px;
  min-height: 16px;
  accent-color: var(--ops-gold);
}
.check-control span { text-transform: none !important; font-size: 12px !important; color: var(--ops-text-soft) !important; }
.control-actions {
  display: flex;
  align-items: center;
  gap: var(--ops-space-2);
}
.status-pill {
  display: inline-flex;
  min-height: 30px;
  align-items: center;
  justify-content: center;
  gap: var(--ops-space-2);
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  padding: 0 var(--ops-space-2);
  font-size: 12px;
  font-weight: 900;
  white-space: nowrap;
}
.status-dot { width: 8px; height: 8px; border-radius: 999px; background: currentColor; flex: none; }
.status-neutral { background: color-mix(in oklab, var(--ops-muted) 10%, transparent); border-color: color-mix(in oklab, var(--ops-muted) 28%, var(--ops-border)); color: var(--ops-muted); }
.status-info { background: color-mix(in oklab, var(--ops-blue) 12%, transparent); border-color: color-mix(in oklab, var(--ops-blue) 34%, var(--ops-border)); color: var(--ops-blue); }
.status-active { background: color-mix(in oklab, var(--ops-amber) 12%, transparent); border-color: color-mix(in oklab, var(--ops-amber) 34%, var(--ops-border)); color: var(--ops-amber); }
.status-success { background: color-mix(in oklab, var(--ops-green) 12%, transparent); border-color: color-mix(in oklab, var(--ops-green) 34%, var(--ops-border)); color: var(--ops-green); }
.status-attention { background: color-mix(in oklab, var(--ops-red) 13%, transparent); border-color: color-mix(in oklab, var(--ops-red) 38%, var(--ops-border)); color: var(--ops-red); }
.table-shell { position: relative; overflow: auto; }
.table-shell.is-loading { opacity: 0.82; }
.table-shell.is-loading::after {
  content: "Refreshing ledger";
  position: absolute;
  right: var(--ops-space-4);
  top: var(--ops-space-4);
  border: 1px solid var(--ops-border);
  border-radius: var(--ops-radius-sm);
  background: var(--ops-surface-3);
  color: var(--ops-muted);
  padding: var(--ops-space-2) var(--ops-space-3);
  font-size: 12px;
}
.table-meta {
  display: flex;
  gap: var(--ops-space-2);
  align-items: center;
  border-bottom: 1px solid var(--ops-border);
  padding: var(--ops-space-3) var(--ops-space-4);
  color: var(--ops-muted);
  background: var(--ops-bg-raised);
}
table { width: 100%; border-collapse: collapse; }
th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: color-mix(in oklab, var(--ops-surface-2) 88%, black 12%);
  color: var(--ops-muted);
  text-align: left;
  padding: var(--ops-space-3);
  border-bottom: 1px solid var(--ops-border-strong);
  font-size: 12px;
}
td { padding: var(--ops-space-3); border-bottom: 1px solid var(--ops-border); vertical-align: middle; }
tbody tr:last-child td { border-bottom: 0; }
.ops-row { transition: background-color 160ms var(--ops-ease), outline-color 160ms var(--ops-ease); }
.ops-row:hover td, .ops-row:focus td { background: color-mix(in oklab, var(--ops-surface-3) 42%, transparent); }
.ops-row[data-row-href] { cursor: pointer; }
.sort-link { display: inline-flex; gap: var(--ops-space-1); color: var(--ops-muted); }
.sort-link.active { color: var(--ops-gold-light); }
.align-right { text-align: right; }
.ref-cell, .evidence-cell, .fee-cell { display: flex; align-items: center; justify-content: flex-start; gap: var(--ops-space-2); flex-wrap: wrap; }
.align-right .amount-chain, .align-right .fee-cell { justify-content: flex-end; }
.ref-link { font-weight: 900; color: var(--ops-text); overflow-wrap: anywhere; }
.amount-chain { display: inline-flex; align-items: center; justify-content: flex-end; gap: var(--ops-space-2); white-space: nowrap; color: var(--ops-text); }
.route-arrow { color: var(--ops-muted); }
.status-source { margin-top: var(--ops-space-2); }
.time-stack { display: grid; gap: 2px; }
.time-stack span { color: var(--ops-muted); font-family: var(--ops-font-mono); font-size: 12px; }
.pagination { display: flex; align-items: center; justify-content: space-between; gap: var(--ops-space-3); flex-wrap: wrap; color: var(--ops-muted); }
.pagination > div { display: flex; align-items: center; gap: var(--ops-space-2); flex-wrap: wrap; }
.empty-state { min-height: 220px; display: grid; place-items: center; align-content: center; gap: var(--ops-space-2); text-align: center; color: var(--ops-muted); }
.empty-state strong { color: var(--ops-text); font-size: 16px; }
.empty-state p { max-width: 46ch; margin: 0; line-height: 1.55; }
.empty-icon { width: 34px; height: 34px; border: 1px solid var(--ops-border); border-radius: var(--ops-radius); background: linear-gradient(135deg, var(--ops-surface-3), var(--ops-bg)); }
.error-state { padding: var(--ops-space-4); display: grid; grid-template-columns: 1fr auto; gap: var(--ops-space-3); align-items: start; border-color: color-mix(in oklab, var(--ops-red) 45%, var(--ops-border)); }
.error-state strong { color: var(--ops-red); }
.error-state p { margin: var(--ops-space-1) 0 0; color: var(--ops-muted); }
.error-state ul { grid-column: 1 / -1; margin: 0; padding-left: var(--ops-space-5); color: var(--ops-muted); }
.error-state-large { min-height: 260px; align-content: center; }
.detail-hero { padding: var(--ops-space-5); display: grid; gap: var(--ops-space-5); }
.detail-title { display: grid; gap: var(--ops-space-3); }
.back-link { color: var(--ops-muted); font-weight: 800; width: fit-content; }
.detail-ref { display: flex; align-items: center; gap: var(--ops-space-2); flex-wrap: wrap; }
.detail-ref h2 { margin: 0; font-size: 25px; line-height: 1.15; overflow-wrap: anywhere; }
.failure-reason { margin: 0; color: var(--ops-red); }
.amount-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--ops-border); border-radius: var(--ops-radius); overflow: hidden; }
.amount-summary div { padding: var(--ops-space-4); border-right: 1px solid var(--ops-border); background: color-mix(in oklab, var(--ops-bg) 70%, var(--ops-surface) 30%); }
.amount-summary div:last-child { border-right: 0; }
.amount-summary span { display: block; color: var(--ops-muted); font-size: 12px; font-weight: 800; }
.amount-summary strong { display: block; margin-top: var(--ops-space-2); font-size: 18px; }
.detail-meta, .kv-list, .evidence-list { display: grid; gap: 0; margin: 0; }
.detail-meta { grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--ops-border); }
.detail-meta div, .kv-list div, .evidence-list div { display: grid; gap: var(--ops-space-1); padding: var(--ops-space-3) 0; border-bottom: 1px solid var(--ops-border); }
dt { color: var(--ops-muted); font-size: 12px; font-weight: 800; }
dd { margin: 0; color: var(--ops-text); overflow-wrap: anywhere; }
.detail-layout { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.65fr); gap: var(--ops-space-4); align-items: start; }
.panel { padding: var(--ops-space-4); }
.panel h2 { margin: 0 0 var(--ops-space-4); font-size: 16px; }
.side-panels { display: grid; gap: var(--ops-space-4); }
.stage-rail { display: grid; grid-template-columns: repeat(9, minmax(0, 1fr)); gap: var(--ops-space-1); margin-bottom: var(--ops-space-5); }
.stage-rail span { height: 8px; border-radius: 2px; background: var(--ops-surface-3); }
.stage-rail span.done { background: var(--ops-green); }
.stage-rail span.active { background: var(--ops-amber); box-shadow: 0 0 0 4px color-mix(in oklab, var(--ops-amber) 16%, transparent); }
.stage-rail span.failed { background: var(--ops-red); }
.timeline { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--ops-space-3); }
.timeline-event { position: relative; display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: var(--ops-space-3); }
.timeline-event::before { content: ""; position: absolute; left: 8px; top: 20px; bottom: -18px; width: 1px; background: var(--ops-border); }
.timeline-event:last-child::before { content: none; }
.timeline-node { width: 17px; height: 17px; border-radius: 999px; border: 2px solid currentColor; background: var(--ops-bg); margin-top: 15px; }
.timeline-success { color: var(--ops-green); }
.timeline-active { color: var(--ops-amber); }
.timeline-attention { color: var(--ops-red); }
.timeline-active .timeline-node { animation: opsPulse 1.8s var(--ops-ease) infinite; }
@keyframes opsPulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in oklab, currentColor 24%, transparent); } 50% { box-shadow: 0 0 0 6px color-mix(in oklab, currentColor 0%, transparent); } }
.timeline-event article { border: 1px solid var(--ops-border); border-radius: var(--ops-radius); background: color-mix(in oklab, var(--ops-bg) 72%, var(--ops-surface) 28%); padding: var(--ops-space-3); color: var(--ops-text); }
.timeline-event header { display: flex; justify-content: space-between; gap: var(--ops-space-3); }
.timeline-event header strong { display: block; color: var(--ops-text); }
.timeline-meta { text-align: right; min-width: 130px; }
.event-chips { display: flex; gap: var(--ops-space-2); flex-wrap: wrap; margin: var(--ops-space-3) 0; }
details summary { cursor: pointer; color: var(--ops-gold-light); font-weight: 800; }
.raw-panel summary { display: flex; align-items: center; justify-content: space-between; gap: var(--ops-space-3); }
.json-block { overflow: hidden; border: 1px solid var(--ops-border); border-radius: var(--ops-radius); background: var(--ops-bg); margin-top: var(--ops-space-3); }
.json-toolbar { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: var(--ops-space-3); border-bottom: 1px solid var(--ops-border); padding: 0 var(--ops-space-3); color: var(--ops-muted); font-size: 12px; font-weight: 800; }
pre { margin: 0; max-height: 520px; overflow: auto; padding: var(--ops-space-4); color: var(--ops-text-soft); font-size: 12px; line-height: 1.55; }
.json-key { color: var(--ops-blue); }
.json-string { color: var(--ops-green); }
.json-number { color: var(--ops-amber); }
.json-boolean { color: var(--ops-gold-light); }
.json-null { color: var(--ops-muted); }
.reconciliation-banner { display: grid; gap: 2px; border: 1px solid var(--ops-border); border-radius: var(--ops-radius); padding: var(--ops-space-3); margin-bottom: var(--ops-space-4); }
.reconciliation-banner span { color: var(--ops-muted); font-size: 12px; }
.reconciliation-pass { border-color: color-mix(in oklab, var(--ops-green) 38%, var(--ops-border)); color: var(--ops-green); background: color-mix(in oklab, var(--ops-green) 10%, transparent); }
.reconciliation-fail { border-color: color-mix(in oklab, var(--ops-red) 42%, var(--ops-border)); color: var(--ops-red); background: color-mix(in oklab, var(--ops-red) 10%, transparent); }
.fee-table { display: grid; margin-top: var(--ops-space-4); border: 1px solid var(--ops-border); border-radius: var(--ops-radius); overflow: hidden; }
.fee-table div { display: grid; grid-template-columns: minmax(0, 1fr) minmax(120px, auto); gap: var(--ops-space-3); padding: var(--ops-space-2) var(--ops-space-3); border-bottom: 1px solid var(--ops-border); }
.fee-table div:last-child { border-bottom: 0; }
.fee-heading { background: var(--ops-surface-2); color: var(--ops-muted); font-size: 12px; font-weight: 800; }
.fee-table span:last-child { text-align: right; }
.discrepancies { margin-top: var(--ops-space-4); }
.discrepancies ul { margin: var(--ops-space-2) 0 0; padding-left: var(--ops-space-5); color: var(--ops-red); }
.evidence-list dd { display: flex; align-items: center; gap: var(--ops-space-2); flex-wrap: wrap; }
.external-link { color: var(--ops-gold-light); font-weight: 800; }
.toast-region { position: fixed; right: var(--ops-space-4); bottom: var(--ops-space-4); z-index: 50; display: grid; gap: var(--ops-space-2); width: min(360px, calc(100vw - 32px)); }
.toast { border: 1px solid var(--ops-border); border-radius: var(--ops-radius); background: var(--ops-surface-3); color: var(--ops-text); box-shadow: var(--ops-shadow); padding: var(--ops-space-3); }
.ops-modal, .ops-drawer { border: 1px solid var(--ops-border); border-radius: var(--ops-radius); background: var(--ops-surface); color: var(--ops-text); box-shadow: var(--ops-shadow-hover); }
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: 0.01ms !important; }
}
@media print {
  :root { color-scheme: light; }
  *, *::before, *::after {
    background: transparent !important;
    color: #000 !important;
    box-shadow: none !important;
    border-color: #bbb !important;
    text-shadow: none !important;
    animation: none !important;
    transition: none !important;
  }
  body {
    font-size: 10.5px;
    line-height: 1.35;
    background: #fff !important;
    min-height: auto;
  }
  a { color: #000 !important; text-decoration: none !important; }
  .ops-topbar, .top-actions, .button, .controls-shell, .toast-region, .skip-link, .pagination, .copy-button, .logout-form, details summary, .json-toolbar, .filter-toggle, .empty-state { display: none !important; }
  .ops-frame { max-width: 100%; width: 100%; padding: 0; gap: 8px; }
  .page-heading { align-items: flex-start; }
  .page-heading h1 { font-size: 14px; margin: 0; }
  .page-heading p { margin: 2px 0 0; font-size: 9px; }
  .metric-bar { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
  .metric-item { min-height: auto; padding: 6px; font-size: 9px; border: 1px solid #bbb; }
  .metric-item strong { font-size: 12px; }
  .metric-item small { font-size: 8px; }
  .table-shell { overflow: visible; border: 1px solid #bbb; }
  .table-meta { padding: 6px 8px; font-size: 9px; }
  table { font-size: 9px; min-width: 0; width: 100%; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; }
  thead { display: table-header-group; }
  tbody tr { page-break-inside: avoid; }
  .detail-layout { grid-template-columns: 1fr; gap: 10px; }
  .detail-hero { padding: 10px; gap: 10px; border: 1px solid #bbb; }
  .detail-ref { gap: 6px; }
  .detail-ref h2 { font-size: 14px; }
  .amount-summary { grid-template-columns: repeat(3, 1fr); border: 1px solid #bbb; }
  .amount-summary div { padding: 6px 8px; border-right: 1px solid #ddd; background: #fff !important; }
  .amount-summary strong { font-size: 13px; }
  .detail-meta { grid-template-columns: repeat(4, 1fr); border-top: 1px solid #ddd; }
  .panel { padding: 8px; border: 1px solid #bbb; break-inside: avoid; background: #fff !important; }
  .panel h2 { font-size: 12px; margin: 0 0 8px; }
  .stage-rail { break-inside: avoid; margin-bottom: 10px; }
  .stage-rail span { height: 6px; border: 1px solid #bbb; }
  .timeline { gap: 8px; }
  .timeline-event { gap: 8px; page-break-inside: avoid; }
  .timeline-event article { border: 1px solid #bbb; padding: 6px; background: #fff !important; }
  .timeline-node { width: 12px; height: 12px; margin-top: 4px; border-width: 2px; }
  .timeline-event::before { left: 6px; top: 16px; bottom: -12px; }
  .event-chips { margin: 6px 0; }
  .reconciliation-banner { border: 1px solid #bbb; padding: 6px; margin-bottom: 8px; }
  .fee-table { border: 1px solid #bbb; margin-top: 8px; }
  .fee-table div { padding: 4px 6px; }
  .discrepancies { margin-top: 8px; }
  .evidence-list div { border-bottom: 1px solid #ddd; padding: 4px 0; }
  .back-link { display: none; }
  .side-panels { break-inside: avoid; }
  .raw-panel { display: none !important; }
  .json-block { border: 1px solid #bbb; }
  pre { max-height: none; padding: 6px; font-size: 8px; }
  .status-pill { border: 1px solid #bbb; padding: 2px 5px; }
  .ops-badge { border: 1px solid #bbb; }
  @page { margin: 10mm; size: A4 landscape; }
}
@media (max-width: 1120px) {
  .detail-layout { grid-template-columns: 1fr; }
  .topbar-inner { align-items: flex-start; flex-wrap: wrap; }
  .top-actions { width: 100%; justify-content: flex-start; }
  .metric-bar { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .control-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .control-search { grid-column: span 2; }
}
@media (max-width: 760px) {
  .ops-frame { padding: var(--ops-space-3); }
  .page-heading { display: grid; }
  .metric-bar { grid-template-columns: 1fr; gap: var(--ops-space-2); }
  .metric-item { min-height: 84px; }
  .control-grid { grid-template-columns: 1fr; }
  .control-search { grid-column: auto; }
  .control-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .control-actions .button { width: 100%; }
  .top-nav { order: 3; width: 100%; }
  .top-nav a { flex: 1; justify-content: center; }
  .brand-copy span { display: none; }
  .operator-chip { max-width: 100%; }
  .amount-summary div { border-right: 0; border-bottom: 1px solid var(--ops-border); }
  .amount-summary div:last-child { border-bottom: 0; }
  .table-shell { overflow: visible; background: transparent; border: 0; box-shadow: none; }
  .table-meta { border: 1px solid var(--ops-border); border-radius: var(--ops-radius); background: var(--ops-surface); margin-bottom: var(--ops-space-3); }
  table, thead, tbody, tr, th, td { display: block; min-width: 0; width: 100%; }
  thead { display: none; }
  tbody { display: grid; gap: var(--ops-space-3); }
  .ops-row { border: 1px solid var(--ops-border); border-radius: var(--ops-radius); background: var(--ops-surface); box-shadow: var(--ops-shadow); padding: var(--ops-space-2); }
  td { display: grid; grid-template-columns: minmax(96px, 34%) minmax(0, 1fr); gap: var(--ops-space-3); border-bottom: 1px solid var(--ops-border); padding: var(--ops-space-3) var(--ops-space-2); text-align: left !important; }
  td:last-child { border-bottom: 0; }
  td::before { content: attr(data-label); color: var(--ops-muted); font-size: 12px; font-weight: 800; }
  .align-right .amount-chain, .align-right .fee-cell { justify-content: flex-start; }
  .amount-chain { white-space: normal; flex-wrap: wrap; }
  .timeline-event header { display: grid; }
  .timeline-meta { text-align: left; min-width: 0; }
  .pagination { display: grid; }
}
`;

const OPS_DASHBOARD_SCRIPT = `
(function () {
  var updatedAt = Date.now();
  function relativeTime(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value || '-');
    var diff = Date.now() - date.getTime();
    var future = diff < 0;
    var seconds = Math.max(0, Math.round(Math.abs(diff) / 1000));
    var units = [[2592000, 'mo'], [86400, 'd'], [3600, 'h'], [60, 'm']];
    for (var i = 0; i < units.length; i += 1) {
      if (seconds >= units[i][0]) {
        var amount = Math.floor(seconds / units[i][0]);
        return future ? 'in ' + amount + units[i][1] : amount + units[i][1] + ' ago';
      }
    }
    return future ? 'in seconds' : 'just now';
  }
  function updateTimes() {
    document.querySelectorAll('[data-relative-time]').forEach(function (node) {
      node.textContent = relativeTime(node.getAttribute('data-relative-time'));
    });
    document.querySelectorAll('[data-updated-ago]').forEach(function (node) {
      node.textContent = relativeTime(node.getAttribute('data-updated-at') || updatedAt);
    });
  }
  function toast(message) {
    var region = document.querySelector('[data-toast-region]');
    if (!region) return;
    var item = document.createElement('div');
    item.className = 'toast';
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(function () { item.remove(); }, 2600);
  }
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var copyButton = target.closest('[data-copy-value]');
    if (copyButton) {
      event.preventDefault();
      var value = copyButton.getAttribute('data-copy-value') || '';
      navigator.clipboard.writeText(value).then(function () { toast('Copied to clipboard'); }).catch(function () { toast('Copy failed'); });
      return;
    }
    var printButton = target.closest('[data-print-button]');
    if (printButton) {
      event.preventDefault();
      window.print();
      return;
    }
    var row = target.closest('[data-row-href]');
    if (row && !target.closest('a, button, input, select, label, summary, details')) {
      window.location.href = row.getAttribute('data-row-href') || '#';
    }
  });
  document.addEventListener('keydown', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var row = target.closest('[data-row-href]');
    if (row && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      window.location.href = row.getAttribute('data-row-href') || '#';
    }
  });
  async function refreshFragments(manual) {
    var page = document.querySelector('[data-ops-dashboard-page="list"]');
    if (!page) {
      if (manual) window.location.reload();
      return;
    }
    var table = document.querySelector('[data-refresh-fragment="table"]');
    if (table) table.classList.add('is-loading');
    try {
      var response = await fetch(window.location.href, { headers: { 'Accept': 'text/html', 'X-Ops-Refresh': '1' }, cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var html = await response.text();
      var doc = new DOMParser().parseFromString(html, 'text/html');
      ['metrics', 'source-errors', 'table', 'pagination', 'result-count'].forEach(function (name) {
        var current = document.querySelector('[data-refresh-fragment="' + name + '"]');
        var next = doc.querySelector('[data-refresh-fragment="' + name + '"]');
        if (current && next) current.replaceWith(next);
      });
      updatedAt = Date.now();
      document.querySelectorAll('[data-updated-ago]').forEach(function (node) {
        node.setAttribute('data-updated-at', new Date(updatedAt).toISOString());
      });
      updateTimes();
      if (manual) toast('Dashboard refreshed');
    } catch (error) {
      toast('Refresh failed');
    } finally {
      document.querySelectorAll('[data-refresh-fragment="table"]').forEach(function (node) { node.classList.remove('is-loading'); });
    }
  }
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var button = target.closest('[data-refresh-button]');
    if (!button) return;
    event.preventDefault();
    refreshFragments(true);
  });
  updateTimes();
  window.setInterval(updateTimes, 30000);
  if (document.querySelector('[data-ops-dashboard-page="list"]')) {
    window.setInterval(function () { refreshFragments(false); }, 30000);
  }
})();
`;
