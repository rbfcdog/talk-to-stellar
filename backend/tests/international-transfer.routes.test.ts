import express from 'express';
import { AddressInfo } from 'net';
import quotesRouter from '../src/api/routes/quotes.router';
import transfersRouter from '../src/api/routes/international-transfers.router';
import { brlUsdQuoteService } from '../src/api/services/brl-usd-quote.service';
import { internationalTransferService } from '../src/api/services/international-transfer.service';
import { InternationalTransfer, InternationalTransferQuote, TransferReconciliation } from '../src/api/services/international-transfer.types';

function app() {
  const server = express();
  server.use(express.json());
  server.use('/api/quotes', quotesRouter);
  server.use('/api/transfers', transfersRouter);
  return server;
}

async function routeRequest(input: {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}) {
  const server = app().listen(0);
  const address = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${input.path}`, {
      method: input.method,
      headers: {
        'content-type': 'application/json',
        ...(input.headers || {}),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    return {
      status: response.status,
      headers: response.headers,
      body: await response.json().catch(() => ({})),
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function quote(): InternationalTransferQuote {
  const now = new Date().toISOString();
  return {
    quote_id: 'q-route-1',
    user_id: 'user-route',
    source_currency: 'BRL',
    destination_currency: 'USD',
    brl_amount: '560',
    estimated_usdc_amount: '99',
    estimated_usd_amount: '99',
    fx_rate: '5.6',
    platform_fee: { amount: '5.6', currency: 'BRL', bps: 100 },
    estimated_provider_fee: { amount: '0', currency: 'USD' },
    total_fee: { amount_brl_equivalent: '5.6', amount_usd_equivalent: '1' },
    expires_at: new Date(Date.now() + 300_000).toISOString(),
    quote_status: 'ACTIVE',
    quote_source: 'stellar_pathfinding',
    provenance: {
      kind: 'live_path_quote',
      label: 'Live Stellar strict-send path quote',
      source: 'stellar_horizon_strict_send_paths',
      fetched_at: now,
      live: true,
      sandbox: false,
      fallback: false,
      executable: true,
    },
    metadata: {},
    created_at: now,
    updated_at: now,
  };
}

function transfer(status: InternationalTransfer['status']): InternationalTransfer {
  const now = new Date().toISOString();
  return {
    transfer_id: 'tr-route-1',
    quote_id: 'q-route-1',
    status,
    user_id: 'user-route',
    sender_identity: { legal_name: 'Origin BR Institution Ltda' },
    recipient_identity: { legal_name: 'Destination USD Institution LLC' },
    brl_amount: '560',
    quoted_usd_amount: '99',
    fx_rate: '5.6',
    fees: {
      platform_fee: { amount: '5.6', currency: 'BRL', bps: 100 },
      estimated_provider_fee: { amount: '0', currency: 'USD' },
      total_fee: { amount_brl_equivalent: '5.6', amount_usd_equivalent: '1' },
    },
    stellar_asset_code: 'USDC',
    stellar_asset_issuer: 'GUSDC',
    payout_destination: {
      accountHolderName: 'Destination USD Institution LLC',
      accountHolderType: 'business',
      country: 'US',
    },
    same_name_payout_required: false,
    same_name_match_status: 'UNKNOWN',
    identity_risk_notes: [],
    reconciliation_metadata: {},
    error_logs: [],
    created_at: now,
    updated_at: now,
  };
}

describe('international transfer HTTP routes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = {
      ...originalEnv,
      INTERNATIONAL_TRANSFER_OPS_SECRET: 'ops-secret',
      INTERNAL_API_SECRET: '',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('returns quote provenance and trace headers from the BRL/USD quote route', async () => {
    const createQuote = jest.spyOn(brlUsdQuoteService, 'createQuote').mockResolvedValue(quote());

    const response = await routeRequest({
      method: 'POST',
      path: '/api/quotes/brl-usd',
      headers: {
        'x-request-id': 'req-quote-1',
        'x-correlation-id': 'corr-route-1',
      },
      body: { brl_amount: '560', user_id: 'user-route' },
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('x-request-id')).toBe('req-quote-1');
    expect(response.headers.get('x-correlation-id')).toBe('corr-route-1');
    expect(response.body).toMatchObject({
      success: true,
      request_id: 'req-quote-1',
      correlation_id: 'corr-route-1',
      quote: {
        quote_id: 'q-route-1',
        quote_source: 'stellar_pathfinding',
        provenance: {
          kind: 'live_path_quote',
          live: true,
          fallback: false,
          executable: true,
        },
      },
    });
    expect(createQuote).toHaveBeenCalledWith(expect.objectContaining({
      brl_amount: '560',
      request_id: 'req-quote-1',
      correlation_id: 'corr-route-1',
    }));
  });

  it('routes quote, transfer, Pix intent, funding confirmation, settlement, payout and reconciliation', async () => {
    jest.spyOn(internationalTransferService, 'createTransfer').mockResolvedValue(transfer('QUOTE_CREATED'));
    jest.spyOn(internationalTransferService, 'createPixIntent').mockResolvedValue({
      ...transfer('PIX_PENDING'),
      pix_order_id: 'pix-order-1',
      pix_payment_id: 'pix-payment-1',
    });
    jest.spyOn(internationalTransferService, 'confirmSandboxFunding').mockResolvedValue({
      ...transfer('PIX_RECEIVED'),
      pix_order_id: 'pix-order-1',
      pix_payment_id: 'pix-payment-1',
    });
    jest.spyOn(internationalTransferService, 'settleStellar').mockResolvedValue({
      ...transfer('USDC_SETTLED'),
      stellar_tx_hash: 'stellar-hash-1',
    });
    jest.spyOn(internationalTransferService, 'createPayoutInstruction').mockResolvedValue({
      ...transfer('PAYOUT_PENDING'),
      payout_instruction_id: 'payout-instruction-1',
      provider_payout_id: 'provider-payout-1',
    });
    const reconciliation: TransferReconciliation = {
      transfer_id: 'tr-route-1',
      quote_id: 'q-route-1',
      pix_order_id: 'pix-order-1',
      stellar_tx_hash: 'stellar-hash-1',
      payout_instruction_id: 'payout-instruction-1',
      provider_payout_id: 'provider-payout-1',
      final_payout_status: 'pending',
      evidence: { metrics_valid: true },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    jest.spyOn(internationalTransferService, 'getReconciliation').mockResolvedValue(reconciliation);

    const headers = {
      'x-request-id': 'req-lifecycle-1',
      'x-correlation-id': 'corr-lifecycle-1',
      'x-international-transfer-ops-secret': 'ops-secret',
    };

    await expect(routeRequest({
      method: 'POST',
      path: '/api/transfers',
      headers,
      body: {
        quote_id: 'q-route-1',
        payout_destination: {
          accountHolderName: 'Destination USD Institution LLC',
          accountHolderType: 'business',
          country: 'US',
        },
      },
    })).resolves.toMatchObject({ status: 201, body: { transfer: { status: 'QUOTE_CREATED' } } });

    await expect(routeRequest({
      method: 'POST',
      path: '/api/transfers/tr-route-1/pix-intent',
      headers,
      body: { session_id: 'session-1', session_token: 'token-1' },
    })).resolves.toMatchObject({ status: 201, body: { transfer: { status: 'PIX_PENDING' } } });

    await expect(routeRequest({
      method: 'POST',
      path: '/api/transfers/tr-route-1/funding-confirmation',
      headers,
      body: { status: 'completed' },
    })).resolves.toMatchObject({ status: 200, body: { transfer: { status: 'PIX_RECEIVED' } } });

    await expect(routeRequest({
      method: 'POST',
      path: '/api/transfers/tr-route-1/settle-stellar',
      headers,
      body: {},
    })).resolves.toMatchObject({ status: 200, body: { transfer: { status: 'USDC_SETTLED' } } });

    await expect(routeRequest({
      method: 'POST',
      path: '/api/transfers/tr-route-1/payout-instruction',
      headers,
      body: { provider: 'etherfuse' },
    })).resolves.toMatchObject({ status: 201, body: { transfer: { status: 'PAYOUT_PENDING' } } });

    await expect(routeRequest({
      method: 'GET',
      path: '/api/transfers/tr-route-1/reconciliation',
      headers,
    })).resolves.toMatchObject({
      status: 200,
      body: {
        request_id: 'req-lifecycle-1',
        correlation_id: 'corr-lifecycle-1',
        reconciliation: {
          transfer_id: 'tr-route-1',
          stellar_tx_hash: 'stellar-hash-1',
        },
      },
    });
  });

  it('blocks operator-only settlement and payout routes without ops authorization', async () => {
    const settle = jest.spyOn(internationalTransferService, 'settleStellar').mockResolvedValue(transfer('USDC_SETTLED'));
    const payout = jest.spyOn(internationalTransferService, 'createPayoutInstruction').mockResolvedValue(transfer('PAYOUT_PENDING'));

    const settlement = await routeRequest({
      method: 'POST',
      path: '/api/transfers/tr-route-1/settle-stellar',
      headers: { 'x-request-id': 'req-deny-1' },
      body: {},
    });
    const payoutResponse = await routeRequest({
      method: 'POST',
      path: '/api/transfers/tr-route-1/payout-instruction',
      headers: { 'x-request-id': 'req-deny-2' },
      body: { provider: 'etherfuse' },
    });

    expect(settlement.status).toBe(403);
    expect(payoutResponse.status).toBe(403);
    expect(settle).not.toHaveBeenCalled();
    expect(payout).not.toHaveBeenCalled();
  });
});
