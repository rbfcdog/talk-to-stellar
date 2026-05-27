import { publicErrorMessage } from '../src/utils/public-error';

describe('public-error utility', () => {
  it('hides technical conversion routing details from user-facing messages', () => {
    const message = publicErrorMessage(
      'Não foi encontrado caminho de conversão entre USDC e BRL. source_issuer=GUSDC; dest_issuer=GBRL. Diagnóstico: Sem rota de liquidez na DEX | Confirme trustline.'
    );

    expect(message).toContain('rota segura');
    expect(message).not.toContain('source_issuer');
    expect(message).not.toContain('dest_issuer');
    expect(message).not.toMatch(/trustline|DEX|liquidez/i);
  });

  it('uses the safe fallback for unknown internal errors', () => {
    expect(publicErrorMessage('Unexpected database driver stack trace')).toBe(
      'Nao consegui concluir agora. Tente novamente em alguns segundos.'
    );
  });

  it('hides testnet account funding internals from user-facing messages', () => {
    const message = publicErrorMessage(
      'Failed to fund account using Friendbot: 400 createAccountAlreadyExist'
    );

    expect(message).toBe('Sua conta ainda esta sendo preparada. Tente novamente em alguns segundos.');
    expect(message).not.toMatch(/Friendbot|createAccountAlreadyExist|Failed to fund/i);
  });

  it('maps aborted operations to a timeout-specific user message', () => {
    const message = publicErrorMessage('This operation was aborted due to timeout');

    expect(message).toContain('demorou demais');
    expect(message).not.toContain('aborted');
    expect(message).not.toBe('Nao consegui concluir agora. Tente novamente em alguns segundos.');
  });

  it('maps missing Etherfuse customer context to PIX account setup guidance', () => {
    const message = publicErrorMessage('customer_id is required.');

    expect(message).toContain('conta PIX');
    expect(message).toContain('Gerar PIX');
    expect(message).not.toContain('customer_id');
  });

  it('hides database unique constraint names from user-facing messages', () => {
    const message = publicErrorMessage('duplicate key value violates unique constraint "idx_external_accounts_data_phone_unique"');

    expect(message).toContain('Ja existe uma conta');
    expect(message).not.toContain('idx_external_accounts_data_phone_unique');
    expect(message).not.toMatch(/duplicate key|unique constraint/i);
  });

  it('maps disabled APY review execution without exposing env names', () => {
    const message = publicErrorMessage('Execução Defindex está desativada. Configure DEFINDEX_ENABLE_EXECUTION=true para assinar e enviar.');

    expect(message).toContain('confirmacao');
    expect(message).toContain('compliance');
    expect(message).not.toMatch(/Defindex|DEFINDEX|ENABLE_EXECUTION|assinar e enviar/i);
  });

  it('maps missing APY review signing material without exposing vault internals', () => {
    const message = publicErrorMessage('Wallet private key is not available in Vault for Defindex yield.');

    expect(message).toContain('conta');
    expect(message).toContain('operacao');
    expect(message).not.toMatch(/Wallet private key|Vault|Defindex|secret/i);
  });
});
