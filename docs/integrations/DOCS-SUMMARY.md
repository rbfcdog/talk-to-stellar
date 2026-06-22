# Documentation Summary: integrations

Generated summary for `docs/integrations`. Last generated: 2026-06-14. Manually updated 2026-06-22 for Soroswap SDK testing workflow.

## Markdown Files

| File | Title | Words | Summary | Language note |
|------|-------|-------|---------|---------------|
| [`ETHERFUSE_PIX_KYC_FLOW.md`](./ETHERFUSE_PIX_KYC_FLOW.md) | Etherfuse PIX, KYC e entrega do asset final | 1464 | Este documento descreve como o fluxo de PIX ramp da TalkToStellar funciona hoje, quais endpoints internos e externos sao usados, como o KYC entra no processo e como o saldo chega na wallet Stellar. A integracao atual usa a Etherfuse como anchor para simular/op... | Portuguese text remains in source; review for translation. |
| [`REGIONAL_STARTER_PACK_PIX_RAMP.md`](./REGIONAL_STARTER_PACK_PIX_RAMP.md) | TalkToStellar PIX/TESOURO Ramp | 1763 | Este guia descreve a integracao do TalkToStellar com o Etherfuse sandbox usando o codigo portavel do `sandbox/regional-starter-pack`. Conectar wallets TalkToStellar ao fluxo regional de on-ramp e off-ramp: | English or mostly English. |
| [`SOROSWAP-SDK-TESTING-FLOW.md`](./SOROSWAP-SDK-TESTING-FLOW.md) | Soroswap SDK and Wallet Testing Flow | 1819 | Operator workflow for Soroswap SDK usage, TalkToStellar `/api/swap` endpoints, wallet requirements, backend-created test wallets, quote-only checks, XDR build, signing, submission, and verification evidence. | English or mostly English. |
| [`defindex-logging.md`](./defindex-logging.md) | Logs Defindex/APY | 330 | O backend agora registra logs estruturados com prefixo: No backend, deixe pelo menos: | English or mostly English. |
| [`defindex-real-execution.md`](./defindex-real-execution.md) | Execucao real de rendimento DeFindex | 301 | Este fluxo ja esta implementado no backend para testnet: a tela prepara a revisao, o usuario digita o PIN e o backend monta uma transacao DeFindex, assina com a secret da carteira salva no vault do backend e envia pelo SDK oficial. Frontend nao precisa de env ... | English or mostly English. |

## Notes

- This file is an English index summary for the folder. It does not replace the source documents.
- Source files that still contain Portuguese are marked in the language note column for follow-up translation.
- Generated summaries intentionally skip `DOCS-SUMMARY.md` to avoid recursive noise.
