import express from 'express';
import { AddressInfo } from 'net';
import { opsRouter } from '../src/api/routes/ops.router';
import { opsHistoryRepository } from '../src/api/repository/ops-history.repository';
import { opsAdminAuthService, OpsAdminUser } from '../src/api/services/ops-admin-auth.service';

function app() {
  const server = express();
  server.use(express.json());
  server.use(express.urlencoded({ extended: true }));
  server.use('/', opsRouter);
  return server;
}

async function request(path: string, init: RequestInit = {}) {
  const server = app().listen(0);
  const address = server.address() as AddressInfo;
  try {
    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
      redirect: 'manual',
      ...init,
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function getCookie(response: Response, name: string): string {
  const setCookie = response.headers.get('set-cookie') || '';
  return setCookie.match(new RegExp(`${name}=[^;]+`))?.[0] || '';
}

describe('ops history routes', () => {
  const originalEnv = process.env;
  const admin: OpsAdminUser = {
    id: '4abf4494-9fbf-4c49-b676-39c8a3c1f28d',
    login: 'admin@talktostellar.test',
    display_name: 'Ops Admin',
    role: 'admin',
    active: true,
    failed_attempts: 0,
    locked_until: null,
    last_login_at: null,
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      OPS_DASHBOARD_TOKEN: 'ops-secret',
      TRANSFER_API_TOKEN: '',
      JWT_SECRET: 'test-only-jwt-secret-with-enough-entropy',
    };
    jest.spyOn(opsHistoryRepository, 'list').mockResolvedValue({
      records: [
        {
          id: 'operations:operation-1',
          source: 'operations',
          source_record_id: 'operation-1',
          lifecycle_transfer_id: null,
          reference: 'operation-1',
          kind: 'PIX_ONRAMP',
          status: 'COMPLETED',
          category: 'completed',
          route: 'PIX_ONRAMP',
          source_amount: '100',
          source_asset: 'BRL',
          destination_amount: '18',
          destination_asset: 'USDC',
          transaction_hash: 'hash-1',
          external_reference: 'pix-order-1',
          fee_amount: '1.50',
          fee_asset: 'BRL',
          fee_label: 'platform fee',
          user_id: 'user-1',
          created_at: '2026-06-13T20:00:00.000Z',
          updated_at: '2026-06-13T20:01:00.000Z',
        },
        {
          id: 'payment_logs:8',
          source: 'payment_logs',
          source_record_id: '8',
          lifecycle_transfer_id: null,
          reference: 'hash-2',
          kind: 'conversion',
          status: 'success',
          category: 'completed',
          route: 'USDC -> BRL',
          source_amount: '10',
          source_asset: 'USDC',
          destination_amount: '55',
          destination_asset: 'BRL',
          transaction_hash: 'hash-2',
          external_reference: null,
          fee_amount: null,
          fee_asset: null,
          fee_label: null,
          user_id: 'user-1',
          created_at: '2026-06-13T19:00:00.000Z',
          updated_at: '2026-06-13T19:00:00.000Z',
        },
      ],
      source_counts: {
        transfers: 0,
        international_transfers: 0,
        operations: 1,
        payment_logs: 1,
      },
      source_errors: {},
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('redirects dashboard visitors to the DB-backed login screen', async () => {
    const response = await request('/ops?token=ops-secret');

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('/ops/login');
    expect(response.headers.get('location')).toContain('return_to=');
  });

  it('renders the ops login page with a CSRF cookie', async () => {
    const response = await request('/ops/login');
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Operator access');
    expect(html).toContain('ops_admin_users');
    expect(html).toContain('name="csrf_token"');
    expect(getCookie(response, 'tts_ops_csrf')).toContain('tts_ops_csrf=');
  });

  it('logs in through the admin table and renders complete database transaction history on /ops', async () => {
    jest.spyOn(opsAdminAuthService, 'verifyLogin').mockResolvedValue({ ok: true, admin });
    jest.spyOn(opsAdminAuthService, 'getActiveById').mockResolvedValue(admin);

    const loginPage = await request('/ops/login');
    const csrfCookie = getCookie(loginPage, 'tts_ops_csrf');
    const csrfToken = csrfCookie.replace('tts_ops_csrf=', '');
    const loginResponse = await request('/ops/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        cookie: csrfCookie,
      },
      body: new URLSearchParams({
        csrf_token: csrfToken,
        login: admin.login,
        password: 'correct horse battery staple',
        return_to: '/ops',
      }).toString(),
    });
    const sessionCookie = getCookie(loginResponse, 'tts_ops_session');

    expect(loginResponse.status).toBe(303);
    expect(loginResponse.headers.get('location')).toBe('/ops');
    expect(sessionCookie).toContain('tts_ops_session=');

    const response = await request('/ops', {
      headers: { cookie: sessionCookie },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('Ops dashboard');
    expect(html).toContain('Transfers today');
    expect(html).toContain('BRL to USDC today');
    expect(html).toContain('Needs attention');
    expect(html).toContain('Admin fees');
    expect(html).toContain('Apply filters');
    expect(html).toContain('data-ops-dashboard-page="list"');
    expect(html).toContain('data-refresh-fragment="table"');
    expect(html).toContain('operation-1');
    expect(html).toContain('Payment logs');
    expect(html).toContain('color-scheme: dark');
    expect(html).toContain('--ops-bg: #06070a');
    expect(html).toContain('<strong>TalkToStellar</strong>');
    expect(html).toContain(admin.login);
    expect(html).toContain('/ops/logout');
    expect(html).not.toContain('#fffdf8');
    expect(html).not.toContain('No transaction records match this view.');
  });

  it('returns the same complete history through the protected JSON endpoint', async () => {
    const response = await request('/api/ops/history?token=ops-secret');
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      total: 2,
      count: 2,
      source_counts: {
        operations: 1,
        payment_logs: 1,
      },
    });
    expect(body.records).toHaveLength(2);
  });
});
