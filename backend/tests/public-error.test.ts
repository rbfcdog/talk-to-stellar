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
});
