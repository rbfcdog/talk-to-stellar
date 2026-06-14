import express from 'express';
import { AddressInfo } from 'net';
import quotesRouter from '../src/api/routes/quotes.router';
import transfersRouter from '../src/api/routes/international-transfers.router';
import { brlUsdQuoteService } from '../src/api/services/brl-usd-quote.service';
import { internationalTransferService } from '../src/api/services/international-transfer.service';
import {
  InternationalTransfer,
  InternationalTransferQuote,
  TransferOrchestrationLog,
  TransferReconciliation,
} from '../src/api/services/international-transfer.types';

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
    jest.spyOn(internationalTransferService, 'refreshPayoutStatus').mockResolvedValue({
      ...transfer('PAYOUT_COMPLETED'),
      payout_instruction_id: 'payout-instruction-1',
      provider_payout_id: 'provider-payout-1',
      payout_status: 'completed',
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
    const orchestrationLog: TransferOrchestrationLog = {
      generated_at: new Date().toISOString(),
      transfer_id: 'tr-route-1',
      quote_id: 'q-route-1',
      current_status: 'PAYOUT_COMPLETED',
      correlation_id: 'corr-lifecycle-1',
      request_ids: ['req-lifecycle-1'],
      quote_provenance: quote().provenance,
      evidence_status: {
        quote: 'captured',
        pix_funding: 'captured',
        stellar_settlement: 'real_testnet',
        payout_instruction: 'captured',
        reconciliation: 'captured',
      },
      redaction: {
        applied: true,
        notes: ['Destination account numbers are redacted.'],
      },
      destination: {
        account_holder_hash: 'holder-hash',
        account_holder_type: 'business',
        country: 'US',
        account_number_last4: '6789',
      },
      timeline: [
        {
          step: 'quote_created',
          state: 'QUOTE_CREATED',
          status: 'completed',
          summary: 'Quote created.',
        },
        {
          step: 'reconciliation',
          state: 'PAYOUT_COMPLETED',
          status: 'captured',
          summary: 'Reconciliation available.',
        },
      ],
      reconciliation_summary: {
        available: true,
        metrics_valid: true,
        final_payout_status: 'completed',
        stellar_tx_hash: 'stellar-hash-1',
        payout_instruction_id: 'payout-instruction-1',
      },
      next_action: 'done',
      error_count: 0,
      errors: [],
    };
    jest.spyOn(internationalTransferService, 'getOrchestrationLog').mockResolvedValue(orchestrationLog);
    jest.spyOn(internationalTransferService, 'getReviewerEvidence').mockResolvedValue({
      schema_version: 1,
      generated_at: new Date().toISOString(),
      transfer_id: 'tr-route-1',
      submission: {
        title: 'PIX-to-Stellar Transfer Lifecycle Engine',
        week: 1,
        ready_count: 4,
        required_count: 4,
        status: 'ready',
      },
      repository: {
        url: 'https://github.com/rbfcdog/talk-to-stellar',
        branch: 'main',
        evidence_map_path: 'docs/insta-awards/evidence-map.md',
      },
      dashboard: {
        path: '/institution-settlement',
        screenshot_target: '/institution-settlement',
      },
      privacy: {
        redaction_applied: true,
        amounts_redacted: false,
        notes: ['Private fields are redacted.'],
      },
      checklist: [],
      transfer_record: {
        transfer_id: 'tr-route-1',
        quote_id: 'q-route-1',
        status: 'PAYOUT_COMPLETED',
        subject: { sender_name_hash: 'sender-hash' },
        value: {
          source_amount_brl: '560',
          quoted_destination_usd: '99',
          fx_rate_brl_per_usd: '5.6',
          fees: transfer('PAYOUT_COMPLETED').fees,
        },
        pix_funding: { status: 'completed' },
        stellar_settlement: { asset_code: 'USDC', transaction_hash: 'stellar-hash-1' },
        payout: { status: 'completed', destination: { account_number_last4: '6789' } },
        controls: {
          same_name_required: false,
          same_name_status: 'UNKNOWN',
          identity_risk_note_count: 0,
        },
        reconciliation: { available: true, metrics_valid: true },
        timestamps: {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error_count: 0,
      },
      orchestration_log: orchestrationLog,
    });
    jest.spyOn(internationalTransferService, 'getWorkflow').mockResolvedValue({
      schema_version: 1,
      generated_at: new Date().toISOString(),
      transfer_id: 'tr-route-1',
      current_state: 'PAYOUT_COMPLETED',
      terminal: true,
      successful: true,
      progress: {
        completed_steps: 9,
        total_steps: 9,
        percent: 100,
      },
      evidence: {
        quote: true,
        pix_intent: true,
        pix_confirmation: true,
        stellar_settlement: true,
        payout_instruction: true,
        reconciliation: true,
        ready_count: 6,
        required_count: 6,
      },
      identity_control: {
        required: false,
        status: 'UNKNOWN',
        payout_allowed: true,
        risk_notes: [],
      },
      next_action: {
        code: 'export_evidence',
        label: 'Export reviewer evidence',
        description: 'Capture the reviewer package.',
        actor: 'reviewer',
        requires_ops_authorization: false,
        blocked: false,
      },
      steps: [],
    });

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
      method: 'POST',
      path: '/api/transfers/tr-route-1/payout-status-refresh',
      headers,
      body: {},
    })).resolves.toMatchObject({ status: 200, body: { transfer: { status: 'PAYOUT_COMPLETED', payout_status: 'completed' } } });

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

    await expect(routeRequest({
      method: 'GET',
      path: '/api/transfers/tr-route-1/orchestration-log',
      headers,
    })).resolves.toMatchObject({
      status: 200,
      body: {
        request_id: 'req-lifecycle-1',
        correlation_id: 'corr-lifecycle-1',
        orchestration_log: {
          transfer_id: 'tr-route-1',
          current_status: 'PAYOUT_COMPLETED',
          evidence_status: {
            stellar_settlement: 'real_testnet',
          },
          redaction: {
            applied: true,
          },
          destination: {
            account_number_last4: '6789',
          },
        },
      },
    });

    await expect(routeRequest({
      method: 'GET',
      path: '/api/transfers/tr-route-1/reviewer-evidence',
      headers,
    })).resolves.toMatchObject({
      status: 200,
      body: {
        request_id: 'req-lifecycle-1',
        correlation_id: 'corr-lifecycle-1',
        reviewer_evidence: {
          transfer_id: 'tr-route-1',
          submission: {
            ready_count: 4,
            required_count: 4,
            status: 'ready',
          },
          privacy: {
            redaction_applied: true,
            amounts_redacted: false,
          },
          transfer_record: {
            value: {
              source_amount_brl: '560',
            },
          },
        },
      },
    });

    await expect(routeRequest({
      method: 'GET',
      path: '/api/transfers/tr-route-1/workflow',
      headers,
    })).resolves.toMatchObject({
      status: 200,
      body: {
        request_id: 'req-lifecycle-1',
        correlation_id: 'corr-lifecycle-1',
        workflow: {
          transfer_id: 'tr-route-1',
          current_state: 'PAYOUT_COMPLETED',
          progress: {
            percent: 100,
          },
          next_action: {
            code: 'export_evidence',
          },
        },
      },
    });
  });

  it('blocks operator-only settlement and payout routes without ops authorization', async () => {
    const settle = jest.spyOn(internationalTransferService, 'settleStellar').mockResolvedValue(transfer('USDC_SETTLED'));
    const payout = jest.spyOn(internationalTransferService, 'createPayoutInstruction').mockResolvedValue(transfer('PAYOUT_PENDING'));
    const refresh = jest.spyOn(internationalTransferService, 'refreshPayoutStatus').mockResolvedValue(transfer('PAYOUT_PENDING'));

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
    const refreshResponse = await routeRequest({
      method: 'POST',
      path: '/api/transfers/tr-route-1/payout-status-refresh',
      headers: { 'x-request-id': 'req-deny-3' },
      body: {},
    });

    expect(settlement.status).toBe(403);
    expect(payoutResponse.status).toBe(403);
    expect(refreshResponse.status).toBe(403);
    expect(settle).not.toHaveBeenCalled();
    expect(payout).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('protects raw transfer and reconciliation reads while keeping reviewer-safe evidence public', async () => {
    const rawTransfer = jest.spyOn(internationalTransferService, 'getTransfer').mockResolvedValue(transfer('PAYOUT_PENDING'));
    const rawReconciliation = jest.spyOn(internationalTransferService, 'getReconciliation').mockResolvedValue({
      transfer_id: 'tr-route-1',
      quote_id: 'q-route-1',
      evidence: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    const reviewer = jest.spyOn(internationalTransferService, 'getReviewerEvidence').mockResolvedValue({
      schema_version: 1,
      generated_at: new Date().toISOString(),
      transfer_id: 'tr-route-1',
      submission: {
        title: 'PIX-to-Stellar Transfer Lifecycle Engine',
        week: 1,
        ready_count: 4,
        required_count: 4,
        status: 'ready',
      },
      repository: {
        url: 'https://github.com/rbfcdog/talk-to-stellar',
        branch: 'main',
        evidence_map_path: 'docs/insta-awards/evidence-map.md',
      },
      dashboard: {
        path: '/institution-settlement',
        screenshot_target: '/institution-settlement',
      },
      privacy: {
        redaction_applied: true,
        amounts_redacted: false,
        notes: [],
      },
      checklist: [],
      transfer_record: {
        transfer_id: 'tr-route-1',
        quote_id: 'q-route-1',
        status: 'PAYOUT_PENDING',
        subject: {},
        value: {
          source_amount_brl: '560',
          quoted_destination_usd: '99',
          fx_rate_brl_per_usd: '5.6',
          fees: transfer('PAYOUT_PENDING').fees,
        },
        pix_funding: {},
        stellar_settlement: { asset_code: 'USDC' },
        payout: { destination: {} },
        controls: {
          same_name_required: true,
          same_name_status: 'MATCHED',
          identity_risk_note_count: 0,
        },
        reconciliation: { available: true },
        timestamps: {
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        error_count: 0,
      },
      orchestration_log: {
        generated_at: new Date().toISOString(),
        transfer_id: 'tr-route-1',
        quote_id: 'q-route-1',
        current_status: 'PAYOUT_PENDING',
        request_ids: [],
        evidence_status: {},
        redaction: { applied: true, notes: [] },
        destination: {},
        timeline: [],
        reconciliation_summary: { available: true },
        error_count: 0,
        errors: [],
      },
    });

    const rawTransferResponse = await routeRequest({
      method: 'GET',
      path: '/api/transfers/tr-route-1',
    });
    const rawReconciliationResponse = await routeRequest({
      method: 'GET',
      path: '/api/transfers/tr-route-1/reconciliation',
    });
    const reviewerResponse = await routeRequest({
      method: 'GET',
      path: '/api/transfers/tr-route-1/reviewer-evidence',
    });

    expect(rawTransferResponse.status).toBe(403);
    expect(rawReconciliationResponse.status).toBe(403);
    expect(reviewerResponse.status).toBe(200);
    expect(rawTransfer).not.toHaveBeenCalled();
    expect(rawReconciliation).not.toHaveBeenCalled();
    expect(reviewer).toHaveBeenCalledTimes(1);
  });

  it('exposes payout readiness and evidence while requiring a signed provider event secret', async () => {
    process.env.CIRCLE_PAYOUT_WEBHOOK_SECRET = 'circle-webhook-secret';
    jest.spyOn(internationalTransferService, 'getPayoutProviderCapabilities').mockReturnValue([{
      provider_name: 'circle',
      display_name: 'Circle compatibility adapter',
      execution_mode: 'compatibility',
      configured: false,
      execution_enabled: false,
      supports: {
        create_instruction: true,
        status_polling: false,
        webhooks: true,
        cancellation: false,
        usd_bank_destination: true,
      },
      requirements: [],
      blockers: ['ENABLE_REAL_PAYOUT_EXECUTION is false.'],
      notes: [],
    }]);
    jest.spyOn(internationalTransferService, 'getPayoutEvidence').mockResolvedValue({
      schema_version: 1,
      generated_at: new Date().toISOString(),
      transfer_id: 'tr-route-1',
      ready: true,
      submission: {
        title: 'USD Delivery & Payout Coordination Layer',
        week: 2,
        ready_count: 4,
        required_count: 4,
        status: 'READY',
      },
      checklist: [],
      provider: internationalTransferService.getPayoutProviderCapabilities()[0],
      settlement: { attached: true, stellar_tx_hash: 'stellar-hash-1', asset_code: 'USDC', amount_usd: '99' },
      identity_control: { same_name_required: true, same_name_status: 'MATCHED', payout_allowed: true, risk_notes: [] },
      instruction: { created: true, instruction_id: 'payout-instruction-1', status: 'pending' },
      status_history: [],
      destination: { country: 'US', account_number_last4: '6789' },
      compatibility: {
        circle: internationalTransferService.getPayoutProviderCapabilities()[0],
        bridge: { ...internationalTransferService.getPayoutProviderCapabilities()[0], provider_name: 'bridge', display_name: 'Bridge compatibility adapter' },
      },
      redaction: { applied: true, notes: [] },
    });
    const event = jest.spyOn(internationalTransferService, 'handlePayoutProviderEvent').mockResolvedValue({
      ...transfer('PAYOUT_COMPLETED'),
      payout_provider: 'circle',
      payout_instruction_id: 'payout-instruction-1',
      provider_payout_id: 'circle-payout-1',
      payout_status: 'completed',
    });

    await expect(routeRequest({
      method: 'GET',
      path: '/api/transfers/payout-providers',
    })).resolves.toMatchObject({ status: 200, body: { providers: [{ provider_name: 'circle' }] } });

    await expect(routeRequest({
      method: 'GET',
      path: '/api/transfers/tr-route-1/payout-evidence',
    })).resolves.toMatchObject({
      status: 200,
      body: { payout_evidence: { submission: { week: 2, ready_count: 4 } } },
    });

    await expect(routeRequest({
      method: 'POST',
      path: '/api/transfers/payout-events/circle',
      body: { id: 'event-1', data: { id: 'circle-payout-1', status: 'complete' } },
    })).resolves.toMatchObject({ status: 401 });
    await expect(routeRequest({
      method: 'POST',
      path: '/api/transfers/payout-events/circle',
      headers: { 'x-payout-webhook-secret': 'circle-webhook-secret' },
      body: { id: 'event-1', data: { id: 'circle-payout-1', status: 'complete' } },
    })).resolves.toMatchObject({
      status: 202,
      body: {
        payout_event: {
          accepted: true,
          transfer_id: 'tr-route-1',
          payout_status: 'completed',
        },
      },
    });
    expect(event).toHaveBeenCalledTimes(1);
  });
});
