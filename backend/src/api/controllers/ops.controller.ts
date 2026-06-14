/**
 * Operational dashboard controller for the PIX-to-Stellar lifecycle engine.
 *
 * The HTML dashboard is read-only. It can add presentation metadata and
 * normalized ledger fields, but transfer state changes stay in the orchestrator.
 */

import crypto from 'crypto';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type {
  OpsHistoryCategory,
  OpsHistoryRecord,
  OpsHistorySource,
} from '../repository/ops-history.repository';
import type { OpsAdminUser } from '../services/ops-admin-auth.service';
import { isProductionLikeEnvironment } from '../../config/runtime';
import { getRequiredJwtSecret } from '../../config/secrets';
import {
  OpsDashboardFilters,
  OpsDashboardMetric,
  OpsDashboardPagination,
  OpsSortDirection,
  renderDashboardErrorPage,
  renderDashboardPage,
  renderOpsLoginPage,
  renderTransferDetailPage,
} from '../views/ops-dashboard.view';

const OPS_HISTORY_SOURCES = [
  'transfers',
  'international_transfers',
  'operations',
  'payment_logs',
] as const;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const STUCK_ACTIVE_MS = 2 * 60 * 60 * 1000;
const OPS_SESSION_COOKIE = 'tts_ops_session';
const OPS_CSRF_COOKIE = 'tts_ops_csrf';
const OPS_SESSION_TYPE = 'ops_admin_session';
const SORT_FIELDS = new Set([
  'reference',
  'status',
  'kind',
  'source_amount',
  'fee_amount',
  'created_at',
  'updated_at',
]);

type OpsSessionPayload = {
  typ: typeof OPS_SESSION_TYPE;
  sub: string;
  login: string;
  role: string;
  csrf: string;
};

type OpsAuthContext = {
  method: 'session' | 'token';
  admin?: OpsAdminUser;
  csrfToken?: string;
};

function getOpsAdminAuthService(): typeof import('../services/ops-admin-auth.service').opsAdminAuthService {
  return require('../services/ops-admin-auth.service').opsAdminAuthService;
}

function getOpsHistoryRepository(): typeof import('../repository/ops-history.repository').opsHistoryRepository {
  return require('../repository/ops-history.repository').opsHistoryRepository;
}

function getTransferRepository(): typeof import('../repository/transfer.repository').transferRepository {
  return require('../repository/transfer.repository').transferRepository;
}

function getOrchestrator(): typeof import('../../orchestration/TransferOrchestrator').orchestrator {
  return require('../../orchestration/TransferOrchestrator').orchestrator;
}

function configuredOpsToken(): string {
  const configured = String(process.env.OPS_DASHBOARD_TOKEN || process.env.TRANSFER_API_TOKEN || '').trim();
  if (configured) return configured;
  return isProductionLikeEnvironment() ? '' : 'dev-ops-token';
}

