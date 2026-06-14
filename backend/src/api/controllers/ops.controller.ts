/**
 * Operational dashboard controller for the PIX-to-Stellar lifecycle engine.
 *
 * The HTML dashboard is read-only. It can add presentation metadata and
 * normalized ledger fields, but transfer state changes stay in the orchestrator.
 */

import { Request, Response } from 'express';
import {
  OPS_HISTORY_SOURCES,
  OpsHistoryCategory,
  OpsHistoryRecord,
  OpsHistorySource,
  opsHistoryRepository,
} from '../repository/ops-history.repository';
import { transferRepository } from '../repository/transfer.repository';
import { orchestrator } from '../../orchestration/TransferOrchestrator';
import { isProductionLikeEnvironment } from '../../config/runtime';
import {
  OpsDashboardFilters,
  OpsDashboardMetric,
  OpsDashboardPagination,
  OpsSortDirection,
  renderDashboardErrorPage,
  renderDashboardPage,
  renderTransferDetailPage,
} from '../views/ops-dashboard.view';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const STUCK_ACTIVE_MS = 2 * 60 * 60 * 1000;
const SORT_FIELDS = new Set([
  'reference',
  'status',
  'kind',
  'source_amount',
  'fee_amount',
  'created_at',
  'updated_at',
]);

function configuredOpsToken(): string {
  const configured = String(process.env.OPS_DASHBOARD_TOKEN || process.env.TRANSFER_API_TOKEN || '').trim();
  if (configured) return configured;
  return isProductionLikeEnvironment() ? '' : 'dev-ops-token';
}

