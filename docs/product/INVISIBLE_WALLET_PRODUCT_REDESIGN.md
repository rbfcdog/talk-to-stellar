# TalkToStellar Invisible Wallet Product Redesign

## 0. Resumo executivo

TalkToStellar deve deixar de parecer uma aplicação crypto e passar a operar como uma conta global conversacional dentro de WhatsApp, Telegram e web. Stellar, USDC, trustlines, XDR, Horizon, pathfinding e hashes continuam existindo, mas como infraestrutura privada. O usuário deve perceber apenas uma experiência financeira familiar: saldo em dólar, cotação travada, confirmação, liquidação e comprovante.

A regra central é simples:

> A experiência pública fala a língua de banco. A infraestrutura interna fala a língua de Stellar.

Isso exige uma separação explícita entre:

- **Camada de Experiência:** WhatsApp, Telegram, frontend, mensagens, comprovantes, emails e telas.
- **Camada de Domínio Financeiro:** contas globais, saldo em dólar, pagamentos internacionais, conversões, quotes, recibos e memória financeira.
- **Camada de Infraestrutura Stellar:** contas Stellar, trustlines, XDR, Horizon, path payments, hashes, USDC e XLM.

O produto não deve dizer ao usuário que ele criou uma wallet, assinou uma transação ou recebeu um hash. Ele deve dizer que a conta em dólar está pronta, que o envio foi confirmado e que o comprovante está disponível.

## 1. Mentalidade de produto

### 1.1 O que o produto é

- Conta global conversacional.
- Dólar digital por mensagem.
- Wise dentro do WhatsApp.
- Pagamentos internacionais instantâneos.
- Assistente financeiro com memória contextual.
- Produto financeiro com comprovantes claros, taxas explícitas e cotação travada.

### 1.2 O que o produto não é

- Wallet crypto.
- Exchange.
- App Web3.
- Explorador de blockchain.
- Interface para gerenciar Stellar.
- Ferramenta para usuários assinarem XDR manualmente.

### 1.3 Princípios não negociáveis

- Nunca expor termos Web3 na experiência pública.
- Toda operação precisa ter um comprovante legível.
- Toda conversão precisa ter cotação com validade explícita.
- Toda ação financeira precisa ter confirmação clara antes da liquidação.
- O usuário deve conseguir usar o produto sem entender o que é Stellar.
- A IA deve raciocinar em termos financeiros, não em termos de comandos técnicos.
- Os logs, analytics e eventos visíveis a times não técnicos devem usar linguagem financeira.
- Termos técnicos só podem aparecer em logs internos de infraestrutura e código de adapter.

## 2. Nova linguagem do produto

### 2.1 Vocabulário público aprovado

Use estes termos em bot, frontend, API pública, emails, docs comerciais, analytics de produto e suporte:

| Conceito | Termo público aprovado |
|---|---|
| Conta do usuário | conta global |
| Saldo | saldo disponível |
| Saldo USDC | saldo em dólar |
| Criar capacidade de receber USDC | ativar conta em dólar |
| Enviar USDC | enviar pagamento internacional |
| Receber USDC | receber pagamento em dólar |
| Conversão | conversão de moeda |
| Quote | cotação |
| Quote lock | cotação travada |
| Transaction | operação |
| Transaction hash | identificador da operação |
| Ledger settlement | liquidação |
| Network fee | taxa operacional |
| Blockchain confirmation | confirmação da liquidação |
| Claim link | link de recebimento |
| Pay Anyone | pagamento por link |
| Passkey signing | confirmação segura |
| Wallet recovery | recuperação de conta |
| Public key | identificador interno da conta |
| Destination address | destinatário |
| Memo | referência da operação |

### 2.2 Vocabulário proibido na UX

Estas palavras não devem aparecer em WhatsApp, Telegram, frontend, API pública ou docs de usuário:

| Termo proibido | Substituir por |
|---|---|
| wallet | conta global |
| blockchain | infraestrutura de liquidação |
| seed phrase | chave de recuperação segura |
| trustline | ativação da conta em dólar |
| address | destinatário ou identificador interno |
| public key | identificador interno da conta |
| private key | chave protegida |
| transaction hash | identificador da operação |
| gas fee | taxa operacional |
| crypto | dólar digital ou saldo em dólar |
| Stellar account | conta global |
| XLM | reserva operacional interna |
| on-chain | liquidado |
| swap | conversão |
| pathfinding | roteamento de liquidação |
| XDR | pacote de confirmação seguro |
| Horizon | provedor de liquidação |
| signer | autorização segura |
| token account | conta em dólar |
| asset issuer | emissor operacional |
| testnet | ambiente de testes |
| mainnet | ambiente de produção |
| ledger | registro de liquidação |

### 2.3 Tabela completa de renomeação por domínio

