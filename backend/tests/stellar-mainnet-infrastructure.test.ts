import { Networks } from '@stellar/stellar-sdk';

import {
  STELLAR_NETWORK_PROFILES,
  getStellarMainnetReadinessReport,
  loadStellarMainnetInfrastructureConfig,
} from '../src/infrastructure/stellar';
import { PUBLIC_USDC_ISSUER } from '../src/config/assets';

describe('Stellar Mainnet infrastructure', () => {
  it('keeps the official SDK passphrases in the network profiles', () => {
    expect(STELLAR_NETWORK_PROFILES.TESTNET.networkPassphrase).toBe(Networks.TESTNET);
    expect(STELLAR_NETWORK_PROFILES.PUBLIC.networkPassphrase).toBe(Networks.PUBLIC);
    expect(STELLAR_NETWORK_PROFILES.PUBLIC.horizonUrl).toBe('https://horizon.stellar.org');
  });

  it('loads Mainnet defaults from isolated STELLAR_MAINNET variables only', () => {
    const config = loadStellarMainnetInfrastructureConfig({
      STELLAR_NETWORK: 'TESTNET',
      STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
    });

    expect(config.activeRuntimeNetwork).toBe('TESTNET');
    expect(config.horizonUrl).toBe('https://horizon.stellar.org');
    expect(config.networkPassphrase).toBe(Networks.PUBLIC);
    expect(config.assets.USDC).toBe(PUBLIC_USDC_ISSUER);
    expect(config.enabled).toBe(false);
    expect(config.allowRuntimeActivation).toBe(false);
  });

  it('reports the default state as safe for Testnet but not ready for activation', () => {
    const report = getStellarMainnetReadinessReport({
      STELLAR_NETWORK: 'TESTNET',
    });

    expect(report.safeForCurrentTestnetRuntime).toBe(true);
    expect(report.activationBlockedByDesign).toBe(true);
    expect(report.readyForActivation).toBe(false);
    expect(report.warnings.some((warning) => warning.includes('mainnet-enabled-flag'))).toBe(true);
  });

  it('can become activation-ready when the future cutover guard and required controls are explicit', () => {
    const report = getStellarMainnetReadinessReport({
      STELLAR_NETWORK: 'TESTNET',
      STELLAR_MAINNET_ENABLED: 'true',
      STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION: 'true',
      STELLAR_MAINNET_SIGNER_MODE: 'external',
      STELLAR_MAINNET_EXTERNAL_SIGNER_URL: 'https://signer.example.com/stellar',
      STELLAR_MAINNET_FEE_TREASURY_PUBLIC_KEY: PUBLIC_USDC_ISSUER,
      STELLAR_MAINNET_DISTRIBUTION_PUBLIC_KEY: PUBLIC_USDC_ISSUER,
      STELLAR_MAINNET_MAX_PAYMENT_USDC: '100',
      STELLAR_MAINNET_SEP10_HOME_DOMAIN: 'talktostellar.com',
      STELLAR_MAINNET_STELLAR_TOML_URL: 'https://talktostellar.com/.well-known/stellar.toml',
    });

    expect(report.blockers).toEqual([]);
    expect(report.configurationReady).toBe(true);
    expect(report.readyForActivation).toBe(true);
    expect(report.safeForCurrentTestnetRuntime).toBe(false);
  });

  it('blocks accidental PUBLIC runtime activation while the guard is closed', () => {
    const report = getStellarMainnetReadinessReport({
      STELLAR_NETWORK: 'PUBLIC',
      STELLAR_MAINNET_ENABLED: 'true',
      STELLAR_MAINNET_SIGNER_MODE: 'external',
      STELLAR_MAINNET_EXTERNAL_SIGNER_URL: 'https://signer.example.com/stellar',
      STELLAR_MAINNET_FEE_TREASURY_PUBLIC_KEY: PUBLIC_USDC_ISSUER,
      STELLAR_MAINNET_MAX_PAYMENT_USDC: '100',
    });

    expect(report.safeForCurrentTestnetRuntime).toBe(false);
    expect(report.readyForActivation).toBe(false);
    expect(report.blockers.some((blocker) => blocker.includes('runtime-isolation'))).toBe(true);
  });

  it('fails readiness if Mainnet config points back to Testnet infrastructure', () => {
    const report = getStellarMainnetReadinessReport({
      STELLAR_NETWORK: 'TESTNET',
      STELLAR_MAINNET_ENABLED: 'true',
      STELLAR_MAINNET_HORIZON_URL: 'https://horizon-testnet.stellar.org',
      STELLAR_MAINNET_NETWORK_PASSPHRASE: Networks.TESTNET,
      STELLAR_MAINNET_FRIENDBOT_URL: 'https://friendbot.stellar.org',
      STELLAR_MAINNET_SIGNER_MODE: 'external',
      STELLAR_MAINNET_EXTERNAL_SIGNER_URL: 'https://signer.example.com/stellar',
      STELLAR_MAINNET_FEE_TREASURY_PUBLIC_KEY: PUBLIC_USDC_ISSUER,
      STELLAR_MAINNET_MAX_PAYMENT_USDC: '100',
    });

    expect(report.blockers.some((blocker) => blocker.includes('mainnet-horizon-url'))).toBe(true);
    expect(report.blockers.some((blocker) => blocker.includes('mainnet-passphrase'))).toBe(true);
    expect(report.blockers.some((blocker) => blocker.includes('mainnet-friendbot-disabled'))).toBe(true);
  });
});
