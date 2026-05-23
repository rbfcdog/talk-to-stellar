import { SupabaseClient } from '@supabase/supabase-js';

export class VaultService {
  constructor(private supabase: SupabaseClient) {}

  private isDuplicateSecretNameError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    const code = String(error?.code || '');

    return (
      code === '23505' ||
      message.includes('duplicate key value violates unique constraint') ||
      message.includes('secrets_name_idx') ||
      message.includes('unique constraint')
    );
  }

  private async getSecretIdByUniqueName(uniqueName: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .schema('vault')
      .from('secrets')
      .select('id')
      .eq('name', uniqueName)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return (data as any)?.id ? String((data as any).id) : null;
  }

  async storeSecret(secretValue: string, uniqueName?: string, description?: string): Promise<string> {
    // Single function signature: store_private_key(secret_value, unique_name, secret_description)
    const args = {
      secret_value: secretValue,
      unique_name: uniqueName || null,
      secret_description: description || null,
    };

    const { data, error } = await this.supabase.rpc('store_private_key', args);

    if (!error && data) {
      return String(data);
    }

    if (uniqueName && this.isDuplicateSecretNameError(error)) {
      const existingSecretId = await this.getSecretIdByUniqueName(uniqueName);
      if (existingSecretId) {
        return existingSecretId;
      }
    }

    throw new Error(
      `Failed to store secret in Vault: ${error?.message || JSON.stringify(error)}. ` +
      `Ensure the Vault RPC migrations have run and the backend is using SUPABASE_SERVICE_ROLE_KEY.`
    );
  }

  async getSecret(secretId: string): Promise<string> {
    const { data, error } = await this.supabase.rpc('get_private_key', {
      secret_id: secretId,
    });

    if (error) {
      throw new Error(`Failed to read secret from Vault: ${error.message || JSON.stringify(error)}`);
    }

    return String(data || '');
  }
}

export default VaultService;