| Domínio | OLD_TERM | NEW_TERM | Regra |
|---|---|---|---|
| Produto | TalkToStellar wallet | TalkToStellar conta global | Nome mental do produto |
| Produto | crypto wallet | conta global | Nunca usar publicamente |
| Produto | Stellar app | conta global conversacional | Para landing e pitch |
| Bot | wallet criada | conta criada | Linguagem de onboarding |
| Bot | trustline criada | sua conta em dólar está pronta | Evento de ativação |
| Bot | saldo da wallet | saldo disponível | Consulta de saldo |
| Bot | USDC balance | saldo em dólar | Sempre formatar como US$ |
| Bot | assine a transação | confirme o envio | Confirmação humana |
| Bot | hash da transação | identificador da operação | Recibo e suporte |
| Bot | transação enviada para blockchain | envio em liquidação | Antes da confirmação |
| Bot | confirmado on-chain | confirmado | Após liquidação |
| Bot | swap realizado | conversão concluída | Conversões |
| Bot | path payment | envio com conversão automática | Se precisar explicar |
| Frontend | Wallet | Conta | Navegação e títulos |
| Frontend | Stellar Chat | Conta global | Branding de app |
| Frontend | Create wallet | Criar conta | CTA |
| Frontend | Confirm transaction | Confirmar envio | CTA |
| Frontend | Claim payment | Receber pagamento | Página de claim |
| Frontend | Public key | ID interno | Apenas em área técnica escondida |
| Frontend | Transaction hash | ID da operação | Comprovante |
| API pública | wallet | account | Recursos REST |
| API pública | stellarAddress | accountIdentifier | DTO público |
| API pública | transactionHash | operationId | DTO público |
| API pública | xdr | confirmationPayload | Se exposto inevitavelmente |
| API pública | trustline | dollarAccountActivation | DTO público |
| API pública | swap | conversion | DTO público |
| Backend domínio | createWallet | createGlobalAccount | Serviço financeiro |
| Backend domínio | wallet_balance | available_balance | Nome semântico |
| Backend domínio | usdc_balance | usd_balance | Saldo em dólar |
| Backend domínio | createTrustline | enableDollarBalance | Intenção financeira |
| Backend domínio | sendUSDC | sendInternationalPayment | Pagamento |
| Backend domínio | submitTransaction | settleOperation | Liquidação |
| Backend domínio | buildPathPayment | prepareConvertedPayment | Conversão interna |
| Backend infra | StellarService | StellarSettlementAdapter | Adapter, não domínio |
| Backend infra | Horizon client | settlementProviderClient | Se acima do adapter |
| Backend infra | xdr | signedSettlementEnvelope | Apenas infraestrutura |
| Banco | wallets | global_accounts | Projeção pública |
| Banco | public_key | internal_account_id | Domínio público |
| Banco | stellar_public_key | settlement_account_ref | Infraestrutura |
| Banco | stellar_transaction_hash | settlement_reference | Persistência interna |
| Banco | trustline_status | dollar_balance_status | Domínio financeiro |
| Banco | asset_code | currency_code | Produto |
| Banco | destination_key | recipient_account_ref | Domínio financeiro |
| Analytics | wallet_created | global_account_created | Evento de produto |
| Analytics | trustline_created | dollar_balance_enabled | Evento de produto |
| Analytics | transaction_submitted | payment_settlement_started | Evento de produto |
| Analytics | transaction_confirmed | payment_confirmed | Evento de produto |
| Analytics | swap_completed | conversion_completed | Evento de produto |
| Filas | stellar_payment_queue | payment_settlement_queue | Fila por intenção |
| Filas | trustline_queue | account_activation_queue | Fila por intenção |
| Logs usuário | XDR failed | confirmação não pôde ser preparada | Mensagem segura |
| Logs usuário | Horizon timeout | liquidação demorou mais que o esperado | Mensagem segura |
| Logs interno | Horizon timeout | Horizon timeout | Permitido em infra |
| Docs dev | wallet module | global account module | Se for domínio |
| Docs dev | Stellar module | Stellar adapter module | Se for infra |

### 2.4 Onde a linguagem Stellar ainda pode existir

Termos Stellar podem existir somente em:

- `backend/src/infrastructure/stellar/*`.
- Logs internos com nível `debug` ou `error` não exibidos ao usuário.
- Variáveis de ambiente de infraestrutura, como `STELLAR_HORIZON_URL`.
- Comentários técnicos dentro de adapters.
- Testes unitários de integração Stellar.
- Runbooks operacionais internos.

Eles não devem existir em:

- Prompt do agente.
- Mensagens do WhatsApp e Telegram.
- Componentes React públicos.
- DTOs públicos.
- Nomes de endpoints públicos.
- Analytics de produto.
- Eventos de CRM.
- Documentação comercial.

## 3. Nova arquitetura semântica

### 3.1 Arquitetura alvo

```text
clients/
  whatsapp
  telegram
  web
    | fala linguagem financeira
    v
experience-api/
  account.controller.ts
  payment.controller.ts
  quote.controller.ts
  receipt.controller.ts
  assistant.controller.ts
    | DTOs públicos sem Web3
    v
financial-domain/
  global-account.service.ts
  dollar-balance.service.ts
  payment-orchestration.service.ts
  quote-lock.service.ts
  receipt.service.ts
  financial-memory.service.ts
  security-confirmation.service.ts
    | portas semânticas
    v
settlement-ports/
  settlement-adapter.ts
  liquidity-adapter.ts
  custody-adapter.ts
  notification-adapter.ts
    | implementação técnica
    v
infrastructure/
  stellar/
    stellar-settlement.adapter.ts
    stellar-liquidity.adapter.ts
    stellar-account.adapter.ts
    horizon.client.ts
    xdr.builder.ts
  supabase/
  twilio/
  telegram/
  openai/
```

### 3.2 Boundaries obrigatórios

| Camada | Pode conhecer Stellar? | Linguagem | Responsabilidade |
|---|---:|---|---|
| WhatsApp/Telegram/Web | Não | Financeira | Conversa, telas, confirmação e comprovantes |
| Experience API | Não | Financeira | Contratos públicos e autenticação |
| Financial Domain | Não | Financeira | Regras de conta, saldo, quote, pagamento, recibo e memória |
| Ports | Não em nomes públicos | Financeira abstrata | Interfaces para liquidação, custódia e liquidez |
| Infrastructure Adapters | Sim | Técnica | Stellar, Horizon, XDR, trustline, pathfinding e submit |
| Database raw | Sim, com cuidado | Mista | Persistência de infraestrutura e domínio |
| Database views | Não | Financeira | Leitura por produto, analytics e suporte |

### 3.3 Regra de dependência

A dependência sempre aponta para baixo:

```text
Experience -> Financial Domain -> Ports -> Infrastructure
```

Nunca permitir:

```text
Frontend -> StellarService
Bot -> XDR
Agent Prompt -> trustline
GlobalAccountService -> Horizon diretamente
PaymentController -> Stellar SDK
```

### 3.4 Portas semânticas

```ts
export interface SettlementAdapter {
  preparePayment(input: PrepareSettlementInput): Promise<PreparedSettlement>;
  settlePreparedPayment(input: SettlePreparedPaymentInput): Promise<SettlementResult>;
  getAvailableBalances(accountRef: string): Promise<SettlementBalance[]>;
  enableCurrencyBalance(input: EnableCurrencyBalanceInput): Promise<CurrencyBalanceActivationResult>;
}

export interface LiquidityAdapter {
  lockQuote(input: LockQuoteInput): Promise<LockedQuote>;
  refreshQuote(input: RefreshQuoteInput): Promise<LockedQuote>;
}

export interface CustodyAdapter {
  createSecureAccount(input: CreateSecureAccountInput): Promise<SecureAccountRef>;
  authorizeOperation(input: AuthorizeOperationInput): Promise<AuthorizationResult>;
}
```

