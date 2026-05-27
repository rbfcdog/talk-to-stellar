# Controles de compliance para rendimento

Este documento resume o que foi alterado no produto para reduzir risco regulatorio no fluxo de rendimento. Isto nao e parecer juridico e nao torna o produto "100% legal". A execucao real depende de revisao formal com advogado/compliance financeiro para cada jurisdicao atendida.

## O que mudou no codigo

1. Execucao DeFindex agora tem duas travas:
   - `DEFINDEX_ENABLE_EXECUTION=true`: liga a execucao tecnica.
   - `DEFINDEX_COMPLIANCE_APPROVED=true`: confirma que houve aprovacao juridica/compliance.
2. Se `DEFINDEX_COMPLIANCE_APPROVED=false`, o backend fica em modo revisao e nao envia transacoes, mesmo em testnet.
3. A tela `/yield` deixou de vender "aplicacao" como produto financeiro e passou a usar linguagem de revisao/simulacao.
4. A UX mostra aviso fixo: APY historico estimado, variavel, sem garantia, sem recomendacao, sem renda fixa, sem poupanca e sem deposito bancario.
5. Em testnet, a UX informa que os numeros servem apenas para teste tecnico.
6. `/convert` nao usa mais APY fallback estatico para projetar rendimento; se a API nao trouxer APY de vault configurado, a simulacao fica em `0`.
7. O agente passou a responder com "opcoes para revisar rendimento" e "APY estimado", sem "melhor investimento", "garantido" ou "per year/ao ano" como promessa.

## Env nova obrigatoria para execucao

```env
DEFINDEX_COMPLIANCE_APPROVED=false
```

Mantenha `false` em sandbox, testnet e demos publicas ate existir:

1. parecer juridico sobre Brasil, EUA, Mexico e qualquer outro pais atendido;
2. decisao formal se o app e custodial, non-custodial, intermediador, consultor ou apenas interface de execucao;
3. termos de uso, risk disclosure e product disclosure aprovados;
4. politica de elegibilidade de usuario e bloqueio geografico, se necessario;
5. AML/KYC e sancoes/OFAC adequados;
6. validacao de que cada vault pode ser oferecido ao publico-alvo;
7. aprovacao para usar nomes como `CETES` apenas se houver lastro/autorizacao real.

## O que ainda nao esta resolvido por codigo

O codigo nao resolve autorizacao regulatoria. Antes de producao, validar:

- Brasil: possivel enquadramento como prestadora de servicos de ativos virtuais, alem de analise CVM se houver valor mobiliario, contrato de investimento coletivo, recomendacao ou oferta publica.
- EUA: risco de money transmission/MSB, securities/investment contract e produto semelhante a crypto interest-bearing account.
- Mexico: se `CETES` for usado como produto real, confirmar lastro, autorizacao, elegibilidade e divulgacao correta.
- XLM: nunca descrever como staking nativo da Stellar. A taxa, se existir, vem de vault/estrategia DeFindex.

## Checklist antes de mudar para `true`

```text
[ ] Revisao juridica/compliance aprovada por jurisdicao.
[ ] Terms, Risk Disclosure e Product Disclosure publicados.
[ ] Copy da UX revisada contra promessas de retorno.
[ ] APY sempre mostrado como historico/estimado/variavel.
[ ] Logs guardam vault, APY, periodo, timestamp e rede.
[ ] KYC/AML/sancoes funcionando.
[ ] Vaults e strategies aprovados para usuarios-alvo.
[ ] Testes de deposito, saque, falha de assinatura, slippage e liquidez em testnet.
[ ] `DEFINDEX_ENABLE_EXECUTION=true`.
[ ] `DEFINDEX_COMPLIANCE_APPROVED=true`.
[ ] Mainnet apenas com `DEFINDEX_ALLOW_MAINNET_EXECUTION=true`.
```

## Fontes oficiais usadas

- DeFindex Vault APY: https://docs.defindex.io/whitepaper/10-whitepaper/vault-apy
- DeFindex SDK: https://docs.defindex.io/advanced-documentation/sdks/02-defindex-sdk
- Stellar SCP: https://developers.stellar.org/docs/learn/fundamentals/stellar-consensus-protocol
- SEC/Investor.gov crypto interest-bearing accounts: https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/investor-bulletin-crypto-asset-interest-bearing-accounts
- FinCEN virtual currency guidance: https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering
- CVM criptoativos: https://www.gov.br/cvm/pt-br/acesso-a-informacao-cvm/perguntas-frequentes-da-cvm/criptoativos-quando-se-aplicam-as
- Banco Central do Brasil, Res. BCB 520/2025: https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=520&tipo=Resolu%C3%A7%C3%A3o+BCB