function readBearerToken(req: Request): string {
  const auth = String(req.headers.authorization || '').trim();
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

function legacyTokenAuthorized(req: Request): boolean {
  const expected = configuredOpsToken();
  if (!expected) return false;
  const token = String(
    readBearerToken(req) ||
      req.query.token ||
      req.headers['x-ops-token'] ||
      req.headers['x-api-key'] ||
      ''
  ).trim();

  return token === expected;
}

function parseCookies(req: Request): Record<string, string> {
  const raw = String(req.headers.cookie || '');
  return raw.split(';').reduce<Record<string, string>>((cookies, part) => {
    const index = part.indexOf('=');
    if (index === -1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return cookies;
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function cookieSecure(): boolean {
  return isProductionLikeEnvironment();
}

function sessionTtlMs(): number {
  const hours = Number(String(process.env.OPS_ADMIN_SESSION_HOURS || '').trim());
  const normalizedHours = Number.isFinite(hours) && hours > 0 ? Math.min(Math.trunc(hours), 24) : 8;
  return normalizedHours * 60 * 60 * 1000;
}

function csrfTtlMs(): number {
  return 15 * 60 * 1000;
}

function setOpsCookie(res: Response, name: string, value: string, maxAgeMs: number, path = '/'): void {
  res.cookie(name, value, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path,
  });
}

function clearOpsCookie(res: Response, name: string, path = '/'): void {
  res.clearCookie(name, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path,
  });
}

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function signOpsSession(admin: OpsAdminUser, csrfToken: string): string {
  const ttlSeconds = Math.max(60, Math.trunc(sessionTtlMs() / 1000));
  return jwt.sign({
    typ: OPS_SESSION_TYPE,
    sub: admin.id,
    login: admin.login,
    role: admin.role,
    csrf: csrfToken,
  } satisfies OpsSessionPayload, getRequiredJwtSecret(), { expiresIn: ttlSeconds });
}

function safeReturnTo(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '/ops';
  if (!raw.startsWith('/ops')) return '/ops';
  if (raw.startsWith('//') || raw.includes('://')) return '/ops';
  if (raw.startsWith('/ops/login')) return '/ops';
  return raw;
}

function requestPathWithQuery(req: Request): string {
  return safeReturnTo(req.originalUrl || req.url || '/ops');
}

function loginRedirectUrl(req: Request): string {
  return `/ops/login?return_to=${encodeURIComponent(requestPathWithQuery(req))}`;
}

function csrfFromHeaderOrBody(req: Request): string {
  return String(
    req.headers['x-ops-csrf'] ||
      req.headers['x-csrf-token'] ||
      req.body?.csrf_token ||
      req.body?.csrf ||
      ''
  ).trim();
}

function csrfCookie(req: Request): string {
  return String(parseCookies(req)[OPS_CSRF_COOKIE] || '').trim();
}

function validLoginCsrf(req: Request): boolean {
  const cookie = csrfCookie(req);
  const body = String(req.body?.csrf_token || '').trim();
  return Boolean(cookie && body && cookie === body);
}

async function sessionAuth(req: Request): Promise<OpsAuthContext | null> {
  const token = String(parseCookies(req)[OPS_SESSION_COOKIE] || '').trim();
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, getRequiredJwtSecret()) as Partial<OpsSessionPayload>;
    if (decoded.typ !== OPS_SESSION_TYPE || !decoded.sub || !decoded.login || !decoded.csrf) return null;
    const admin = await getOpsAdminAuthService().getActiveById(decoded.sub);
    if (!admin || admin.login !== decoded.login) return null;
    return {
      method: 'session',
      admin,
      csrfToken: decoded.csrf,
    };
  } catch {
    return null;
  }
}

async function requireDashboardAuth(req: Request, res: Response): Promise<OpsAuthContext | null> {
  const auth = await sessionAuth(req);
  if (auth) return auth;

  clearOpsCookie(res, OPS_SESSION_COOKIE);
  res.redirect(303, loginRedirectUrl(req));
  return null;
}

async function requireApiAuth(req: Request, res: Response): Promise<OpsAuthContext | null> {
  const auth = await sessionAuth(req);
  if (auth) {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrf = csrfFromHeaderOrBody(req);
      if (!auth.csrfToken || csrf !== auth.csrfToken) {
        res.status(403).json({ success: false, error: 'Missing or invalid ops CSRF token.' });
        return null;
      }
    }
    return auth;
  }

  if (legacyTokenAuthorized(req)) return { method: 'token' };

  if (!configuredOpsToken()) {
    res.status(503).json({ success: false, error: 'OPS_DASHBOARD_TOKEN or TRANSFER_API_TOKEN must be set for token API access, or log in at /ops/login.' });
    return null;
  }

  res.status(401).json({ success: false, error: 'Unauthorized. Log in at /ops/login or provide Authorization: Bearer <token>, X-Ops-Token, X-Api-Key, or ?token= for JSON API access.' });
  return null;
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

function tokenFromRequest(_req: Request): string {
  return '';
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
  async loginForm(req: Request, res: Response): Promise<void> {
    const existing = await sessionAuth(req);
    if (existing) {
      res.redirect(303, safeReturnTo(req.query.return_to || '/ops'));
      return;
    }

    const csrfToken = newToken();
    setOpsCookie(res, OPS_CSRF_COOKIE, csrfToken, csrfTtlMs(), '/ops');
    res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderOpsLoginPage({
      title: 'Ops login',
      environment: dashboardEnvironment(),
      csrfToken,
      returnTo: safeReturnTo(req.query.return_to),
    }));
  }

  async login(req: Request, res: Response): Promise<void> {
    const returnTo = safeReturnTo(req.body?.return_to || req.query.return_to);
    const login = queryString(req.body?.login);

    const renderFailure = (message: string, status = 401) => {
      const csrfToken = newToken();
      setOpsCookie(res, OPS_CSRF_COOKIE, csrfToken, csrfTtlMs(), '/ops');
      res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderOpsLoginPage({
        title: 'Ops login',
        environment: dashboardEnvironment(),
        csrfToken,
        returnTo,
        login,
        error: message,
      }));
    };

    if (!validLoginCsrf(req)) {
      renderFailure('Session check failed. Refresh the login page and try again.', 403);
      return;
    }

    try {
      const result = await getOpsAdminAuthService().verifyLogin(login, req.body?.password);
      if (!result.ok) {
        const lockedDetail = result.reason === 'locked' && result.lockedUntil
          ? ` Account locked until ${new Date(result.lockedUntil).toISOString()}.`
          : '';
        renderFailure(`Invalid operator credentials.${lockedDetail}`, result.reason === 'locked' ? 423 : 401);
        return;
      }

      const csrfToken = newToken();
      const sessionToken = signOpsSession(result.admin, csrfToken);
      setOpsCookie(res, OPS_SESSION_COOKIE, sessionToken, sessionTtlMs(), '/');
      clearOpsCookie(res, OPS_CSRF_COOKIE, '/ops');
      res.redirect(303, returnTo);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      renderFailure(`Ops login is unavailable: ${message}`, 503);
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    const auth = await sessionAuth(req);
    if (auth?.csrfToken && csrfFromHeaderOrBody(req) !== auth.csrfToken) {
      const csrfToken = newToken();
      clearOpsCookie(res, OPS_SESSION_COOKIE, '/');
      setOpsCookie(res, OPS_CSRF_COOKIE, csrfToken, csrfTtlMs(), '/ops');
      res.status(403).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderOpsLoginPage({
        title: 'Ops login',
        environment: dashboardEnvironment(),
        csrfToken,
        returnTo: '/ops',
        error: 'Logout session check failed. Sign in again before continuing.',
      }));
      return;
    }

    clearOpsCookie(res, OPS_SESSION_COOKIE, '/');
    clearOpsCookie(res, OPS_CSRF_COOKIE, '/ops');
    res.redirect(303, '/ops/login');
  }

  async dashboard(req: Request, res: Response): Promise<void> {
    const auth = await requireDashboardAuth(req, res);
    if (!auth) return;

    const filters = dashboardFilters(req);
    const updatedAt = new Date().toISOString();

    try {
      const history = await getOpsHistoryRepository().list({
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
        operatorLogin: auth.admin?.login || 'ops',
        csrfToken: auth.csrfToken || '',
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderDashboardErrorPage({
        environment: dashboardEnvironment(),
        updatedAt,
        error: message,
        operatorLogin: auth.admin?.login || 'ops',
        csrfToken: auth.csrfToken || '',
      }));
    }
  }

  async transferDetail(req: Request, res: Response): Promise<void> {
    const auth = await requireDashboardAuth(req, res);
    if (!auth) return;

    const { transfer, events } = await getOrchestrator().getTransferWithEvents(req.params.id);
    const sortedEvents = [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderTransferDetailPage({
      transfer,
      events: sortedEvents,
      token: tokenFromRequest(req),
      environment: dashboardEnvironment(),
      updatedAt: new Date().toISOString(),
      operatorLogin: auth.admin?.login || 'ops',
      csrfToken: auth.csrfToken || '',
    }));
  }

  async apiListTransfers(req: Request, res: Response): Promise<void> {
    if (!await requireApiAuth(req, res)) return;
    const state = req.query.state ? String(req.query.state) : undefined;
    const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
    const transfers = await getTransferRepository().list({ state, limit });
    const total = await getTransferRepository().count(state ? { state } : undefined);
    res.json({ success: true, total, count: transfers.length, transfers });
  }

  async apiListHistory(req: Request, res: Response): Promise<void> {
    if (!await requireApiAuth(req, res)) return;
    const status = queryString(req.query.status || req.query.state);
    const history = await getOpsHistoryRepository().list({
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
    if (!await requireApiAuth(req, res)) return;
    const { transfer, events } = await getOrchestrator().getTransferWithEvents(req.params.id);
    res.json({ success: true, transfer, events });
  }

  async apiCreateTransfer(req: Request, res: Response): Promise<void> {
    if (!await requireApiAuth(req, res)) return;
    try {
      const { amount_brl_in, source_endpoint, destination_endpoint } = req.body || {};
      if (!amount_brl_in) {
        res.status(400).json({ success: false, error: 'amount_brl_in required' });
        return;
      }
      const transfer = await getOrchestrator().createTransfer({
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
