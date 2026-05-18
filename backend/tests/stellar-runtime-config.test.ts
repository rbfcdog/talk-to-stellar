import { Networks } from '@stellar/stellar-sdk';

describe('active Stellar runtime config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  it('defaults to Testnet with Testnet Horizon and Friendbot', () => {
    delete process.env.STELLAR_NETWORK;
    delete process.env.STELLAR_HORIZON_URL;
    delete process.env.STELLAR_FRIENDBOT_URL;
    delete process.env.STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION;

    jest.resetModules();
    const { stellarConfig } = require('../src/config/stellar');

    expect(stellarConfig.networkName).toBe('TESTNET');
    expect(stellarConfig.network).toBe(Networks.TESTNET);
    expect(stellarConfig.horizonUrl).toBe('https://horizon-testnet.stellar.org');
    expect(stellarConfig.friendbotUrl).toBe('https://friendbot.stellar.org');
  });

  it('blocks PUBLIC runtime unless the cutover guard is explicit', () => {
    process.env.STELLAR_NETWORK = 'PUBLIC';
    delete process.env.STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION;

    jest.resetModules();
    expect(() => require('../src/config/stellar')).toThrow(/STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=true/);
  });

  it('uses Mainnet defaults only when PUBLIC runtime is explicitly allowed', () => {
    process.env.STELLAR_NETWORK = 'PUBLIC';
    process.env.STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION = 'true';
    process.env.STELLAR_HORIZON_URL = '';
    process.env.STELLAR_FRIENDBOT_URL = '';

    jest.resetModules();
    const { stellarConfig } = require('../src/config/stellar');

    expect(stellarConfig.networkName).toBe('PUBLIC');
    expect(stellarConfig.network).toBe(Networks.PUBLIC);
    expect(stellarConfig.horizonUrl).toBe('https://horizon.stellar.org');
    expect(stellarConfig.friendbotUrl).toBeUndefined();
  });

  it('rejects obvious Horizon/network mismatches', () => {
    process.env.STELLAR_NETWORK = 'PUBLIC';
    process.env.STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION = 'true';
    process.env.STELLAR_HORIZON_URL = 'https://horizon-testnet.stellar.org';

    jest.resetModules();
    expect(() => require('../src/config/stellar')).toThrow(/Testnet Horizon URL/);

    process.env.STELLAR_NETWORK = 'TESTNET';
    delete process.env.STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION;
    process.env.STELLAR_HORIZON_URL = 'https://horizon.stellar.org';

    jest.resetModules();
    expect(() => require('../src/config/stellar')).toThrow(/public Mainnet Horizon URL/);
  });
});
