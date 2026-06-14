# Execucao real de rendimento DeFindex

Este fluxo ja esta implementado no backend para testnet: a tela prepara a revisao, o usuario digita o PIN e o backend monta uma transacao DeFindex, assina com a secret da carteira salva no vault do backend e envia pelo SDK oficial.

## Envs necessarias

Backend:

```env
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org

DEFINDEX_API_KEY=sk_...
DEFINDEX_BASE_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_COMPLIANCE_APPROVED=true
DEFINDEX_ALLOW_MAINNET_EXECUTION=false

DEFINDEX_USDC_VAULT=CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN
DEFINDEX_CETES_VAULT=CBIS5TEMTNNOTBE3WXPQUAGUEDYZZVIWAKTXEQCOUJ34OJJ3FJ5NLF2P
DEFINDEX_XLM_VAULT=CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6
CETES_ISSUER_TESTNET=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
```

Frontend nao precisa de env extra para executar rendimento. A tela le `GET /api/ramp/defindex/yield/status`; quando o backend retorna `execution_enabled=true`, a UX troca de modo revisao para confirmacao com PIN.

## Como gerar o bloco

Com `DEFINDEX_API_KEY` ja carregada no ambiente:

```bash
npm --prefix backend run defindex:env -- --network testnet --enable-execution --compliance-approved
```

Para salvar:

```bash
npm --prefix backend run defindex:env -- --network testnet --enable-execution --compliance-approved --write .env.defindex.testnet
```

## O que precisa existir alem das envs

1. Usuario logado com conta criada.
2. PIN valido.
3. Secret da carteira salva no vault do backend (`vaultSecretId` na sessao/usuario).
4. Saldo suficiente no asset selecionado.
5. Vault DeFindex valido para o asset e rede.
6. Trustline/asset/liquidez corretos para depositar ou resgatar.
7. `DEFINDEX_NETWORK` e `STELLAR_NETWORK` apontando para a mesma rede.

## Seguranca da execucao

O endpoint de confirmacao nao assina XDR arbitrario vindo do browser. Mesmo que o cliente envie `unsigned_xdr`, o backend ignora e monta uma nova transacao DeFindex server-side antes de assinar com o PIN. Isso evita que o browser tente fazer o servidor assinar uma operacao diferente da revisao.

## Mainnet

Mainnet continua bloqueada por padrao. Para mainnet, alem de trocar rede/vaults para producao, o backend exige:

```env
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_COMPLIANCE_APPROVED=true
DEFINDEX_ALLOW_MAINNET_EXECUTION=true
```

Nao use mainnet sem revisao juridica/compliance, termos, disclosures, controles de elegibilidade e validacao de cada vault.
