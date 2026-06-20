process.env.STELLAR_NETWORK = 'testnet';

const mockSdkMethods = {
  getVaultInfo: jest.fn(),
  getVaultAPY: jest.fn(),
  getVaultBalance: jest.fn(),
  depositToVault: jest.fn(),
  withdrawFromVault: jest.fn(),
  healthCheck: jest.fn(),
};

const mockDefindexSDK = jest.fn(() => mockSdkMethods);

jest.mock('@defindex/sdk', () => ({ DefindexSDK: mockDefindexSDK }));

jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { DefindexService } from '../src/integrations/defindex/service';
import {
  DEFINDEX_USDC_VAULT_TESTNET,
  DEFINDEX_USDC_VAULT_MAINNET,
} from '../src/integrations/defindex/config';

describe('DefindexService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  // ── getVaultInfo ──────────────────────────────────────────────────────────

  it('getVaultInfo — calls SDK with default testnet vault when no address given', async () => {
    process.env.STELLAR_NETWORK = 'testnet';
    mockSdkMethods.getVaultInfo.mockResolvedValue({ name: 'USDC Vault' });
    mockSdkMethods.getVaultAPY.mockResolvedValue({ apy: 0.086 });

    const result = await DefindexService.getVaultInfo();

    expect(result.vault).toBe(DEFINDEX_USDC_VAULT_TESTNET);
    expect(result.info).toEqual({ name: 'USDC Vault' });
    expect(result.apy).toEqual({ apy: 0.086 });
  });

  it('getVaultInfo — uses provided vault address', async () => {
    mockSdkMethods.getVaultInfo.mockResolvedValue({ name: 'Custom Vault' });
    mockSdkMethods.getVaultAPY.mockResolvedValue(null);

    await DefindexService.getVaultInfo('CUSTOMVAULT');

    expect(mockSdkMethods.getVaultInfo).toHaveBeenCalledWith('CUSTOMVAULT', expect.any(String));
  });

  // ── getUserBalance ────────────────────────────────────────────────────────

  it('getUserBalance — returns balance for user address', async () => {
    mockSdkMethods.getVaultBalance.mockResolvedValue('100.5');

    const result = await DefindexService.getUserBalance(
      'GUSER000000000000000000000000000000000000000000000000001',
      'CVAULT000000000000000000000000000000000000000000000000001',
    );

    expect(result).toEqual({
      vault: 'CVAULT000000000000000000000000000000000000000000000000001',
      userAddress: 'GUSER000000000000000000000000000000000000000000000000001',
      balance: '100.5',
    });
  });

  // ── buildDepositXdr ───────────────────────────────────────────────────────

  it('buildDepositXdr — passes caller and parsed integer amounts to SDK', async () => {
    mockSdkMethods.depositToVault.mockResolvedValue({ transactionXDR: 'deposit-xdr' });

    const result = await DefindexService.buildDepositXdr(
      'GUSER000000000000000000000000000000000000000000000000001',
      '10000000',
    );

    expect(mockSdkMethods.depositToVault).toHaveBeenCalledWith(
      expect.any(String),
      {
        caller: 'GUSER000000000000000000000000000000000000000000000000001',
        amounts: [10000000],
        invest: false,
      },
      expect.any(String),
    );
    expect(result.xdr).toEqual({ transactionXDR: 'deposit-xdr' });
  });

  // ── buildWithdrawXdr ──────────────────────────────────────────────────────

  it('buildWithdrawXdr — passes caller and parsed integer amounts to SDK', async () => {
    mockSdkMethods.withdrawFromVault.mockResolvedValue({ transactionXDR: 'withdraw-xdr' });

    const result = await DefindexService.buildWithdrawXdr(
      'GUSER000000000000000000000000000000000000000000000000001',
      '5000000',
    );

    expect(mockSdkMethods.withdrawFromVault).toHaveBeenCalledWith(
      expect.any(String),
      {
        caller: 'GUSER000000000000000000000000000000000000000000000000001',
        amounts: [5000000],
      },
      expect.any(String),
    );
    expect(result.xdr).toEqual({ transactionXDR: 'withdraw-xdr' });
  });

  // ── listVaults ────────────────────────────────────────────────────────────

  it('listVaults — returns SDK health check', async () => {
    mockSdkMethods.healthCheck.mockResolvedValue({ status: 'ok' });

    const result = await DefindexService.listVaults();

    expect(result).toEqual({ status: 'ok' });
  });

  // ── getDefaultVault ───────────────────────────────────────────────────────

  it('getDefaultVault — returns testnet vault on testnet', () => {
    process.env.STELLAR_NETWORK = 'testnet';

    expect(DefindexService.getDefaultVault()).toBe(DEFINDEX_USDC_VAULT_TESTNET);
  });

  it('getDefaultVault — returns mainnet vault on mainnet', () => {
    process.env.STELLAR_NETWORK = 'mainnet';

    expect(DefindexService.getDefaultVault()).toBe('CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW');
    expect(DefindexService.getDefaultVault()).toBe(DEFINDEX_USDC_VAULT_MAINNET);
  });
});
