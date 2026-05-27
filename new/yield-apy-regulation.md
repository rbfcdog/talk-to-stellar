# APY de rendimento: fonte dos dados, mocks e regulacao

Data da pesquisa: 2026-05-26.

Este documento explica de onde saem taxas como "Dolares 13,68% ao ano", "Rendimento Mexico 12,82% ao ano" e "XLM 16,74% ao ano", quando isso e dado real, quando e simulacao, e quais riscos regulatorios precisam ser tratados antes de qualquer uso em producao.

Isto nao e parecer juridico. Antes de oferecer rendimento real para usuarios, tratar como assunto de produto regulado e validar com advogado financeiro/mercado de capitais em cada jurisdicao.

Atualizacao de implementacao: o backend agora exige `DEFINDEX_COMPLIANCE_APPROVED=true` alem de `DEFINDEX_ENABLE_EXECUTION=true` para enviar transacoes DeFindex. A UX fica em modo revisao/simulacao enquanto essa aprovacao nao existir.

## Resposta curta

Esses percentuais nao sao hardcoded na tela de rendimento.

No fluxo principal de `/yield` e nas tool calls de rendimento, o backend busca os APYs na DeFindex:

1. `GET /api/ramp/defindex/yield/status`
2. `AnchorService.getDefindexYieldStatus()`
3. `DefindexYieldService.getVaultAPY(vault_address, network)`
4. SDK `@defindex/sdk`, com `DEFINDEX_API_KEY`, `DEFINDEX_BASE_URL`, `DEFINDEX_NETWORK` e vaults configurados.

Entao, se a tela mostrou 13,68%, 12,82% e 16,74%, o mais provavel e que esses numeros vieram da API DeFindex para os vaults configurados no ambiente. Eles nao parecem ser os fallbacks estaticos do frontend.

Mas existe uma distincao importante: se o ambiente esta em `testnet`, esses APYs sao dados de vaults testnet. Eles podem ser tecnicamente "reais" como resposta da API, mas nao devem ser tratados como rendimento economico real, promessa de retorno, produto investivel ou dado adequado para marketing.

## Onde o codigo usa dado real

Arquivos relevantes:

- `backend/src/api/services/anchor.service.ts`
- `backend/src/api/services/defindex-yield.service.ts`
- `backend/src/api/agent/tools.ts`
- `frontend/app/rendimentos/rendimentos-client.tsx`

O ponto exato e:

```ts
const apy = await DefindexYieldService.getVaultAPY(vault.vault_address, runtime.network);
enriched.apy = apy;
enriched.apy_percent = coalesceString(apy?.apyPercent, apy?.apy_percent, apy?.apy);
enriched.apy_period = coalesceString(apy?.period, apy?.calculationPeriod);
```

E o SDK chama:

```ts
static async getVaultAPY(vaultAddress: string, network = defaultNetwork()): Promise<any> {
  return this.sdk(network).getVaultAPY(vaultAddress, sdkNetwork(network));
}
```

Isso significa:

- se `DEFINDEX_API_KEY` esta configurado;
- se existem vaults em `DEFINDEX_USDC_VAULT`, `DEFINDEX_CETES_VAULT`, `DEFINDEX_XLM_VAULT`, etc.;
- e se `DEFINDEX_NETWORK` bate com a rede do app;

entao a taxa vem da DeFindex. Se a chamada falha, o backend coloca `apy_error`; a UI deve tratar como indisponivel.

## Onde ainda existe simulacao/fallback

Existem mocks e simulacoes, mas eles nao sao a fonte normal da lista da tela `/yield`.

| Local | O que acontece | Risco |
| --- | --- | --- |
| Testes Jest | `getVaultAPY` e mockado em testes como `defindex-yield-transactions.test.ts` | Nao afeta runtime. |
| `/convert` | O frontend tem taxas fallback para projecao quando a API de yield nao traz APY | Deve ser marcado como simulacao. |
| Grafico de `/yield` | Usa o APY recebido para projetar 12 meses | E simulacao matematica, nao promessa. |
| Testnet | Vaults podem responder APY via API, mas sem valor economico real | Precisa aparecer como "testnet/simulacao". |

Fallbacks atuais em `/convert`:

- BRL: `10.5%`
- USDC: `4.5%`
- CETES: `8.75%`
- XLM: `0%`

