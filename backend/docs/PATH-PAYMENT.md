# Path Payment Strict Receive - Conversão de Ativos

Esta documentação explica as novas funcionalidades de Path Payment implementadas na StellarService.

## Visão Geral

O **Path Payment Strict Receive** é uma operação especial da Stellar que permite enviar um ativo e garantir que o destinatário receba uma quantia exata de um ativo diferente. O sistema automaticamente encontra o melhor caminho de conversão através da DEX (Decentralized Exchange) da Stellar.

## Status Atual: Ponte BRL -> USD via XLM

### O que já está implementado
- Busca de rota de conversão usando `strictReceivePaths` no Horizon.
- Seleção do caminho com menor `source_amount` (otimização básica por preço).
- Construção de transação `pathPaymentStrictReceive`.
- Fluxo de depósito com âncora (SEP-24) para entrada de fiat (ex.: PIX/BRL), via `AnchorService`.

### O que ainda não está completo para uma ponte BRL -> USD otimizada fim a fim
- Quote formal de BRL -> USD com proteção de slippage antes da assinatura.
- Fluxo completo de saída para USD fiat (withdraw) no mesmo pipeline.
- Estratégia avançada de roteamento (liquidez, impacto de preço, fallback entre caminhos).
- Monitoramento consolidado de taxa efetiva BRL/USD e custo total da operação.

### Conclusão prática
O projeto já possui a base técnica de conversão on-chain via XLM e path payment. No entanto, ainda não oferece uma ponte BRL -> USD totalmente otimizada ponta a ponta em nível de produto.

## Casos de Uso

### Cenário Típico
- **Você tem:** 200 EUR
- **Quer enviar:** Exatamente 100 USDC para alguém
- **O sistema faz:** Encontra o melhor caminho EUR → XLM → USDC
- **Resultado:** Destinatário recebe exatos 100 USDC, você paga o mínimo necessário em EUR

### Vantagens
- ✅ **Precisão:** Destinatário recebe valor exato
- ✅ **Economia:** Encontra automaticamente o melhor preço
- ✅ **Simplicidade:** Uma única operação faz toda a conversão
- ✅ **Transparência:** Mostra exatamente quanto será gasto

## Endpoints Implementados

### 1. `/api/actions/build-path-payment-xdr` (POST)

**Descrição:** Constrói um XDR não assinado para path payment.

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "sourcePublicKey": "GCKFBEIYTKP6Q33CVDH6YNOJHSVRTR7TIQDT7KXKR7OKDAKVWCSYZB2R",
  "destination": "GDQNY3PBOJOKYZSRMK2S7LHHGWZIUISD4QORETLMXEWXBI7KFZZMKTL3",
  "destAsset": {
    "code": "USDC",
    "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
  },
  "destAmount": "100.00",
  "sourceAsset": {
    "code": "EUR",
    "issuer": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
  }
}
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "xdr": "AAAAAgAAAABt...",
  "message": "Path payment XDR built successfully. Sign and submit externally."
}
```

### 2. `/api/actions/execute-path-payment` (POST)

**Descrição:** Executa um path payment de forma custodial.

> Observação: dependendo da versão da API em execução, este fluxo pode estar representado por `build-path-payment-xdr` + `sign-and-submit-xdr`.

**Headers:**
```
Authorization: Bearer <jwt-token>
Content-Type: application/json
```

**Body:**
```json
{
  "destination": "GDQNY3PBOJOKYZSRMK2S7LHHGWZIUISD4QORETLMXEWXBI7KFZZMKTL3",
  "destAsset": {
    "code": "USDC",
    "issuer": "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
  },
  "destAmount": "100.00",
  "sourceAsset": {
    "code": "EUR",
    "issuer": "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
  },
  "secretKey": "SAMPLEKEY123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
}
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "hash": "3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889"
}
```

**Resposta de Erro:**
```json
{
  "success": false,
  "error": "Não foi encontrado um caminho de conversão entre os ativos."
}
```

## Validações Implementadas

### Campos Obrigatórios
- `destination`: Chave pública do destinatário (56 caracteres)
- `destAsset.code`: Código do ativo de destino
- `destAsset.issuer`: Emissor do ativo de destino (56 caracteres)
- `destAmount`: Quantidade exata que o destinatário deve receber
- `sourceAsset.code`: Código do ativo de origem
- `sourceAsset.issuer`: Emissor do ativo de origem (56 caracteres)
- `secretKey`: Chave secreta para assinar (apenas em execute-path-payment)

### Validações Específicas
- Chaves públicas devem ter exatamente 56 caracteres
- Códigos de ativos não podem ser vazios
- Valores devem ser strings numéricas válidas
- Assets devem ter code e issuer válidos

## Como Funciona Internamente

### 1. Busca de Caminhos
```typescript
// Sistema consulta o Horizon para encontrar caminhos possíveis
const pathsResponse = await server.strictReceivePaths(
  [sourceAssetObj],
  destAssetObj,
  destAmount
).call();
```

### 2. Seleção do Melhor Caminho
```typescript
// Seleciona o caminho com menor source_amount (mais barato)
let bestPath = pathsResponse.records[0];
for (const path of pathsResponse.records) {
  if (parseFloat(path.source_amount) < parseFloat(bestPath.source_amount)) {
    bestPath = path;
  }
}
```

### 3. Construção da Operação
```typescript
Operation.pathPaymentStrictReceive({
  sendAsset: sourceAssetObj,
  sendMax: bestPath.source_amount,
  destination: destination,
  destAsset: destAssetObj,
  destAmount: destAmount,
  path: pathAssets
})
```

## Tratamento de Erros

### Erros Comuns
- **"Não foi encontrado um caminho de conversão entre os ativos"**
  - Não existe liquidez suficiente na DEX
  - Assets não estão sendo negociados
  - Valor muito alto para conversão

- **"Invalid public key format"**
  - Chave pública não tem 56 caracteres
  - Caracteres inválidos na chave

- **"Destination asset code is required"**
  - Campo obrigatório não fornecido

### Logs de Operação
Todas as operações são registradas no banco de dados com:
- Status: PENDING → COMPLETED/FAILED
- Tipo: PATH_PAYMENT
- Context: JSON com todos os detalhes da operação
- Hash da transação (se sucesso)

## Diferenças entre Build e Execute

| Aspecto | Build XDR | Execute |
|---------|-----------|---------|
| **Uso** | Carteiras não custodiais | Operação custodial |
| **Autenticação** | Requer JWT | Requer JWT |
| **Assinatura** | Cliente assina | Servidor assina |
| **Resultado** | XDR não assinado | Transação submetida |
| **Segurança** | Client-side | Server-side |

## Exemplos de Teste

Execute o arquivo de exemplo:
```bash
npx ts-node examples/path-payment-example.ts
```

Ou teste diretamente com as validações no projeto.

## Próximos Passos

1. **Implementar suporte para XLM nativo** como source/dest asset
2. **Adicionar limite de slippage** configurável
3. **Cache de caminhos** para melhor performance
4. **Estimativa de fees** mais precisa
5. **Suporte a múltiplos path** para maximizar liquidez
6. **Quote BRL -> USD pré-transação** com taxa estimada, impacto e validade
7. **Pipeline completo BRL in / USD out** com rastreamento ponta a ponta