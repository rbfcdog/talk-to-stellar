process.env.STELLAR_NETWORK = 'TESTNET';

jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

// --- Supabase mock ---
const mockSupabaseFrom = jest.fn();

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: mockSupabaseFrom,
  },
}));

// --- Stellar SDK mock ---
const mockStream = jest.fn(() => jest.fn()); // returns a close function
const mockCursor = jest.fn(() => ({ stream: mockStream }));
const mockForAccount = jest.fn(() => ({ cursor: mockCursor }));
const mockPayments = jest.fn(() => ({ forAccount: mockForAccount }));

jest.mock('@stellar/stellar-sdk', () => ({
  Horizon: {
    Server: jest.fn(() => ({ payments: mockPayments })),
  },
}));

import { paymentWatcher } from '../src/integrations/payment-watcher/service';

describe('PaymentWatcherService', () => {
  afterEach(() => {
    // Clean up all subscriptions to keep tests isolated
    const { addresses } = paymentWatcher.status();
    for (const addr of addresses) {
      paymentWatcher.unsubscribe(addr);
    }
    jest.clearAllMocks();
  });

  it('subscribe — opens an SSE stream for a new public key', () => {
    paymentWatcher.subscribe('GPUBKEY111111111111111111111111111111111111111111111111');

    expect(mockPayments).toHaveBeenCalled();
    expect(mockForAccount).toHaveBeenCalledWith('GPUBKEY111111111111111111111111111111111111111111111111');
  });

  it('subscribe — ignores duplicate subscriptions', () => {
    const key = 'GPUBKEY222222222222222222222222222222222222222222222222';
    paymentWatcher.subscribe(key);
    paymentWatcher.subscribe(key);

    expect(mockPayments).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe — closes the stream and removes from map', () => {
    const key = 'GPUBKEY333333333333333333333333333333333333333333333333';
    paymentWatcher.subscribe(key);

    expect(paymentWatcher.status().watching).toBe(1);

    paymentWatcher.unsubscribe(key);

    expect(paymentWatcher.status().watching).toBe(0);
  });

  it('status — reports watching count and addresses', () => {
    const key1 = 'GA111111111111111111111111111111111111111111111111111111';
    const key2 = 'GA222222222222222222222222222222222222222222222222222222';
    paymentWatcher.subscribe(key1);
    paymentWatcher.subscribe(key2);

    const { watching, addresses } = paymentWatcher.status();

    expect(watching).toBe(2);
    expect(addresses).toContain(key1);
    expect(addresses).toContain(key2);
  });

  it('start — loads wallets from DB and subscribes all', async () => {
    const walletsBuilder = {
      select: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [{ public_key: 'GA1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }, { public_key: 'GA2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }], error: null }),
    };

    const stellarWalletsBuilder = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [{ public_key: 'GA3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }], error: null }),
    };

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'wallets') return walletsBuilder;
      if (table === 'user_stellar_wallets') return stellarWalletsBuilder;
      return walletsBuilder;
    });

    // start() guards against calling twice — reset by direct call to loadAndSubscribeAll via a fresh-ish path.
    // Since `started` is internal state on the singleton, we call start() and it only
    // subscribes if not already started. We need to ensure it hasn't started yet.
    // If other tests ran start(), this test cannot call it again. So we directly
    // exercise loadAndSubscribeAll indirectly by testing subscribe count after start().
    // Reset started flag is not possible without private access, so we test via the
    // fact that this is the first (and only) test calling start().
    await paymentWatcher.start();

    const { watching, addresses } = paymentWatcher.status();
    expect(watching).toBe(3);
    expect(addresses).toContain('GA1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(addresses).toContain('GA2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(addresses).toContain('GA3AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  });
});