A implementação pode ser Stellar:

```ts
export class StellarSettlementAdapter implements SettlementAdapter {
  async enableCurrencyBalance(input: EnableCurrencyBalanceInput) {
    // Internamente pode criar trustline USDC.
    // O domínio só recebe: dollar account enabled.
  }
}
```

## 4. Refatoração prática do código atual

### 4.1 Estado atual observado

O repositório atual ainda expõe nomes técnicos em vários pontos:

| Caminho atual | Problema semântico | Direção alvo |
|---|---|---|
| `backend/src/services/stellar.service.ts` | Serviço técnico pode vazar para domínio | Mover para `infrastructure/stellar/stellar-settlement.adapter.ts` |
| `backend/src/api/services/stellar.service.ts` | Nome técnico na camada API | Encapsular em serviços financeiros |
| `backend/src/api/services/trustline.service.ts` | Trustline é conceito Stellar | Renomear facade para `dollar-balance.service.ts` |
| `backend/src/repositories/wallet.repository.ts` | Wallet como modelo mental | Criar `global-account.repository.ts` |
| `backend/src/api/controllers/external-finalize.controller.ts` | Nome endpoint não comunica produto | Migrar para `payment-confirmation.controller.ts` |
| `backend/src/api/controllers/external-validate.controller.ts` | Validação de token semântica fraca | Migrar para `secure-link.controller.ts` |
| `backend/src/api/controllers/pay-link.controller.ts` | Bom conceito, mas precisa linguagem de recebimento | Evoluir para `payment-link.controller.ts` |
| `frontend/app/confirm-payment` | Adequado | Ajustar texto para confirmação financeira premium |
| `frontend/app/confirm-conversion` | Adequado | Adicionar quote expirável e taxa explícita |
| `frontend/app/claim-payment` | Adequado | Trocar qualquer wallet/address por conta/destinatário |
| `telegram/src/bot.js` | Canal público | Bloquear termos técnicos nas respostas |

### 4.2 Convenções novas

#### Serviços de domínio

Use nomes por intenção financeira:

| Atual | Alvo |
|---|---|
| `StellarService` | `SettlementAdapter` ou `StellarSettlementAdapter` |
| `TrustlineService` | `DollarBalanceService` |
| `WalletRepository` | `GlobalAccountRepository` |
| `ExternalService` | `ChannelAccountLinkService` |
| `PaymentFeedbackService` | `PaymentStatusService` |
| `PaymentReceiptService` | Manter, mas garantir linguagem pública |
| `QuoteExpiryService` | Evoluir para `QuoteLockService` |
| `TransferNotificationService` | `ChannelNotificationService` |
| `AnchorService` | `BankingPartnerService` ou `RampService` |

#### Funções

| Atual | Alvo |
|---|---|
| `createWallet()` | `createGlobalAccount()` |
| `getWalletBalance()` | `getAvailableBalance()` |
| `getUSDCBalance()` | `getDollarBalance()` |
| `createTrustline()` | `enableDollarBalance()` |
| `sendUSDC()` | `sendInternationalPayment()` |
| `buildPaymentXdr()` | `preparePaymentConfirmation()` |
| `submitTransaction()` | `settleOperation()` |
| `buildPathPayment()` | `prepareConvertedPayment()` |
| `validateExternalToken()` | `validateSecureConfirmationLink()` |
| `finalizeExternalPayment()` | `confirmAndSettlePayment()` |
| `claimPayLink()` | `claimPaymentLink()` |
| `compactQuote()` | `toPublicQuoteSummary()` |

#### DTOs públicos

| Atual | Alvo |
|---|---|
| `stellarPublicKey` | `accountIdentifier` ou omitir |
| `destinationKey` | `recipientId` |
| `transactionHash` | `operationId` |
| `xdr` | `confirmationPayload` |
| `assetCode` | `currency` |
| `assetIssuer` | nunca expor |
| `trustline` | `dollarBalanceStatus` |
| `walletBalance` | `availableBalance` |

#### Banco de dados

Recomendação pragmática: não renomear todas as tabelas físicas no primeiro PR. Criar views e repositories semânticos primeiro, depois migrar nomes físicos quando o produto estiver estável.

| Físico atual | View semântica alvo | Observação |
|---|---|---|
| `wallets` | `global_accounts` | View de produto |
| `agent_sessions` | `customer_sessions` | Manter sessão técnica por enquanto |
| `external_accounts` | `channel_accounts` | WhatsApp/Telegram |
| `payment_logs` | `financial_operations` | Memória financeira |
| `operations` | `settlement_operations` | Interno |
| `contacts` | `beneficiaries` | Linguagem bancária |

Exemplo de view:

```sql
CREATE VIEW global_accounts AS
SELECT
  w.id,
  w.session_id,
  w.public_key AS internal_account_ref,
  w.balance AS available_balances,
  w.created_at
FROM wallets w;
```

### 4.3 Estrutura de pastas alvo

```text
backend/src/
  experience/
    controllers/
      account.controller.ts
      payment.controller.ts
      quote.controller.ts
      receipt.controller.ts
      assistant.controller.ts
    dtos/
      account.dto.ts
      payment.dto.ts
      quote.dto.ts
      receipt.dto.ts
  financial/
    accounts/
      global-account.service.ts
      global-account.repository.ts
    balances/
      dollar-balance.service.ts
    payments/
      payment-orchestration.service.ts
      payment-link.service.ts
      payment-status.service.ts
    quotes/
      quote-lock.service.ts
      quote.repository.ts
    receipts/
      receipt.service.ts
      receipt-template.service.ts
    memory/
      financial-memory.service.ts
      financial-memory.repository.ts
    security/
      secure-confirmation.service.ts
  ports/
    settlement-adapter.ts
    liquidity-adapter.ts
    notification-adapter.ts
    custody-adapter.ts
  infrastructure/
    stellar/
      stellar-settlement.adapter.ts
      stellar-liquidity.adapter.ts
      stellar-account.adapter.ts
      horizon.client.ts
      xdr.builder.ts
    supabase/
    telegram/
    whatsapp/
```

