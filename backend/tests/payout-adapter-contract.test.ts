import {
  BridgeCompatibilityAdapter,
  CircleCompatibilityAdapter,
  EtherfusePixOffRampAdapter,
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
    expect((instruction.metadata as any).provider_payload.destination.account_number).toBe('[configured]');
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
    expect((instruction.metadata as any).provider_payload.destination.account_number).toBe('[configured]');
    expect((instruction.metadata as any).provider_payload.destination.iban).toBe('[configured]');
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
