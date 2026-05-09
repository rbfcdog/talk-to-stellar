import { VaultService } from '../src/services/vault.service';

describe('VaultService', () => {
  it('stores secrets through the Vault RPC helper', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: '11111111-1111-1111-1111-111111111111', error: null });
    const service = new VaultService({ rpc } as any);

    const secretId = await service.storeSecret('super-secret', 'wallet:test', 'test secret');

    expect(secretId).toBe('11111111-1111-1111-1111-111111111111');
    expect(rpc).toHaveBeenCalledWith('store_private_key', {
      secret_value: 'super-secret',
      unique_name: 'wallet:test',
      secret_description: 'test secret',
    });
  });
});
