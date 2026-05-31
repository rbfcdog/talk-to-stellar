export function buildCapabilityHelpMessage(): string {
  return [
    "Posso ajudar com sua conta TalkToStellar:",
    "1. Contatos — listar, adicionar e escolher destinatários salvos. Ex.: \"quero ver meus contatos\".",
    "2. Saldo — consultar R$, US$, CETES, XLM e moedas disponíveis. Ex.: \"ver meu saldo\".",
    "3. PIX — trazer dinheiro, retirar para uma chave PIX ou pagar alguém via PIX. Ex.: \"sacar 50 reais para meu PIX\".",
    "4. Conversão — trocar entre R$, US$, CETES, XLM e moedas configuradas, sempre com confirmação antes do PIN. Ex.: \"converter 200 reais para dólar\".",
    "5. Enviar dinheiro — mandar para contato salvo ou carteira externa com revisão antes de confirmar. Ex.: \"enviar 10 dólares para Ana\".",
    "6. Link de pagamento — criar link para cobrar ou receber sem escolher contato antes. Ex.: \"criar link de pagamento de 50 dólares\".",
    "7. Aplicações e posições — aplicar saldo em opções disponíveis, consultar posição atual ou preparar retirada. Ex.: \"quero investir 50 dólares\".",
    "8. Melhor rota — comparar cotação, taxas e caminho antes de enviar ou converter. Ex.: \"qual a melhor rota para 300 reais?\".",
    "9. Histórico — ver operações, conversões, PIX, comprovantes e apelidos. Ex.: \"ver histórico\".",
    "10. Perfil, PIN e acesso — abrir perfil, entrar de novo, trocar ou recuperar PIN e usar biometria quando disponível. Ex.: \"ver meu perfil\".",
    "",
    "Também posso explicar como cada funcionalidade funciona, o que significa cada ativo e como consultar posições/rendimentos.",
    "Pode escrever normal. Quando envolver dinheiro, mande valor, moeda e destino."
  ].join("\n");
}