### 4.4 Exemplo real de facade financeira

```ts
// backend/src/financial/balances/dollar-balance.service.ts
export class DollarBalanceService {
  constructor(private readonly settlement: SettlementAdapter) {}

  async enableDollarAccount(input: { customerId: string; accountRef: string }) {
    const result = await this.settlement.enableCurrencyBalance({
      accountRef: input.accountRef,
      currency: 'USD',
    });

    return {
      status: result.enabled ? 'ready' : 'pending',
      publicMessage: result.enabled
        ? 'Sua conta em dólar está pronta.'
        : 'Estamos ativando sua conta em dólar.',
    };
  }
}
```

```ts
// backend/src/infrastructure/stellar/stellar-settlement.adapter.ts
export class StellarSettlementAdapter implements SettlementAdapter {
  async enableCurrencyBalance(input: EnableCurrencyBalanceInput) {
    if (input.currency !== 'USD') {
      throw new Error('Unsupported currency');
    }

    // Interno: cria trustline USDC.
    // Nunca retornar a palavra trustline para a camada financeira.
    const operation = await this.trustlineClient.createUsdcTrustline(input.accountRef);

    return {
      enabled: operation.status === 'success',
      settlementReference: operation.hash,
    };
  }
}
```

### 4.5 Exemplo de controller público sem Web3

```ts
// backend/src/experience/controllers/payment.controller.ts
router.post('/payments/confirm', async (req, res) => {
  const result = await paymentOrchestration.confirmAndSettlePayment({
    confirmationToken: req.body.confirmationToken,
    securityPin: req.body.securityPin,
    channel: req.body.channel,
  });

  res.json({
    status: result.status,
    message: result.publicMessage,
    receipt: result.receipt,
  });
});
```

Resposta pública:

```json
{
  "status": "confirmed",
  "message": "Envio confirmado.",
  "receipt": {
    "title": "Comprovante da transferência",
    "summary": "Você enviou US$ 24.91 para João.",
    "fee": "R$ 0,08",
    "exchangeRate": "R$ 5,51 = US$ 1,00",
    "settlementTime": "3,2s",
    "operationId": "OP-8F3K9Q2P",
    "confirmedAt": "2026-05-11T22:18:04-03:00"
  }
}
```

## 5. Financial Abstraction Layer

### 5.1 Objetivo

A Financial Abstraction Layer é a fronteira que impede vazamento de crypto. Ela transforma eventos técnicos em experiências financeiras.

Ela recebe:

- `createTrustline`, `submitTransaction`, `pathPaymentStrictSend`, `transactionHash`, `Horizon timeout`.

Ela devolve:

- `ativar conta em dólar`, `liquidar envio`, `conversão com cotação travada`, `identificador da operação`, `liquidação demorou mais que o esperado`.

### 5.2 Componentes

| Serviço | Responsabilidade | Não pode fazer |
|---|---|---|
| `GlobalAccountService` | Criar e consultar conta global | Importar Stellar SDK |
| `DollarBalanceService` | Ativar e exibir saldo em dólar | Falar trustline |
| `PaymentOrchestrationService` | Preparar, confirmar e liquidar pagamentos | Expor XDR |
| `QuoteLockService` | Criar e validar cotações expiráveis | Permitir slippage silencioso |
| `ReceiptService` | Gerar comprovantes premium | Exibir hash como hash |
| `FinancialMemoryService` | Responder perguntas contextuais | Usar memória sem consentimento/contexto |
| `SecureConfirmationService` | PIN/passkey/token de confirmação | Dizer assinar transação |
| `SettlementAdapter` | Porta abstrata de liquidação | Usar nomes de produto |
| `StellarSettlementAdapter` | Implementar Stellar | Ser chamado pelo frontend |

### 5.3 Contrato público para liquidação

```ts
export type PublicPaymentStatus =
  | 'waiting_confirmation'
  | 'processing'
  | 'confirmed'
  | 'failed'
  | 'expired';

export interface InternationalPaymentRequest {
  senderCustomerId: string;
  recipient: {
    type: 'contact' | 'phone' | 'email' | 'payment_link';
    value: string;
    displayName?: string;
  };
  sendAmount: Money;
  receiveCurrency: 'USD' | 'BRL' | 'EUR';
  quoteId?: string;
  note?: string;
}

export interface InternationalPaymentResult {
  status: PublicPaymentStatus;
  operationId: string;
  receipt?: PublicReceipt;
  nextAction?: 'confirm' | 'renew_quote' | 'complete_recipient_account';
  message: string;
}
```

### 5.4 Contrato interno de adapter

```ts
export interface PreparedSettlement {
  internalEnvelope: string; // XDR ou payload equivalente.
  settlementRouteRef: string;
  estimatedSettlementFee: Money;
  estimatedSettlementTimeMs: number;
}

export interface SettlementResult {
  status: 'settled' | 'failed' | 'pending';
  settlementReference: string; // Hash interno, não público.
  settledAt: Date;
  settlementTimeMs: number;
  rawProviderResponse?: unknown;
}
```

## 6. Fluxos reformulados

### 6.1 Onboarding

#### Antes

- Criar wallet.
- Criar Stellar account.
- Criar trustline USDC.
- Mostrar public key.

#### Depois

- Criar conta global.
- Proteger acesso com PIN/passkey.
- Ativar saldo em dólar.
- Confirmar que a conta está pronta para enviar e receber.

#### Mensagens

```text
Bem-vindo à sua conta global.

Com ela você pode enviar, receber e converter dinheiro direto pelo WhatsApp.
Para começar, vamos proteger sua conta com uma confirmação segura.
```

```text
Sua conta em dólar está pronta.

Você já pode receber pagamentos internacionais e manter saldo em dólar digital.
```

```text
Conta criada com segurança.

A partir de agora, quando você fizer um envio, vamos pedir sua confirmação antes de liquidar a operação.
```

### 6.2 Consulta de saldo

#### Antes

```text
Wallet balance: 23 USDC
```

#### Depois