function readBearerToken(req: Request): string {
  const auth = String(req.headers.authorization || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function checkAuth(req: Request, res: Response): boolean {
  const expected = configuredOpsToken();
  if (!expected) {
    res.status(503).json({ error: 'OPS_DASHBOARD_TOKEN or TRANSFER_API_TOKEN must be set before using /ops.' });
    return false;
  }
  const token = String(
    readBearerToken(req) ||
      req.query.token ||
      req.headers['x-ops-token'] ||
      req.headers['x-api-key'] ||
      ''
  ).trim();

  if (token !== expected) {
    res.status(401).json({ error: 'Unauthorized. Provide Authorization: Bearer <token>, X-Ops-Token, X-Api-Key, or ?token=.' });
    return false;
  }
  return true;
}

function queryString(value: unknown): string {
  if (Array.isArray(value)) return queryString(value[0]);
  return typeof value === 'string' ? value.trim() : '';
}

function queryValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => queryValues(item));
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeSource(value: string): OpsHistorySource | '' {
  return (OPS_HISTORY_SOURCES as readonly string[]).includes(value) ? value as OpsHistorySource : '';
}

function normalizeCategory(value: string): OpsHistoryCategory | '' {
  return ['active', 'completed', 'failed'].includes(value) ? value as OpsHistoryCategory : '';
}

function normalizeDirection(value: string): OpsSortDirection {
  return value.toLowerCase() === 'asc' ? 'asc' : 'desc';
}

function normalizeSort(value: string): string {
  return SORT_FIELDS.has(value) ? value : 'created_at';
}

function readBoolean(value: unknown): boolean {
  const normalized = queryString(value).toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function readPositiveInt(value: unknown, fallback: number): number {
  const parsed = parseInt(queryString(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampPageSize(value: unknown): number {
  const parsed = readPositiveInt(value, DEFAULT_PAGE_SIZE);
  return Math.min(Math.max(parsed, 1), MAX_PAGE_SIZE);
}

function dashboardEnvironment(): string {
  const configured = String(process.env.STELLAR_NETWORK || process.env.NEXT_PUBLIC_STELLAR_NETWORK || 'testnet').toLowerCase();
  return configured === 'mainnet' || configured === 'public' ? 'MAINNET' : 'TESTNET';
}

function tokenFromRequest(req: Request): string {
  return queryString(req.query.token);
}

function dashboardFilters(req: Request): OpsDashboardFilters {
  const statusAlias = queryString(req.query.status);
  const states = [
    ...queryValues(req.query.state),
    ...(statusAlias ? [statusAlias] : []),
  ];
  const pageSize = clampPageSize(req.query.page_size || req.query.pageSize);
  return {
    token: tokenFromRequest(req),
    source: normalizeSource(queryString(req.query.source)),
    category: normalizeCategory(queryString(req.query.category)),
    states: [...new Set(states.map((state) => state.toUpperCase()))],
    search: queryString(req.query.q || req.query.search),
    from: queryString(req.query.from),
    to: queryString(req.query.to),
    needsAttention: readBoolean(req.query.needs_attention || req.query.needsAttention),
    sort: normalizeSort(queryString(req.query.sort)),
    direction: normalizeDirection(queryString(req.query.dir || req.query.direction)),
    page: readPositiveInt(req.query.page, 1),
    pageSize,
  };
}

function parseDateBoundary(value: string, endOfDay = false): number | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const parsed = Date.parse(`${value}${suffix}`);
    return Number.isNaN(parsed) ? null : parsed;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function dateInRange(value: string, from: string, to: string): boolean {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;
  const fromTime = parseDateBoundary(from);
  const toTime = parseDateBoundary(to, true);
  if (fromTime !== null && timestamp < fromTime) return false;
  if (toTime !== null && timestamp > toTime) return false;
  return true;
}

function recordNeedsAttention(record: OpsHistoryRecord): boolean {
  const status = record.status.toUpperCase();
  if (record.category === 'failed') return true;
  if (/FAIL|ERROR|EXPIRED|REFUND|CANCEL|DISCREP/.test(status)) return true;
  const updatedAt = Date.parse(record.updated_at || record.created_at);
  return record.category === 'active' && Number.isFinite(updatedAt) && Date.now() - updatedAt > STUCK_ACTIVE_MS;
}

function recordMatchesSearch(record: OpsHistoryRecord, search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  const haystack = [
    record.id,
    record.reference,
    record.source_record_id,
    record.lifecycle_transfer_id,
    record.kind,
    record.status,
    record.route,
    record.transaction_hash,
    record.external_reference,
    record.user_id,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(needle);
}

function applyDashboardFilters(records: OpsHistoryRecord[], filters: OpsDashboardFilters): OpsHistoryRecord[] {
  const stateSet = new Set(filters.states.map((state) => state.toUpperCase()));
  return records.filter((record) => {
    if (filters.category && record.category !== filters.category) return false;
    if (stateSet.size && !stateSet.has(record.status.toUpperCase())) return false;
    if (!dateInRange(record.created_at, filters.from, filters.to)) return false;
    if (filters.needsAttention && !recordNeedsAttention(record)) return false;
    if (!recordMatchesSearch(record, filters.search)) return false;
    return true;
  });
}

function numericValue(value: string | null | undefined): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortValue(record: OpsHistoryRecord, field: string): string | number {
  if (field === 'source_amount') return numericValue(record.source_amount);
  if (field === 'fee_amount') return numericValue(record.fee_amount);
  if (field === 'created_at' || field === 'updated_at') {
    const parsed = Date.parse(record[field]);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (field === 'reference') return record.reference.toLowerCase();
  if (field === 'status') return record.status.toLowerCase();
  if (field === 'kind') return record.kind.toLowerCase();
  return record.created_at;
}

function sortRecords(records: OpsHistoryRecord[], filters: OpsDashboardFilters): OpsHistoryRecord[] {
  const direction = filters.direction === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    const left = sortValue(a, filters.sort);
    const right = sortValue(b, filters.sort);
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    return String(left).localeCompare(String(right)) * direction;
  });
}

function buildPagination(records: OpsHistoryRecord[], filters: OpsDashboardFilters): {
  pagination: OpsDashboardPagination;
  pageRecords: OpsHistoryRecord[];
} {
  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(Math.max(filters.page, 1), totalPages);
  const start = (page - 1) * filters.pageSize;
  const end = Math.min(start + filters.pageSize, total);
  return {
    pagination: {
      page,
      pageSize: filters.pageSize,
      total,
      totalPages,
      from: total === 0 ? 0 : start + 1,
      to: end,
    },
    pageRecords: records.slice(start, end),
  };
}

function decimalToScale(value: string | null | undefined, scale = 6): bigint {
  const text = String(value || '').trim().replace(',', '.');
  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return 0n;
  const sign = match[1] === '-' ? -1n : 1n;
  const integer = BigInt(match[2] || '0');
  const fraction = String(match[3] || '').slice(0, scale).padEnd(scale, '0');
  return sign * (integer * (10n ** BigInt(scale)) + BigInt(fraction || '0'));
}

function groupInteger(value: string): string {
  const sign = value.startsWith('-') ? '-' : '';
  const digits = sign ? value.slice(1) : value;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

function formatScaled(value: bigint, scale = 6, decimals = 2): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  const base = 10n ** BigInt(scale);
  const integer = absolute / base;
  const fraction = (absolute % base).toString().padStart(scale, '0').slice(0, decimals).padEnd(decimals, '0');
  return `${sign}${groupInteger(integer.toString())}.${fraction}`;
}

function metricCurrency(value: bigint, asset: string): string {
  const normalized = asset.toUpperCase();
  if (normalized === 'BRL') return `R$ ${formatScaled(value, 6, 2)}`;
  if (normalized === 'USD') return `US$ ${formatScaled(value, 6, 2)}`;
  if (normalized === 'USDC') return `USDC ${formatScaled(value, 6, 2)}`;
  return `${normalized} ${formatScaled(value, 6, 2)}`;
}

function isSameLocalDate(value: string, offsetDays = 0): boolean {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const target = new Date();
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + offsetDays);
  const next = new Date(target);
  next.setDate(target.getDate() + 1);
  return date.getTime() >= target.getTime() && date.getTime() < next.getTime();
}

function amountSum(records: OpsHistoryRecord[], pick: (record: OpsHistoryRecord) => string | null | undefined): bigint {
  return records.reduce((total, record) => total + decimalToScale(pick(record)), 0n);
}

function signedCountDelta(current: number, previous: number): string {
  if (previous === 0 && current === 0) return 'flat vs yesterday';
  const diff = current - previous;
  return `${diff >= 0 ? '+' : ''}${diff} vs yesterday`;
}

function feeMetric(records: OpsHistoryRecord[]): { value: string; detail: string } {
  const feesByAsset = new Map<string, bigint>();
  let feeRows = 0;
  for (const record of records) {
    if (!record.fee_amount) continue;
    const asset = String(record.fee_asset || 'BRL').toUpperCase();
    feesByAsset.set(asset, (feesByAsset.get(asset) || 0n) + decimalToScale(record.fee_amount));
    feeRows += 1;
  }
  const preferredAsset = feesByAsset.has('BRL') ? 'BRL' : [...feesByAsset.keys()][0];
  if (!preferredAsset) return { value: 'R$ 0.00', detail: 'No read-only fee fields loaded' };
  const extraAssets = [...feesByAsset.keys()].filter((asset) => asset !== preferredAsset).length;
  return {
    value: metricCurrency(feesByAsset.get(preferredAsset) || 0n, preferredAsset),
    detail: `${feeRows} fee rows${extraAssets ? `, ${extraAssets} other assets not converted` : ''}`,
  };
}

function dashboardMetrics(records: OpsHistoryRecord[]): OpsDashboardMetric[] {
  const today = records.filter((record) => isSameLocalDate(record.created_at));
  const yesterday = records.filter((record) => isSameLocalDate(record.created_at, -1));
  const todayBrlToUsdc = today.filter((record) =>
    String(record.source_asset || '').toUpperCase() === 'BRL' &&
    String(record.destination_asset || '').toUpperCase() === 'USDC'
  );
  const yesterdayBrlToUsdc = yesterday.filter((record) =>
    String(record.source_asset || '').toUpperCase() === 'BRL' &&
    String(record.destination_asset || '').toUpperCase() === 'USDC'
  );
  const volumeToday = amountSum(todayBrlToUsdc, (record) => record.source_amount);
  const volumeYesterday = amountSum(yesterdayBrlToUsdc, (record) => record.source_amount);
  const volumeDiff = volumeToday - volumeYesterday;
  const inFlight = records.filter((record) => record.category === 'active').length;
  const attention = records.filter(recordNeedsAttention).length;
  const fees = feeMetric(records);

  return [
    {
      label: 'Transfers today',
      value: String(today.length),
      detail: signedCountDelta(today.length, yesterday.length),
    },
    {
      label: 'BRL to USDC today',
      value: metricCurrency(volumeToday, 'BRL'),
      detail: `${volumeDiff >= 0n ? '+' : ''}${metricCurrency(volumeDiff, 'BRL')} vs yesterday`,
      tone: 'success',
    },
    {
      label: 'In flight',
      value: String(inFlight),
      detail: 'Active or pending ledger records',
      tone: 'active',
    },
    {
      label: 'Needs attention',
      value: String(attention),
      detail: 'Failed, discrepant, expired, refund, or stuck',
      tone: attention ? 'attention' : 'default',
    },
    {
      label: 'Admin fees',
      value: fees.value,
      detail: fees.detail,
      tone: 'success',
    },
  ];
}

function allStatuses(records: OpsHistoryRecord[]): string[] {
  const byUppercase = new Map<string, string>();
  for (const record of records) {
    const status = record.status.trim();
    if (!status) continue;
    byUppercase.set(status.toUpperCase(), status.toUpperCase());
  }
  return [...byUppercase.values()].sort((a, b) => a.localeCompare(b));
}

export class OpsController {
  async dashboard(req: Request, res: Response): Promise<void> {
    if (!checkAuth(req, res)) return;

    const filters = dashboardFilters(req);
    const updatedAt = new Date().toISOString();

    try {
      const history = await opsHistoryRepository.list({
        source: filters.source || undefined,
      });
      const filtered = applyDashboardFilters(history.records, filters);
      const sorted = sortRecords(filtered, filters);
      const { pagination, pageRecords } = buildPagination(sorted, filters);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderDashboardPage({
        title: 'Ops dashboard',
        subtitle: 'Unified payment ledger across lifecycle transfers, international transfers, operations, and payment logs.',
        environment: dashboardEnvironment(),
        updatedAt,
        records: pageRecords,
        totalRecords: history.records.length,
        allStatuses: allStatuses(history.records),
        filters: {
          ...filters,
          page: pagination.page,
        },
        metrics: dashboardMetrics(history.records),
        pagination,
        sourceErrors: history.source_errors,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderDashboardErrorPage({
        token: filters.token,
        environment: dashboardEnvironment(),
        updatedAt,
        error: message,
      }));
    }
  }

  async transferDetail(req: Request, res: Response): Promise<void> {
    if (!checkAuth(req, res)) return;

    const { transfer, events } = await orchestrator.getTransferWithEvents(req.params.id);
    const sortedEvents = [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderTransferDetailPage({
      transfer,
      events: sortedEvents,
      token: tokenFromRequest(req),
      environment: dashboardEnvironment(),
      updatedAt: new Date().toISOString(),
    }));
  }

  async apiListTransfers(req: Request, res: Response): Promise<void> {
    if (!checkAuth(req, res)) return;
    const state = req.query.state ? String(req.query.state) : undefined;
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const transfers = await transferRepository.list({ state, limit });
    const total = await transferRepository.count(state ? { state } : undefined);
    res.json({ success: true, total, count: transfers.length, transfers });
  }

  async apiListHistory(req: Request, res: Response): Promise<void> {
    if (!checkAuth(req, res)) return;
    const status = queryString(req.query.status || req.query.state);
    const history = await opsHistoryRepository.list({
      source: queryString(req.query.source) || undefined,
      category: queryString(req.query.category) || undefined,
      status: status || undefined,
    });
    res.json({
      success: true,
      total: history.records.length,
      count: history.records.length,
      ...history,
    });
  }

  async apiGetTransfer(req: Request, res: Response): Promise<void> {
    if (!checkAuth(req, res)) return;
    const { transfer, events } = await orchestrator.getTransferWithEvents(req.params.id);
    res.json({ success: true, transfer, events });
  }

  async apiCreateTransfer(req: Request, res: Response): Promise<void> {
    if (!checkAuth(req, res)) return;
    try {
      const { amount_brl_in, source_endpoint, destination_endpoint } = req.body || {};
      if (!amount_brl_in) {
        res.status(400).json({ success: false, error: 'amount_brl_in required' });
        return;
      }
      const transfer = await orchestrator.createTransfer({
        amount_brl_in: String(amount_brl_in),
        source_endpoint: source_endpoint || { institution_type: 'api', masked_identifier: 'api-client' },
        destination_endpoint: destination_endpoint || { provider_type: 'usd_bank', country: 'US', masked_account: '****' },
        actor: 'api',
      });
      res.status(201).json({ success: true, transfer });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const opsController = new OpsController();
