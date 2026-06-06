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
      CIRCLE_PAYOUT_CREATE_URL: '',
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
        provider_api_key_present: false,
        real_execution_enabled: false,
      },
    });
    expect((instruction.metadata as any).provider_payload.destination.account_holder_name).toBe('[REDACTED]');
    expect((instruction.metadata as any).provider_payload.destination.routing_number).toBe('[REDACTED_LAST4:0021]');
    expect((instruction.metadata as any).provider_payload.destination.account_number).toBe('[REDACTED_LAST4:6789]');
    expect((instruction.metadata as any).provider_payload.destination.provider_label).toBe('other');
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
    process.env.CIRCLE_PAYOUT_CREATE_URL = 'https://circle.example.test/payouts';
    const fetchSpy = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'circle-payout-live-1',
        status: 'pending',
        destination: {
          account_number: '123456789',
          routing_number: '021000021',
        },
      }),
    } as any);

    const instruction = await new CircleCompatibilityAdapter().createPayoutInstruction(baseInput);

    const request = fetchSpy.mock.calls[0][1] as RequestInit;
    const sentPayload = JSON.parse(String(request.body));
    expect(sentPayload.destination).toMatchObject({
      account_holder_name: 'Destination USD Institution LLC',
      account_number: '123456789',
      routing_number: '021000021',
    });
    expect(instruction).toMatchObject({
      provider_name: 'circle',
      provider_payout_id: 'circle-payout-live-1',
      execution_mode: 'live_api',
    });
    expect((instruction.metadata as any).provider_payload.destination.account_number).toBe('[REDACTED_LAST4:6789]');
    expect((instruction.metadata as any).provider_response.destination.account_number).toBe('[REDACTED_LAST4:6789]');
    expect((instruction.status_history?.[0].evidence as any).destination.account_number).toBe('[REDACTED_LAST4:6789]');
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
