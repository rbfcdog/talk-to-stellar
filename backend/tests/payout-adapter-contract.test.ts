import {
  BridgeCompatibilityAdapter,
  CircleCompatibilityAdapter,
  EtherfusePixOffRampAdapter,
  getPayoutProviderAdapter,
  MockUsdPayoutAdapter,
} from '../src/api/services/usd-payout-adapters';

function destination(providerLabel: 'wise' | 'mercury' | 'revolut' | 'other' = 'other') {
  return {
    accountHolderName: 'Destination USD Institution LLC',
    accountHolderType: 'business' as const,
    bankName: 'Destination USD Banking Partner',
    routingNumber: '021000021',
    accountNumber: '123456789',
    accountType: 'checking' as const,
    country: 'US',
    providerLabel,
  };
}

const baseInput = {
  transferId: 'tr-contract-1',
  amountUsd: '99.50',
  destination: destination(),
  senderLegalName: 'Origin BR Institution Ltda',
  recipientLegalName: 'Destination USD Institution LLC',
  stellarTxHash: 'stellar-hash-contract',
  stellarMemo: 'tts-contract',
  metadata: {
    same_name_match_status: 'MATCHED',
    on_ramp_provider: 'etherfuse',
    route: 'PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK',
    settlement_asset_code: 'USDC',
    settlement_network: 'testnet',
    off_ramp_provider: 'circle',
    off_ramp_source_asset_code: 'USDC',
    payout_currency: 'USD',
  },
};