```text
Você possui US$ 23,00 disponíveis.

Saldo em dólar: US$ 23,00
Saldo em reais: R$ 0,00
```

Se o saldo em dólar ainda não estiver ativado:

```text
Sua conta em dólar ainda não está ativa.

Posso ativar agora para você receber e enviar pagamentos internacionais.
```

### 6.3 Envio para contato conhecido

#### Usuário

```text
manda 25 dólares pro João
```

#### Bot

```text
Encontrei João nos seus contatos.

Envio: US$ 25,00
Destinatário: João
Taxa: US$ 0,01
Liquidação estimada: alguns segundos

Confirme para concluir o envio.
```

#### Pós-confirmação

```text
Envio confirmado.

Você enviou US$ 25,00 para João.
Taxa: US$ 0,01
Liquidação: 3,2s
Status: confirmado
Comprovante: OP-8F3K9Q2P
```

### 6.4 Envio para pessoa sem conta

#### Usuário

```text
manda 50 reais pra Maria no WhatsApp +55 11 99999-9999
```

#### Bot

```text
Maria ainda precisa completar os dados para receber.

Vou gerar um link seguro de recebimento. O valor fica reservado para ela até a conclusão ou expiração do link.

Envio: R$ 50,00
Destinatário: Maria
Validade do link: 24 horas

Confirme para criar o pagamento.
```

#### Para o destinatário

```text
Você recebeu um pagamento de Rodrigo.

Valor: R$ 50,00
Para receber, confirme seus dados e crie sua conta global em poucos passos.
```

#### Para o remetente após claim

```text
Maria recebeu o pagamento.

Valor: R$ 50,00
Status: confirmado
Comprovante: OP-6M2K7A1B
```

### 6.5 Conversão com quote expirável

#### Usuário

```text
converter 500 reais em dólar
```

#### Bot

```text
Cotação travada por 30 segundos.

Você envia: R$ 500,00
Você recebe: US$ 89,12
Câmbio usado: R$ 5,61 = US$ 1,00
Taxa: R$ 0,80
Validade: 30s

Confirme antes que a cotação expire.
```

#### Quote expirou

```text
A cotação expirou.

Isso protege você contra mudança de preço. Posso buscar uma nova cotação agora.
```

#### Quote confirmada

```text
Conversão confirmada.

Você converteu R$ 500,00 em US$ 89,12.
Câmbio usado: R$ 5,61 = US$ 1,00
Taxa: R$ 0,80
Liquidação: 3,4s
Comprovante: OP-2P9Q4X7C
```

### 6.6 Mensagens de erro

| Erro técnico | Mensagem pública |
|---|---|
| `insufficient_balance` | Saldo insuficiente para concluir este envio. |
| `trustline_missing` | Sua conta em dólar ainda precisa ser ativada para receber este valor. |
| `quote_expired` | A cotação expirou. Busquei uma nova cotação para você confirmar. |
| `horizon_timeout` | A liquidação está demorando mais que o normal. Vou avisar assim que confirmar. |
| `bad_xdr` | Não foi possível preparar a confirmação. Tente novamente. |
| `destination_invalid` | Não encontrei uma conta válida para este destinatário. |
| `recipient_unlinked` | O destinatário precisa completar os dados para receber. |
| `pin_invalid` | PIN incorreto. Confira e tente novamente. |
| `session_expired` | Sua sessão expirou por segurança. Entre novamente para continuar. |
| `network_fee_changed` | A taxa operacional mudou. Gere uma nova cotação para continuar. |

### 6.7 Mensagens de segurança

```text
Por segurança, confirme este envio com seu PIN.

Nunca pedimos sua senha completa no WhatsApp.
```

```text
Detectei uma tentativa de confirmação fora do prazo.

Para proteger sua conta, gere um novo link de confirmação.
```

```text
Este link só pode ser usado uma vez.

Se você não reconhece essa operação, ignore a mensagem e fale com o suporte.
```

### 6.8 Mensagens de liquidação

```text
Envio em processamento.

Estamos liquidando a operação. Normalmente isso leva poucos segundos.
```

```text
Operação confirmada.

O valor já foi liquidado e o comprovante está disponível.
```

```text
A liquidação está demorando mais que o esperado.

Seu envio continua protegido. Vou te avisar automaticamente quando confirmar.
```

## 7. Receipt Layer premium

### 7.1 Objetivo

Cada operação financeira precisa gerar um comprovante com aparência de banco moderno. O comprovante deve aumentar confiança, reduzir suporte e registrar exatamente o que aconteceu.

### 7.2 Campos obrigatórios do comprovante público

| Campo | Exemplo | Observação |
|---|---|---|
| Título | Comprovante da transferência | Nunca hash |
| Resumo | Você enviou US$ 24,91 para João | Humano e direto |
| Valor enviado | US$ 24,91 | Moeda formatada |
| Valor recebido | US$ 24,91 | Se houver conversão, mostrar ambos |
| Destinatário | João | Nome do contato ou telefone mascarado |
| Taxa | R$ 0,08 | Exata |
| Cotação usada | R$ 5,61 = US$ 1,00 | Se aplicável |
| Liquidação | 3,2s | Tempo real medido |
| Horário | 11/05/2026, 22:18 | Timezone local |
| Status | Confirmado | Sem on-chain |
| ID da operação | OP-8F3K9Q2P | Derivado seguro do hash interno |
| Observação | Aluguel maio | Se houver |

### 7.3 Campos internos do comprovante

| Campo interno | Uso |
|---|---|
| `settlement_reference` | Hash Stellar ou ID do provedor |
| `settlement_provider` | Stellar |
| `route_payload` | Dados de pathfinding |
| `raw_fee_stroops` | Fee técnica |
| `xdr_digest` | Auditoria técnica |
| `horizon_response` | Debug e suporte avançado |

### 7.4 Exemplo de comprovante WhatsApp

```text
Comprovante da transferência

Você enviou US$ 24,91 para João.

Valor enviado: US$ 24,91
Taxa: R$ 0,08
Cotação usada: R$ 5,61 = US$ 1,00
Liquidação: 3,2s
Horário: 11/05/2026, 22:18
Status: confirmado
ID da operação: OP-8F3K9Q2P

Guarde este comprovante para sua organização financeira.
```

