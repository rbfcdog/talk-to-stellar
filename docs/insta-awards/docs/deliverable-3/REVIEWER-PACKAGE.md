# Reviewer Package

This is the final index reviewers should open after the D3 run is captured.

## Executive Summary

TalkToStellar demonstrates an institutional settlement route:

```text
Brazilian PIX funding -> Stellar USDC settlement -> USD payout coordination -> reconciliation evidence
```

The final package must identify one transfer and walk reviewers through every stage of that transfer.

## Final Artifact Index

| Artifact | Path or URL | Status |
|----------|-------------|--------|
| Demo video | `evidence/video/` | Pending |
| Screenshot set | `evidence/screenshots/` | Pending |
| Architecture diagrams | `ARCHITECTURE-DIAGRAMS.md` | Ready |
| Technical walkthrough | `TECHNICAL-WALKTHROUGH.md` | Ready |
| Setup documentation | `SETUP.md` | Ready |
| Demo runbook | `DEMO-RUNBOOK.md` | Ready |
| Evidence checklist | `EVIDENCE-CHECKLIST.md` | Ready |
| Claims boundary | `CLAIMS-BOUNDARY.md` | Ready |
| Final run report | `runs/<timestamp>.md` | Pending |

## JSON Evidence Index

| Artifact | Expected path | Source endpoint |
|----------|---------------|-----------------|
| Workflow | `evidence/json/workflow.json` | `GET /api/transfers/:id/workflow` |
| Reviewer evidence | `evidence/json/reviewer-evidence.json` | `GET /api/transfers/:id/reviewer-evidence` |
| Payout evidence | `evidence/json/payout-evidence.json` | `GET /api/transfers/:id/payout-evidence` |
| Orchestration log | `evidence/json/orchestration-log.json` | `GET /api/transfers/:id/orchestration-log` |
| Reconciliation | `evidence/json/reconciliation.json` | `GET /api/transfers/:id/reconciliation` |
| Payout providers | `evidence/json/payout-providers.json` | `GET /api/transfers/payout-providers` |

## Transfer Identity

Fill this after the final run:

```text
legacy transfer_id:
normalized transfer id:
public_ref:
quote_id:
pix_order_id:
stellar_tx_hash:
payout_provider:
payout_execution_mode:
payout_instruction_id:
provider_payout_id:
reconciliation_status:
```

## Reviewer Reading Order

1. Watch the demo video.
2. Open `ARCHITECTURE-DIAGRAMS.md`.
3. Open `TECHNICAL-WALKTHROUGH.md`.
4. Review screenshots in numeric order.
5. Review JSON evidence files.
6. Open the final run report under `runs/`.
7. Check `CLAIMS-BOUNDARY.md` for what is real, sandbox, compatibility, or mock.

## Current Package Status

Foundation docs are ready. Final media and JSON artifacts are pending a real or explicitly labeled sandbox/mock execution run.
