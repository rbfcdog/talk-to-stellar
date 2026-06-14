# Deliverable 3 Status

Status on 2026-06-13: documentation foundation in progress.

## Acceptance Checklist

| Requirement | Status | Evidence path |
|-------------|--------|---------------|
| Demo video explains PIX -> Stellar -> payout orchestration | Pending | `evidence/video/` |
| Screenshots show quote, PIX, settlement, payout, evidence, and ops dashboard | Pending | `evidence/screenshots/` |
| Architecture diagrams explain services, states, and evidence model | Foundation ready | `ARCHITECTURE-DIAGRAMS.md` |
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