### 7.5 Exemplo de comprovante de conversão

```text
Comprovante da conversão

Você converteu R$ 500,00 em US$ 89,12.

Valor enviado: R$ 500,00
Valor recebido: US$ 89,12
Câmbio usado: R$ 5,61 = US$ 1,00
Taxa: R$ 0,80
Liquidação: 3,4s
Horário: 11/05/2026, 22:21
Status: confirmado
ID da operação: OP-2P9Q4X7C
```

### 7.6 Geração de ID público da operação

Não exibir o hash completo. Criar um ID público curto, estável e pesquisável:

```ts
import crypto from 'crypto';

export function toPublicOperationId(settlementReference: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`receipt:${settlementReference}`)
    .digest('base64url')
    .slice(0, 8)
    .toUpperCase();

  return `OP-${digest}`;
}
```

### 7.7 Status públicos

| Status interno | Status público |
|---|---|
| `submitted` | em processamento |
| `pending` | em liquidação |
| `success` | confirmado |
| `failed` | não concluído |
| `expired` | expirado |
| `refunded` | devolvido |
| `claim_pending` | aguardando destinatário |

## 8. Sistema de quotes expiráveis

### 8.1 Objetivo

Proteger o usuário contra slippage e dar sensação de seriedade operacional. Toda conversão ou pagamento com câmbio deve usar cotação travada por prazo curto, normalmente 30 segundos.

### 8.2 Fluxo técnico

```text
1. Usuário pede conversão ou envio com câmbio.
2. Assistant identifica intenção e chama QuoteLockService.
3. QuoteLockService consulta LiquidityAdapter.
4. Adapter calcula rota interna e fee.
5. Sistema salva quote com status active e expires_at.
6. Bot mostra valores, taxa, câmbio e validade.
7. Usuário confirma antes do vencimento.
8. PaymentOrchestration valida quote.
9. Se ativa, liquida usando payload travado.
10. Se expirada, bloqueia liquidação e oferece nova cotação.
```

### 8.3 Modelo de dados

```sql
CREATE TABLE locked_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id TEXT NOT NULL,
  quote_token TEXT UNIQUE NOT NULL,
  source_currency TEXT NOT NULL,
  target_currency TEXT NOT NULL,
  source_amount NUMERIC NOT NULL,
  target_amount NUMERIC NOT NULL,
  exchange_rate NUMERIC NOT NULL,
  fee_amount NUMERIC NOT NULL,
  fee_currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  operation_id UUID,
  route_signature TEXT NOT NULL,
  internal_route_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX locked_quotes_customer_status_idx
ON locked_quotes(customer_id, status, expires_at);
```

### 8.4 DTO público de quote

```ts
export interface PublicLockedQuote {
  quoteId: string;
  sendAmount: Money;
  receiveAmount: Money;
  exchangeRate: {
    base: string;
    quote: string;
    display: string;
  };
  fee: Money;
  expiresAt: string;
  ttlSeconds: number;
  status: 'active' | 'expired' | 'confirmed';
  message: string;
}
```

### 8.5 Cache strategy

| Camada | Uso | TTL |
|---|---|---|
| Redis ou memória local | Quote ativo por `quote_token` | 30 a 45s |
| Postgres | Auditoria e idempotência | Permanente |
| LLM context | Resumo de quote atual | Até expirar |
| Frontend state | Countdown visual | Até `expires_at` |

Regras:

- Postgres é fonte de verdade.
- Cache acelera validação, mas nunca substitui persistência.
- Quote usado uma vez deve virar `confirmed`.
- Quote vencido deve virar `expired` antes de qualquer tentativa de liquidação.
- Confirmação com quote expirada deve falhar fechado.

### 8.6 Anti-slippage design

- Nunca recalcular valor recebido silenciosamente após confirmação.
- Nunca liquidar se `now() > expires_at`.
- Nunca aceitar quote de outro usuário.
- Nunca aceitar quote já confirmado.
- Nunca trocar rota interna sem gerar novo quote.
- Sempre mostrar taxa e câmbio antes da confirmação.
- Sempre registrar `route_signature` para auditoria.
- Usar idempotency key na confirmação para evitar pagamentos duplicados.

### 8.7 Edge cases

| Caso | Comportamento correto |
|---|---|
| Usuário confirma no segundo 31 | Bloquear e oferecer nova cotação |
| Usuário manda “sim” duas vezes | Primeira confirma, segunda retorna comprovante existente |
| Câmbio melhora após quote | Manter quote travada ou oferecer renovar, nunca alterar escondido |
| Câmbio piora após quote | Honrar quote se ainda válido ou recusar se risco exceder limite interno |
| Liquidez indisponível | Explicar que não foi possível travar cotação agora |
| Fee mudou | Invalidar quote e gerar nova |
| Sessão expirou | Pedir login antes de confirmar |
| Quote pertence a outro canal | Validar `customer_id` e `channel_account_id` |
| Bot reiniciou | Recuperar quote ativo do Postgres |
| Confirmou, mas liquidação demorou | Status em liquidação e notificação posterior |

### 8.8 UX ideal de quote

```text
Cotação travada por 30 segundos.

Você envia: R$ 500,00
Você recebe: US$ 89,12
Câmbio: R$ 5,61 = US$ 1,00
Taxa: R$ 0,80

Responda "confirmar" para concluir.
```

Countdown web:

```text
Cotação válida por 00:27
```

Expiração:

```text
A cotação expirou para proteger você de mudança de preço.

Nova cotação disponível:
Você recebe: US$ 89,04
Câmbio: R$ 5,62 = US$ 1,00
Validade: 30s
```

## 9. Memória financeira da IA

### 9.1 Objetivo

Transformar o bot de executor de comandos em assistente financeiro contextual. A IA deve lembrar relações financeiras, padrões de pagamento, destinatários frequentes, cotações usadas e totais do período.

### 9.2 Memória permitida

| Tipo | Exemplos |
|---|---|
| Destinatários frequentes | João, Maria, fornecedor X |
| Últimos pagamentos | valor, moeda, destinatário, data, status |
| Carteiras internas | Nunca falar wallet, mas lembrar conta usada |
| Cotações históricas | média mensal, melhor cotação, última cotação |
| Conversões mensais | total BRL convertido, total USD recebido |
| Preferências | moeda padrão, idioma, canal preferido |
| Links pendentes | quem ainda precisa completar dados |

