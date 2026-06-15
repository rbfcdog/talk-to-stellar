# Deliverable 3 / Week 4 Status

Status on 2026-06-15: documentation foundation ready for reviewer inspection. Final video, screenshots, and same-transfer JSON evidence are still pending.

## Award Evidence Labels

| Award evidence label | Status | Submit this file now |
|---|---|---|
| Video Demo Completo | Storyboard ready; final video pending | `evidence/video-demo-completo.md` |
| Diagramas de Arquitetura | Ready; Mermaid diagrams included | `evidence/diagramas-de-arquitetura.md` |
| Screenshot Fluxo Completo | Shot list ready; final screenshots pending | `evidence/screenshot-fluxo-completo.md` |
| Transfer Record Final | Record schema ready; final same-transfer record pending | `evidence/transfer-record-final.md` |

## Acceptance Checklist

| Requirement | Status | Evidence path |
|-------------|--------|---------------|
| Demo video explains PIX -> Stellar -> payout orchestration | Storyboard ready; recording pending | `evidence/video-demo-completo.md`, `evidence/video/` |
| Screenshots show quote, PIX, settlement, payout, evidence, and ops dashboard | Shot list ready; capture pending | `evidence/screenshot-fluxo-completo.md`, `evidence/screenshots/` |
| Architecture diagrams explain services, states, and evidence model | Ready | `evidence/diagramas-de-arquitetura.md`, `ARCHITECTURE-DIAGRAMS.md` |
| Final transfer record explains required shape and current boundary | Ready as requirement doc; final JSON pending | `evidence/transfer-record-final.md` |
| Technical walkthrough maps each step to API routes and services | Foundation ready | `TECHNICAL-WALKTHROUGH.md` |
| Setup documentation lists env, migration, backend, frontend, and provider steps | Foundation ready | `SETUP.md` |
| Final reviewer package links all artifacts | Foundation ready | `REVIEWER-PACKAGE.md` |
| Run report records final commands and outputs | Pending | `runs/<timestamp>.md` |

## Current Blockers

| Blocker | Impact | Resolution |
|---------|--------|------------|
| Final transfer evidence not captured | Cannot submit final screenshots/video/evidence bundle | Execute `DEMO-RUNBOOK.md` after environment and credentials are ready. |
| Circle sandbox credentials may be unavailable | Circle payout can only be compatibility evidence | Use `ENABLE_REAL_PAYOUT_EXECUTION=false` and label as compatibility, or add Circle sandbox key and linked destination ID. |
| Real Stellar testnet credentials may be unavailable | Settlement hash may be mock evidence | Configure `STELLAR_SECRET_KEY`, `USD_OFFRAMP_STELLAR_DESTINATION`, and USDC issuer for real testnet settlement. |
| Screenshot/video assets not recorded | Reviewer can read the flow but cannot watch it | Capture the shot list and video storyboard against the same transfer. |

## Completion Rule

This deliverable is complete only when every final artifact references the same transfer:

```text
legacy transfer_id:
normalized transfer id:
public_ref:
stellar_tx_hash:
payout_instruction_id:
provider_payout_id:
```

If any artifact uses mock or compatibility mode, the final package must label it clearly and avoid claiming real settlement or bank payout execution.