Como os numeros que voce viu sao `13.68%`, `12.82%` e `16.74%`, eles nao batem com esses fallbacks. Portanto, sao provavelmente APYs retornados pela DeFindex para os vaults do ambiente.

## Como a DeFindex calcula/expõe APY

Pela documentacao da DeFindex, vaults conectam fundos a estrategias DeFi; os usuarios depositam em vaults, os vaults alocam em estrategias, e taxas podem ser cobradas sobre yield gerado. A documentacao tambem mostra que a API/SDK tem operacoes de `deposit`, `withdraw`, `balance` e `apy`.

A DeFindex descreve APY de vault como crescimento do "vault price per share" ao longo do tempo. Em termos simples:

1. mede-se quanto vale uma share do vault em dois momentos;
2. calcula-se a variacao;
3. anualiza-se essa variacao.

Isso cria dois pontos de atencao:

- APY e historico/estimado, nao taxa contratada.
- APY anualizado sobre periodo curto pode parecer muito alto ou mudar rapido.

No nosso produto, a copy correta deveria ser algo como:

> "APY historico estimado, variavel, calculado pela DeFindex para este vault. Nao e garantia de retorno."

Evitar:

> "Seu dinheiro rende 16,74% garantido."

## Interpretacao dos tres ativos

### USDC / "Dolares"

No codigo, "Dolares" normalmente significa USDC. Se houver vault USDC configurado, o APY e o APY do vault USDC da DeFindex.

Isso nao e deposito bancario em dolar, nao e conta remunerada tradicional, nao e FDIC/SIPC, e nao deve ser vendido como "savings account".

### CETES / "Rendimento Mexico"

No codigo, `CETES` foi usado porque nao havia EURC em testnet. Isso e perigoso do ponto de vista de produto: chamar algo de CETES pode sugerir exposicao a titulos publicos mexicanos.

So deve usar "CETES" em producao se a estrutura juridica realmente entregar exposicao a CETES ou valores governamentais mexicanos por meio autorizado. Se for apenas um asset/vault testnet com label CETES, a UI deve dizer:

- "Rendimento Mexico - testnet"
- "Opcao Mexico em teste"
- ou outro nome que nao prometa exposicao a titulo publico mexicano.

Pela documentacao oficial do cetesdirecto, o servico e execucao nao assessorada: nao e recomendacao personalizada, e o cliente deve verificar se os valores fazem sentido para seu objetivo e risco. Isso reforca que uma UX que escolhe "melhor rendimento" automaticamente pode virar recomendacao/assessoria se nao for desenhada com cuidado.

### XLM

XLM nao tem staking nativo na rede Stellar. A documentacao oficial da Stellar diz que o SCP nao e proof-of-stake e que validadores nao recebem recompensas monetarias.

Logo, se aparece "XLM 16,74% ao ano", isso nao pode ser descrito como "staking de XLM". O texto correto e:

> "APY historico estimado de um vault DeFindex que usa XLM/estrategias relacionadas."

E nao:

> "XLM rende 16,74% na rede Stellar."

## Risco regulatorio no Brasil

### 1. Marco legal de ativos virtuais

A Lei 14.478/2022 define ativo virtual como representacao digital de valor que pode ser negociada ou transferida eletronicamente e usada para pagamento ou investimento. A lei tambem diz que prestadoras de servicos de ativos virtuais so podem funcionar no Brasil mediante autorizacao previa do orgao federal competente.

O Decreto 11.563/2023 atribuiu ao Banco Central do Brasil a competencia para disciplinar e supervisionar prestadoras de servicos de ativos virtuais.

Em 2025, o Banco Central publicou normas de autorizacao e funcionamento para sociedades prestadoras de servicos de ativos virtuais. Portanto, se o produto:

- recebe ativos do usuario;
- guarda ou controla chave;
- transmite ativos;
- troca entre ativos;
- executa rendimento ou vaults em nome do usuario;

ha forte risco de enquadramento como prestacao de servico de ativos virtuais, com necessidade de autorizacao, governanca, controles, AML/KYC e compliance.

### 2. CVM e valores mobiliarios

A CVM orienta que criptoativos classificados como valores mobiliarios ficam sujeitos as regras de oferta publica, negociacao, intermediação e demais normas de mercado de capitais.