### 9.3 Perguntas suportadas

```text
manda pro João de novo
usa a mesma conta de ontem
divide 50 dólares entre eles
quanto eu já converti esse mês?
qual foi minha média de cotação?
quem ainda não recebeu?
mostra meus envios para Maria
repete o pagamento do aluguel
```

### 9.4 Modelo de domínio

```ts
export interface FinancialMemoryFact {
  customerId: string;
  type:
    | 'payment_sent'
    | 'payment_received'
    | 'conversion_completed'
    | 'quote_used'
    | 'recipient_created'
    | 'payment_link_pending';
  occurredAt: Date;
  counterparty?: {
    displayName?: string;
    normalizedRef?: string;
  };
  amounts: Money[];
  exchangeRate?: number;
  operationId?: string;
  metadata?: Record<string, unknown>;
}
```

### 9.5 Consultas de memória

```ts
export class FinancialMemoryService {
  async getLastPaymentTo(customerId: string, recipientName: string) {}
  async getMonthlyConversionSummary(customerId: string, month: string) {}
  async getAverageExchangeRate(customerId: string, period: DateRange) {}
  async getPendingRecipientClaims(customerId: string) {}
  async suggestRepeatPayment(customerId: string, phrase: string) {}
}
```

### 9.6 Regras de segurança da memória

- Nunca repetir pagamento sem confirmação explícita.
- Nunca revelar dados sensíveis de destinatários em grupo.
- Mascarar telefone e email quando possível.
- Se houver ambiguidade, perguntar antes de preparar operação.
- Memória sugere, confirmação liquida.
- Toda resposta quantitativa deve vir de dados persistidos, não da memória solta do LLM.

### 9.7 Exemplos de respostas

Usuário:

```text
manda pro João de novo
```

Bot:

```text
Seu último envio para João foi de US$ 25,00 em 08/05.

Quer repetir esse valor?
Taxa estimada: US$ 0,01
Liquidação estimada: poucos segundos
```

Usuário:

```text
quanto eu já converti esse mês?
```

Bot:

```text
Em maio, você converteu R$ 2.400,00 em US$ 428,31.

Cotação média: R$ 5,60 = US$ 1,00
Taxas totais: R$ 4,20
Operações: 6
```

Usuário:

```text
qual foi minha média de cotação?
```

Bot:

```text
Sua cotação média nos últimos 30 dias foi R$ 5,59 = US$ 1,00.

Melhor cotação: R$ 5,52 em 02/05
Última cotação usada: R$ 5,61 em 11/05
```

## 10. APIs públicas invisíveis

### 10.1 Endpoints alvo

| Atual | Novo endpoint público |
|---|---|
| `POST /api/external/check-account` | `POST /api/channel-accounts/resolve` |
| `POST /api/external/validate-token` | `POST /api/secure-links/validate` |
| `POST /api/external/finalize` | `POST /api/payments/confirm` |
| `POST /api/actions/build-path-payment-xdr` | `POST /api/payments/prepare-converted-payment` |
| `GET /api/wallet/balance` | `GET /api/accounts/me/balances` |
| `POST /api/pay-link/claim` | `POST /api/payment-links/claim` |
| `POST /api/agent/query` | `POST /api/assistant/messages` |

### 10.2 Compatibilidade

Não remover endpoints antigos imediatamente. Criar wrappers:

```ts
router.post('/api/external/finalize', legacyFinalizeController);
router.post('/api/payments/confirm', paymentConfirmationController);
```

O endpoint antigo chama o serviço novo e registra analytics de depreciação:

```ts
logger.warn('legacy_endpoint_used', {
  legacyEndpoint: '/api/external/finalize',
  replacementEndpoint: '/api/payments/confirm',
});
```

### 10.3 Contratos públicos não devem expor infraestrutura

Evitar:

```json
{
  "stellarPublicKey": "G...",
  "xdr": "AAAA...",
  "transactionHash": "abc123"
}
```

Usar:

```json
{
  "accountStatus": "ready",
  "confirmationToken": "secure-token",
  "operationId": "OP-8F3K9Q2P"
}
```

## 11. Analytics, eventos e logs

### 11.1 Eventos de produto

| Evento alvo | Quando dispara |
|---|---|
| `global_account_created` | Conta criada |
| `dollar_balance_enabled` | Saldo em dólar ativado |
| `quote_locked` | Cotação travada |
| `quote_expired` | Cotação expirada |
| `quote_confirmed` | Cotação usada em operação |
| `payment_prepared` | Envio preparado |
| `payment_confirmation_requested` | PIN/passkey solicitado |
| `payment_confirmed` | Usuário confirmou |
| `payment_settlement_started` | Liquidação iniciou |
| `payment_settled` | Liquidação confirmou |
| `payment_receipt_sent` | Comprovante enviado |
| `payment_link_created` | Link de recebimento criado |
| `payment_link_claimed` | Destinatário recebeu |
| `financial_memory_query_answered` | IA respondeu pergunta histórica |

### 11.2 Logs internos

Use dois campos:

```json
{
  "event": "payment_settlement_failed",
  "publicReason": "A liquidação demorou mais que o esperado.",
  "internalReason": "Horizon timeout while submitting XDR",
  "settlementProvider": "stellar"
}
```

Regra:

- `publicReason` pode aparecer em suporte e bot.
- `internalReason` só aparece em log técnico.

### 11.3 Métricas principais

| Métrica | Por quê |
|---|---|
| Tempo médio de liquidação | Confiança e performance |
| Taxa média por operação | Transparência financeira |
| Conversões com quote expirada | Ajuste de TTL |
| Confirmações abandonadas | Fricção de UX |
| Links de recebimento não concluídos | Problema de onboarding do destinatário |
| Perguntas de memória financeira | Adoção do assistente |
| Comprovantes enviados com sucesso | Confiança operacional |

## 12. Guidelines para prompts e IA

### 12.1 System prompt do agente

O agente deve ter uma regra explícita:

