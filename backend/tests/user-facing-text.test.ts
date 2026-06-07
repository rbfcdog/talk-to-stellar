import { stripUserFacingSummaryLabels } from '../src/utils/user-facing-text';

describe('user-facing text utilities', () => {
  it('removes Summary and Resumo labels from user-facing lines', () => {
    expect(stripUserFacingSummaryLabels(
      'Summary: We chose the best route for this conversion.\nResumo: Escolhemos a melhor rota.'
    )).toBe('We chose the best route for this conversion.\nEscolhemos a melhor rota.');
  });

  it('does not remove normal account summary wording', () => {
    expect(stripUserFacingSummaryLabels('Resumo rápido da sua conta: saldo e histórico.'))
      .toBe('Resumo rápido da sua conta: saldo e histórico.');
  });
});