Pontos que aumentam risco CVM:

- prometer ou divulgar rendimento;
- vender "melhor estrategia" ou "melhor rendimento";
- expectativa de lucro depender do esforco de terceiros;
- token representar recebivel, renda fixa, cota, titulo, carteira gerida ou contrato de investimento coletivo;
- UI ordenar, recomendar ou alocar automaticamente por taxa.

Se o app oferece acesso a vaults que investem em estrategias geridas por terceiros e o usuario espera lucro do trabalho desses terceiros, isso pode se aproximar de contrato de investimento coletivo. Nao da para tratar apenas como "feature tecnica".

### 3. Linguagem de produto recomendada para Brasil

Usar:

- "APY estimado"
- "historico"
- "variavel"
- "nao garantido"
- "sujeito a risco de smart contract, mercado, liquidez e contraparte"
- "ambiente testnet/sandbox" quando aplicavel

Evitar:

- "garantido"
- "sem risco"
- "renda fixa" sem estrutura juridica real
- "CETES" sem lastro/autorizacao real
- "conta remunerada"
- "poupanca"
- "deposito"
- "melhor investimento para voce"

## Risco regulatorio nos EUA

### 1. Crypto interest accounts

O Investor.gov/SEC alerta que contas que pagam juros sobre crypto nao sao iguais a depositos bancarios ou cooperativas de credito, nao tem as mesmas protecoes e podem envolver riscos como volatilidade, iliquidez, falencia da empresa, erro, default e fraude.

Esse ponto afeta diretamente a UX: se o app tiver usuario dos EUA, nao deve parecer conta bancaria remunerada.

### 2. Securities / investment contracts

A SEC analisou "crypto interest-bearing accounts" em casos como BlockFi. O risco cresce quando o usuario entrega ativos e recebe promessa de retorno baseada em atividades de investimento/lending/estrategias de terceiros.

Em 2025, a equipe da SEC emitiu statement sobre certas atividades de protocol staking em redes proof-of-stake, mas esse statement e limitado e nao cobre toda forma de rendimento. Ele mesmo ressalva que nao trata todas as variacoes e nao e regra com forca legal. Alem disso, Stellar nao e proof-of-stake, entao isso nao resolve XLM vault yield.

### 3. Money transmission / MSB

FinCEN diferencia usuario, administrador e exchanger. Usuario de virtual currency nao e MSB apenas por usar; mas administrador ou exchanger, em regra, pode ser money transmitter/MSB. Se o produto aceita/transmite/troca valor virtual como negocio, esse risco existe.

Para EUA, antes de producao, precisa mapear:

- FinCEN MSB registration;
- state money transmitter licenses;
- sanctions/OFAC screening;
- SEC/securities analysis;
- investment adviser/broker-dealer analysis se houver recomendacao ou estrategia.

## Risco regulatorio no Mexico / CETES

Se o produto realmente usar CETES mexicanos, entra uma camada adicional:

- valores governamentais mexicanos;
- distribuicao/corretagem/execucao;
- elegibilidade de usuario;
- regras de oferta transfronteirica;
- custodia;
- impostos e retencoes.

A documentacao do cetesdirecto deixa claro que e um servico de execucao nao assessorada e que as operacoes nao sao recomendacao personalizada da NAFIN. Portanto, se a UI do TalkToStellar escolhe ou recomenda "Rendimento Mexico" para o usuario, e preciso tomar cuidado para nao parecer assessoria sem licenca.

No estado atual do repo, `CETES` deve ser tratado como label tecnico/testnet ate existir:

1. ativo/issuer real;
2. lastro juridico real;
3. documentos de oferta;
4. parceiro autorizado;
5. politica de suitability/disclosure;
6. revisao regulatoria Mexico/Brasil/EUA.

## Recomendacao para o produto agora

### Enquanto estiver em testnet

1. Mostrar badge fixa: "Ambiente de teste".
2. Trocar "ao ano" por "APY de teste".
3. Mostrar fonte: "DeFindex testnet".
4. Nunca mostrar "garantido".
5. Bloquear copy de marketing de "renda fixa", "CETES real" ou "conta remunerada".
6. Guardar log da resposta DeFindex: vault, APY, periodo, timestamp, network.

### Antes de producao