```text
Você é um assistente financeiro de conta global. Nunca use termos de crypto, blockchain, Stellar, wallet, trustline, hash, XDR, gas, on-chain ou seed phrase com o usuário. Use linguagem de banco moderno: conta, saldo, pagamento, cotação, taxa, liquidação, confirmação e comprovante.
```

### 12.2 Mapeamento de intenções

| Intenção do usuário | Tool semântica |
|---|---|
| Ver saldo | `get_available_balance` |
| Enviar dinheiro | `prepare_international_payment` |
| Converter moeda | `lock_conversion_quote` |
| Confirmar envio | `confirm_payment` |
| Repetir pagamento | `suggest_repeat_payment` |
| Histórico do mês | `get_financial_summary` |
| Média de cotação | `get_exchange_rate_insights` |
| Receber pagamento | `create_payment_link` |
| Ativar dólar | `enable_dollar_account` |

### 12.3 Proibições no prompt

- Não diga “transação Stellar”.
- Não diga “hash”.
- Não diga “trustline”.
- Não diga “wallet”.
- Não diga “USDC” se “dólar” for suficiente.
- Não diga “assinar XDR”.
- Não explique blockchain se o usuário não pedir explicitamente.

Se o usuário perguntar tecnicamente, responder em modo avançado:

```text
Por baixo dos panos, usamos uma infraestrutura de liquidação baseada em Stellar. Na experiência normal, você só precisa acompanhar valor, taxa, cotação e comprovante.
```

## 13. Estratégia de UX

### 13.1 Tom de voz

- Claro.
- Curto.
- Seguro.
- Sem jargão.
- Com números precisos.
- Com status explícito.

### 13.2 Padrão de mensagem financeira

Toda operação deve seguir esta ordem:

```text
Ação principal.

Valor enviado:
Valor recebido:
Taxa:
Cotação:
Destinatário:
Validade ou status:

Próxima ação.
```

### 13.3 Padrão de confirmação

```text
Confirme o envio.

Você está enviando US$ 25,00 para João.
Taxa: US$ 0,01
Liquidação estimada: poucos segundos

Para continuar, confirme com seu PIN.
```

### 13.4 Padrão de status assíncrono

```text
Estou acompanhando a liquidação.

Você não precisa fazer nada agora. Aviso assim que o comprovante estiver pronto.
```

### 13.5 Padrão de confiança

Sempre exibir:

- Valor exato.
- Taxa exata ou estimada marcada como estimada.
- Cotação usada.
- Horário.
- Status.
- ID da operação.

Nunca exibir:

- Hash bruto.
- Explorer link como ação principal.
- Chave pública completa.
- XDR.

## 14. Estratégia de migração

### 14.1 Fase 0: trava de linguagem pública

- Criar lista de termos proibidos.
- Adicionar teste que varre textos públicos.
- Atualizar prompt do agente.
- Atualizar mensagens do Telegram e WhatsApp.
- Atualizar componentes web de confirmação e claim.

Exemplo de teste:

```ts
const forbiddenPublicTerms = [
  'wallet',
  'trustline',
  'transaction hash',
  'xdr',
  'stellar account',
  'on-chain',
];

expect(publicMessage.toLowerCase()).not.toContainAny(forbiddenPublicTerms);
```

### 14.2 Fase 1: facades financeiras

- Criar `GlobalAccountService`.
- Criar `DollarBalanceService`.
- Criar `PaymentOrchestrationService`.
- Criar `QuoteLockService`.
- Criar `FinancialMemoryService`.
- Manter `StellarService` interno.

### 14.3 Fase 2: APIs novas com compatibilidade

- Criar endpoints novos.
- Manter endpoints antigos como wrappers.
- Migrar frontend para endpoints novos.
- Migrar bots para endpoints novos.
- Emitir logs de endpoint legado.

### 14.4 Fase 3: banco e analytics

- Criar views semânticas.
- Renomear eventos analytics.
- Criar dashboards por linguagem financeira.
- Manter tabelas antigas até estabilizar.

### 14.5 Fase 4: remoção gradual de termos antigos

- Renomear arquivos e classes fora da infra.
- Remover imports diretos de Stellar em camada API.
- Mover SDK Stellar para `infrastructure/stellar`.
- Atualizar docs.

### 14.6 Fase 5: enforcement contínuo

- ESLint rule ou script CI para textos proibidos.
- Checklist obrigatório em PR.
- Glossário versionado.
- Testes de snapshot das mensagens do bot.

## 15. Checklist de PR Invisible Wallet

Todo PR que toca experiência, bot, frontend, API pública ou docs deve responder:

- Aparece `wallet` para o usuário?
- Aparece `blockchain` para o usuário?
- Aparece `Stellar` para o usuário?
- Aparece `USDC` onde “dólar” seria melhor?
- Aparece `hash` em comprovante público?
- Aparece `trustline` fora de infra?
- Algum endpoint público retorna `xdr`?
- Toda conversão tem quote com validade?
- Todo envio confirmado gera comprovante?
- Toda taxa aparece antes da confirmação?
- Toda mensagem de erro é acionável?
- Todo pagamento repetido pela memória exige confirmação?

## 16. Definition of Done

A reformulação Invisible Wallet está pronta quando:

- O usuário consegue criar conta sem ler “wallet”.
- O usuário consegue ativar dólar sem ler “trustline”.
- O usuário consegue enviar dinheiro sem ler “transaction” ou “hash”.
- O usuário recebe comprovante premium após cada operação.
- Conversões usam cotações expiráveis com confirmação explícita.
- A IA entende histórico financeiro e responde perguntas de período.
- Frontend e bots chamam serviços financeiros, não Stellar diretamente.
- Stellar SDK existe apenas em adapters internos.
- Analytics de produto usa linguagem de conta global.
- Suporte consegue buscar operação por `OP-...` sem expor hash bruto.

## 17. Norte final de produto

A melhor versão do TalkToStellar não parece uma carteira disfarçada. Parece uma conta global que liquida rápido porque tem uma infraestrutura moderna por baixo.

O usuário não deve pensar:

```text
Usei uma blockchain para enviar USDC.
```

Ele deve pensar:

```text
Enviei dinheiro pelo WhatsApp, vi a taxa antes, confirmei com segurança e recebi um comprovante claro.
```
