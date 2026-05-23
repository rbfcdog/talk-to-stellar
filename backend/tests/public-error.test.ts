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
});
