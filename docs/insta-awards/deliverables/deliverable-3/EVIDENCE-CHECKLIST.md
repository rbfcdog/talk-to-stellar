# Evidence Checklist

Use this checklist to decide when the D3 package is ready for reviewers.

## Required Evidence

| Evidence | Required status | Artifact |
|----------|-----------------|----------|
| Video Demo Completo | Storyboard now; captured video for final | `evidence/video-demo-completo.md`, then `evidence/video/<run-id>.mp4` or hosted link |
| Diagramas de Arquitetura | Current and ready | `evidence/diagramas-de-arquitetura.md` |
| Screenshot Fluxo Completo | Shot list now; captured screenshots for final | `evidence/screenshot-fluxo-completo.md`, then `evidence/screenshots/*.png` |
| Transfer Record Final | Required shape now; same-transfer JSON for final | `evidence/transfer-record-final.md`, then `evidence/json/final-transfer-record.json` |
| Architecture diagrams source | Current | `ARCHITECTURE-DIAGRAMS.md` |
| Technical walkthrough | Current | `TECHNICAL-WALKTHROUGH.md` |
| Setup documentation | Current | `SETUP.md` |
| Demo command runbook | Current | `DEMO-RUNBOOK.md` |
| Reviewer package index | Current | `REVIEWER-PACKAGE.md` |
| Workflow JSON | Captured | `evidence/json/workflow.json` |
| Reviewer evidence JSON | Captured | `evidence/json/reviewer-evidence.json` |
| Payout evidence JSON | Captured | `evidence/json/payout-evidence.json` |
| Orchestration log JSON | Captured | `evidence/json/orchestration-log.json` |
| Reconciliation JSON | Captured | `evidence/json/reconciliation.json` |
| Final run report | Captured | `runs/<timestamp>.md` |

## Consistency Checks

Every final artifact must agree on:

- `transfer_id`
- normalized transfer ID or `public_ref`
- settlement mode.
- payout provider.
- payout execution mode.
- evidence capture timestamp.

## Reviewer Readiness Gates

| Gate | Pass condition |
|------|----------------|
| Flow legibility | A reviewer can explain each step without reading code. |
| Code traceability | Each step cites current backend/frontend files. |
| Evidence consistency | Video, screenshots, and JSON refer to the same transfer. |
| Secrets redaction | No private key, API key, token, PIN, full account number, or full routing number is visible. |
| Provider honesty | Real, sandbox, compatibility, proof, and mock modes are labeled accurately. |
| Settlement proof | A real testnet run shows a Stellar hash, or the package clearly labels mock settlement. |
| Payout proof | A real/sandbox payout shows provider response evidence, or the package clearly labels compatibility mode. |

## Do Not Submit If

- Screenshots come from multiple unrelated transfers.
- The video says "real Circle payout" but the evidence only shows compatibility mode.
- The Stellar hash starts with `mock-stellar-` and the package calls it real testnet.
- Any screenshot or JSON file exposes secrets or full bank details.
- `STATUS.md` still has unresolved final evidence blockers without explanation.