1. Criar matriz legal por pais: Brasil, EUA, Mexico, UE se voltar EUR.
2. Decidir se o app e custodial ou non-custodial de verdade.
3. Decidir se TalkToStellar recomenda investimento ou apenas executa ordem do usuario.
4. Se ordenar por "melhor APY", explicar criterio e risco; nao chamar de recomendacao personalizada.
5. Criar Terms, Risk Disclosure e Product Disclosure antes de executar.
6. Validar se cada vault pode ser ofertado para varejo.
7. Implementar bloqueio geografico se necessario.
8. Colocar `DEFINDEX_ENABLE_EXECUTION=true` apenas para ambientes onde compliance e assinatura estejam aprovados.

## Mudanca de UX recomendada

Texto recomendado para card de taxa:

> APY estimado: 13,68%  
> Fonte: DeFindex testnet  
> Historico e variavel. Nao e garantia de retorno. Este ambiente e de teste.

Texto recomendado para XLM:

> XLM nao possui staking nativo na Stellar. Esta taxa, quando disponivel, vem de vault/estrategia DeFindex e pode variar.

Texto recomendado para CETES:

> Nome de teste para estrategia Mexico. Nao representa CETES oficiais enquanto nao houver estrutura juridica e lastro confirmados.

## Conclusao

Os APYs da tela de rendimento nao sao mocks de frontend no fluxo principal. Eles sao retornados pela DeFindex para vaults configurados. Mas, em testnet, devem ser tratados como dados tecnicos de teste e nao como produto financeiro real.

Para producao, a parte regulatoria e material. A combinacao de "guardar dinheiro", "rendimento", "melhor opcao", assets virtuais, possivel custodia e possivel execucao em vaults cria risco de enquadramento como:

- prestacao de servicos de ativos virtuais;
- oferta de valor mobiliario / contrato de investimento coletivo;
- conta de crypto com rendimento;
- money transmission/MSB;
- recomendacao/assessoria de investimento;
- distribuicao transfronteirica de valores governamentais, se "CETES" for real.

O caminho seguro e manter em testnet com disclosure forte ate haver estrutura legal, parceiro autorizado e decisao clara entre "interface de execucao nao assessorada" e "produto de investimento".

## Fontes pesquisadas

- DeFindex SDK e APY: https://docs.defindex.io/wallet-developer-and-vault-managers/sdks/02-defindex-sdk
- DeFindex API integration: https://docs.defindex.io/wallet-developer-and-vault-managers/api-reference/api
- DeFindex Vault APY: https://docs.defindex.io/whitepaper/10-whitepaper/vault-apy
- DeFindex How It Works: https://docs.defindex.io/getting-started/how-defindex-works
- Stellar SCP: https://developers.stellar.org/docs/learn/fundamentals/stellar-consensus-protocol
- Stellar Lumens: https://developers.stellar.org/docs/learn/fundamentals/lumens
- Lei 14.478/2022: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/L14478.htm
- Decreto 11.563/2023: https://www.presidencia.gov.br/ccivil_03/_Ato2023-2026/2023/Decreto/D11563.htm
- BCB, regulacao de prestadoras de servicos de ativos virtuais: https://bcb.gov.br/detalhenoticia/20918/nota
- Resolucao BCB 519/2025: https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=519&tipo=Resolu%C3%A7%C3%A3o+BCB
- Resolucao BCB 520/2025: https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?numero=520&tipo=Resolu%C3%A7%C3%A3o+BCB
- CVM, criptoativos e regras aplicaveis: https://www.gov.br/cvm/pt-br/acesso-a-informacao-cvm/perguntas-frequentes-da-cvm/criptoativos-quando-se-aplicam-as
- CVM, Parecer de Orientacao 40: https://www.gov.br/cvm/pt-br/assuntos/noticias/2022/cvm-divulga-parecer-de-orientacao-sobre-criptoativos-e-o-mercado-de-valores-mobiliarios
- Investor.gov/SEC, crypto asset interest-bearing accounts: https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/investor-bulletin-crypto-asset-interest-bearing-accounts
- SEC, protocol staking statement: https://www.sec.gov/newsroom/speeches-statements/statement-certain-protocol-staking-activities-052925
- FinCEN virtual currency guidance: https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering
- Cetesdirecto produtos: https://www.cetesdirecto.com/sites/portal/productos.cetesdirecto
