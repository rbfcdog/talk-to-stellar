# Documentation Summary: project-brain/architecture/deep-dives

Generated summary for `docs/project-brain/architecture/deep-dives`. Last generated: 2026-06-14.

## Markdown Files

| File | Title | Words | Summary | Language note |
|------|-------|-------|---------|---------------|
| [`quote-engine.md`](./quote-engine.md) | Quote Engine — Deep Dive | 230 | The quote engine fetches live BRL/USDC exchange rates from the **Stellar DEX** (decentralized exchange on testnet/mainnet). The quote is computed **fresh on every API call**. The frontend re-fetches on: | English or mostly English. |
| [`state-machines.md`](./state-machines.md) | State Machines — Deep Dive | 197 | **File**: `backend/src/api/services/international-transfer-state.service.ts` **States**: 11 (QUOTE_CREATED → PIX_PENDING → ... → PAYOUT_COMPLETED) | English or mostly English. |

## Notes

- This file is an English index summary for the folder. It does not replace the source documents.
- Source files that still contain Portuguese are marked in the language note column for follow-up translation.
- Generated summaries intentionally skip `DOCS-SUMMARY.md` to avoid recursive noise.
