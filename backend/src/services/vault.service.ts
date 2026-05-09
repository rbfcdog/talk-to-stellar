import { SupabaseClient } from '@supabase/supabase-js';

export class VaultService {
  constructor(private supabase: SupabaseClient) {}

  private escapeSqlLiteral(value: string): string {
    return value.replace(/'/g, "''");
  }

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
    const sql = `select id::text as result from vault.secrets where name = '${this.escapeSqlLiteral(uniqueName)}' limit 1;`;
    const { data, error } = await this.supabase.rpc('exec_sql', { sql });

    if (error || !data) {
      return null;
    }

    const firstRow = Array.isArray(data) ? data[0] : data;
    const id = (firstRow as any)?.result || (firstRow as any)?.id || (firstRow as any)?.secret_id || firstRow;
    return id ? String(id) : null;
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

    // If primary RPC fails, try fallback via exec_sql
    const errorMessage = String(error?.message || '').toLowerCase();
    if (errorMessage.includes('could not find the function') || errorMessage.includes('schema cache')) {
      try {
        const secretDescription = description || '';
        const secretName = uniqueName || '';
        const sql = `select vault.create_secret('${this.escapeSqlLiteral(secretValue)}', ${secretName ? `'${this.escapeSqlLiteral(secretName)}'` : 'null'}, ${secretDescription ? `'${this.escapeSqlLiteral(secretDescription)}'` : 'null'}) as id;`;
        const { data: execData, error: execError } = await this.supabase.rpc('exec_sql', { sql });

        if (!execError && execData) {
          const firstRow = Array.isArray(execData) ? execData[0] : execData;
          const maybeId = (firstRow as any)?.result || (firstRow as any)?.id || (firstRow as any)?.secret_id || firstRow;
          if (maybeId) {
            return String(maybeId);
          }
        }

        if (uniqueName && execError && this.isDuplicateSecretNameError(execError)) {
          const existingSecretId = await this.getSecretIdByUniqueName(uniqueName);
          if (existingSecretId) {
            return existingSecretId;
          }
        }

        throw execError || error;
      } catch (execError) {
        throw execError;
      }
    }

    throw new Error(
      `Failed to store secret in Vault: ${error?.message || JSON.stringify(error)}. ` +
      `Ensure migrations have run. See backend/src/migrations/agent.migration.ts for setup.`
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