describe('PayoutProviderAdapter contract', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.restoreAllMocks();
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      ALLOW_OPS_MOCKS: 'false',
      ALLOW_MOCK_USD_PAYOUTS: 'false',
      MOCK_USD_PAYOUT_AUTO_COMPLETE: 'false',
      ENABLE_REAL_PAYOUT_EXECUTION: 'false',
      CIRCLE_API_KEY: '',
      CIRCLE_API_BASE_URL: '',
      CIRCLE_ENVIRONMENT: 'sandbox',
      CIRCLE_PAYOUT_DESTINATION_ID: '',
      CIRCLE_PAYOUT_DESTINATION_TYPE: '',
      CIRCLE_SOURCE_WALLET_ID: '',
      CIRCLE_PAYOUT_CREATE_URL: '',
      CIRCLE_PAYOUT_STATUS_URL: '',
      BRIDGE_API_KEY: '',
      BRIDGE_PAYOUT_CREATE_URL: '',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('creates an ops-only mock instruction when mock policy explicitly allows it', async () => {
    process.env.ALLOW_OPS_MOCKS = 'true';
    process.env.ALLOW_MOCK_USD_PAYOUTS = 'true';

    const instruction = await new MockUsdPayoutAdapter().createPayoutInstruction(baseInput);
    const status = await new MockUsdPayoutAdapter().getPayoutStatus(instruction.provider_payout_id);

    expect(instruction).toMatchObject({
      provider_name: 'mock',
      status: 'pending',
      amount_usd: '99.50',
      currency: 'USD',
      metadata: {
        mode: 'mock',
        wise_api_integration: false,
      },
    });
    expect(status).toBe('pending');
  });

  it('creates an Etherfuse proof payload without claiming USD bank payout execution', async () => {
    const instruction = await new EtherfusePixOffRampAdapter().createPayoutInstruction(baseInput);
    const status = await new EtherfusePixOffRampAdapter().getPayoutStatus(instruction.provider_payout_id);

    expect(instruction).toMatchObject({
      provider_name: 'etherfuse',
      status: 'pending',
      currency: 'USD',
      metadata: {
        mode: 'etherfuse_sandbox_payload_prepared',
        rail: 'pix',
        source_asset_code: 'USDC',
        wise_api_integration: false,
      },
    });
    expect(String(instruction.metadata?.note || '')).toMatch(/prepared the proof payload/i);
    expect(status).toBe('pending');
  });

  it('creates a Circle compatibility payload with sensitive account fields redacted', async () => {
    const instruction = await new CircleCompatibilityAdapter().createPayoutInstruction(baseInput);

    expect(instruction).toMatchObject({
      provider_name: 'circle',
      status: 'pending',
      metadata: {
        mode: 'compatibility',
        provider_api: 'circle_mint_business_account_payouts',
        provider_api_key_present: false,
        provider_destination_id_present: false,
        real_execution_enabled: false,
      },
    });
    expect((instruction.metadata as any).provider_payload).toMatchObject({
      destination: { type: 'wire' },
      amount: { amount: '99.50', currency: 'USD' },
      metadata: {
        route: 'PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK',
        settlement_asset_code: 'USDC',
        off_ramp_source_asset_code: 'USDC',
        payout_currency: 'USD',
      },
    });
    expect((instruction.metadata as any).provider_payload.destination).not.toHaveProperty('account_number');
    expect((instruction.metadata as any).destination_metadata.account_holder_name).toBe('[REDACTED]');
    expect((instruction.metadata as any).destination_metadata.routing_number).toBe('[REDACTED_LAST4:0021]');
    expect((instruction.metadata as any).destination_metadata.account_number).toBe('[REDACTED_LAST4:6789]');
    expect((instruction.metadata as any).destination_metadata.provider_label).toBe('other');
  });

  it('creates a Bridge compatibility payload with sensitive account fields redacted', async () => {
    const instruction = await new BridgeCompatibilityAdapter().createPayoutInstruction({
      ...baseInput,
      destination: {
        ...destination('mercury'),
        swiftBic: 'BOFAUS3N',
        iban: 'US00TEST123',
      },
    });

    expect(instruction).toMatchObject({
      provider_name: 'bridge',
      status: 'pending',
      metadata: {
        mode: 'compatibility',
        provider_api_key_present: false,
        real_execution_enabled: false,
        destination_provider_label: 'mercury',
      },
    });
    expect((instruction.metadata as any).provider_payload.destination.account_number).toBe('[REDACTED_LAST4:6789]');
    expect((instruction.metadata as any).provider_payload.destination.iban).toBe('[REDACTED]');
  });

  it('sends executable destination details while persisting only redacted evidence', async () => {
    process.env.ENABLE_REAL_PAYOUT_EXECUTION = 'true';
    process.env.CIRCLE_API_KEY = 'circle-test-key';
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 'circle-payout-live-1',
          status: 'pending',
          destination: {
            type: 'wire',
            id: 'circle-bank-account-1',
            name: 'Destination Bank ****6789',
          },
        },
      }),
    } as any);

    const instruction = await new CircleCompatibilityAdapter().createPayoutInstruction({
      ...baseInput,
      providerOptions: {
        circleDestinationId: 'circle-bank-account-1',
        circleDestinationType: 'wire',
      },
    });

    expect(fetchSpy.mock.calls[0][0]).toBe('https://api-sandbox.circle.com/v1/businessAccount/payouts');
    const request = fetchSpy.mock.calls[0][1] as RequestInit;
    const sentPayload = JSON.parse(String(request.body));
    expect(sentPayload.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(sentPayload.destination).toMatchObject({
      type: 'wire',
      id: 'circle-bank-account-1',
    });
    expect(sentPayload.amount).toMatchObject({
      amount: '99.50',
      currency: 'USD',
    });
    expect(sentPayload.metadata).toMatchObject({
      route: 'PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK',
      settlement_asset_code: 'USDC',
      off_ramp_source_asset_code: 'USDC',
      payout_currency: 'USD',
    });
    expect(JSON.stringify(sentPayload)).not.toMatch(/123456789|021000021/);
    expect(instruction).toMatchObject({
      provider_name: 'circle',
      provider_payout_id: 'circle-payout-live-1',
      execution_mode: 'sandbox_api',
    });
    expect((instruction.metadata as any).provider_payload.destination.id).toMatch(/^\[REDACTED_HASH:/);
    expect((instruction.metadata as any).provider_response.data.destination.id).toMatch(/^\[REDACTED_HASH:/);
    expect((instruction.metadata as any).destination_metadata.account_number).toBe('[REDACTED_LAST4:6789]');
    expect((instruction.status_history?.[0].evidence as any).data.destination.id).toMatch(/^\[REDACTED_HASH:/);
  });

  it('polls Circle payout status with the default sandbox endpoint', async () => {
    process.env.ENABLE_REAL_PAYOUT_EXECUTION = 'true';
    process.env.CIRCLE_API_KEY = 'circle-test-key';
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: 'circle-payout-live-1',
          status: 'complete',
          trackingRef: 'CIR-TEST-1',
          destination: {
            type: 'wire',
            id: 'circle-bank-account-1',
          },
        },
      }),
    } as any);

    const observation = await new CircleCompatibilityAdapter().getPayoutStatus('circle-payout-live-1');

    expect(fetchSpy.mock.calls[0][0]).toBe('https://api-sandbox.circle.com/v1/businessAccount/payouts/circle-payout-live-1');
    expect(observation).toMatchObject({
      provider_name: 'circle',
      provider_payout_id: 'circle-payout-live-1',
      status: 'completed',
      raw_status: 'complete',
      source: 'poll',
    });
    expect((observation.evidence as any).data.destination.id).toMatch(/^\[REDACTED_HASH:/);
  });

  it('rejects unknown payout adapters instead of falling back to mock', () => {
    expect(() => getPayoutProviderAdapter('typo-provider')).toThrow(/unsupported payout provider/i);
  });

  it('reports provider readiness and normalizes signed provider events', () => {
    process.env.CIRCLE_PAYOUT_WEBHOOK_SECRET = 'circle-secret';
    const adapter = new CircleCompatibilityAdapter();

    expect(adapter.getCapabilities()).toMatchObject({
      provider_name: 'circle',
      execution_mode: 'compatibility',
      execution_enabled: false,
      supports: {
        create_instruction: true,
        webhooks: true,
        usd_bank_destination: true,
      },
    });
    expect(adapter.normalizeWebhookEvent?.({
      id: 'event-circle-1',
      type: 'payout.completed',
      data: {
        id: 'circle-payout-1',
        status: 'complete',
      },
    })).toMatchObject({
      provider_name: 'circle',
      provider_event_id: 'event-circle-1',
      provider_payout_id: 'circle-payout-1',
      status: 'completed',
    });
  });
});
