jest.mock('../src/utils/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import { CctpService } from '../src/integrations/cctp/service';
import { CCTP_DOMAIN_IDS, STELLAR_DOMAIN_ID } from '../src/integrations/cctp/types';

describe('CctpService', () => {
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CCTP_DOMAIN_IDS / STELLAR_DOMAIN_ID', () => {
    it('has correct domain IDs per chain', () => {
      expect(CCTP_DOMAIN_IDS.ethereum).toBe(0);
      expect(CCTP_DOMAIN_IDS.avalanche).toBe(1);
      expect(CCTP_DOMAIN_IDS.solana).toBe(5);
      expect(CCTP_DOMAIN_IDS.base).toBe(6);
      expect(CCTP_DOMAIN_IDS.polygon).toBe(7);
    });

    it('Stellar domain ID is 4', () => {
      expect(STELLAR_DOMAIN_ID).toBe(4);
    });
  });

  describe('getSupportedChains', () => {
    it('returns all 5 supported chains', () => {
      const chains = CctpService.getSupportedChains();
      expect(chains).toHaveLength(5);
      const chainNames = chains.map(c => c.chain);
      expect(chainNames).toContain('ethereum');
      expect(chainNames).toContain('base');
      expect(chainNames).toContain('solana');
    });

    it('each chain has required fields', () => {
      const chains = CctpService.getSupportedChains();
      for (const chain of chains) {
        expect(typeof chain.domainId).toBe('number');
        expect(typeof chain.instructions).toBe('string');
        expect(chain.instructions.length).toBeGreaterThan(10);
      }
    });

    it('Ethereum chain has contract address', () => {
      const chains = CctpService.getSupportedChains();
      const eth = chains.find(c => c.chain === 'ethereum');
      expect(eth?.contractAddress).toBeTruthy();
      expect(eth?.contractAddress).toMatch(/^0x/);
    });
  });

  describe('checkTransferStatus', () => {
    it('returns attested status when Circle says complete', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{
            status: 'complete',
            message: 'AAABBBBCCCC',
            attestation: '0xSIGNATURE',
          }],
        }),
      } as any);

      const result = await CctpService.checkTransferStatus('0xdeadbeef', 'ethereum');

      expect(result.status).toBe('attested');
      expect(result.canMint).toBe(true);
      expect(result.attestation).toBe('0xSIGNATURE');
    });

    it('returns pending when messages array is empty', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [] }),
      } as any);

      const result = await CctpService.checkTransferStatus('0xdeadbeef', 'base');

      expect(result.status).toBe('pending');
      expect(result.canMint).toBe(false);
    });

    it('returns pending for non-complete Circle status', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          messages: [{ status: 'pending_confirmations' }],
        }),
      } as any);

      const result = await CctpService.checkTransferStatus('0xdeadbeef', 'solana');

      expect(result.status).toBe('pending');
      expect(result.canMint).toBe(false);
    });

    it('returns unknown on HTTP error and does not throw', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      } as any);

      const result = await CctpService.checkTransferStatus('0xdeadbeef', 'ethereum');

      expect(result.status).toBe('unknown');
      expect(result.canMint).toBe(false);
      expect(result.error).toContain('HTTP 500');
    });

    it('returns unknown on network failure and does not throw', async () => {
      fetchMock.mockRejectedValue(new Error('connection refused'));

      const result = await CctpService.checkTransferStatus('0xdeadbeef', 'ethereum');

      expect(result.status).toBe('unknown');
      expect(result.canMint).toBe(false);
      expect(result.error).toContain('connection refused');
    });
  });

  describe('buildInstructions', () => {
    it('includes destination address and amount', () => {
      const instructions = CctpService.buildInstructions(
        'GSTELLARADDRESS',
        '100',
        'ethereum',
      );
      expect(instructions).toContain('GSTELLARADDRESS');
      expect(instructions).toContain('100 USDC');
    });

    it('uses chain label in instructions', () => {
      const instructions = CctpService.buildInstructions('GABC', '50', 'base');
      expect(instructions).toContain('Base');
    });

    it('mentions ~3 minutes for delivery', () => {
      const instructions = CctpService.buildInstructions('GABC', '50', 'solana');
      expect(instructions).toContain('3 minutos');
    });
  });
});
