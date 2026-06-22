# Deliverable 3 - Submit This

Use this guide for the Instawards Deliverable 3 upload fields:

```text
Video Demo Completo
Diagramas de Arquitetura
Screenshot Fluxo Completo
```

Active package:

```text
docs/insta-awards/deliverables/deliverable-3/
```

## Quick Upload Map

| Award field | Submit this now | If the platform requires media |
|---|---|---|
| Video Demo Completo | `docs/insta-awards/deliverables/deliverable-3/evidence/video-demo-completo.md` | Upload the recorded demo video from `docs/insta-awards/deliverables/deliverable-3/evidence/video/`. |
| Diagramas de Arquitetura | `docs/insta-awards/deliverables/deliverable-3/evidence/diagramas-de-arquitetura.md` | Export or screenshot the Mermaid diagrams from that file. |
| Screenshot Fluxo Completo | `docs/insta-awards/deliverables/deliverable-3/evidence/screenshot-fluxo-completo.md` | Upload the PNG screenshots from `docs/insta-awards/deliverables/deliverable-3/evidence/screenshots/`. |

## 1. Video Demo Completo

Submit `evidence/video-demo-completo.md` if the platform accepts Markdown evidence.

If the platform requires an actual video, record a 5-8 minute screen recording using:

```text
docs/insta-awards/deliverables/deliverable-3/VIDEO-STORYBOARD.md
```

The video should show one transfer moving through:

1. BRL/USD quote generation.
2. Transfer creation.
3. PIX funding intake.
4. Stellar USDC settlement or clearly labeled simulation.
5. USD payout instruction generation.
6. Settlement and payout evidence.
7. Reconciliation JSON.
8. Ops dashboard lifecycle for the same transfer.

Paste this description with the upload:

```text
Complete TalkToStellar transfer-routing demo showing one BRL-funded transfer through quote creation, PIX funding, Stellar USDC settlement, USD payout instruction, reconciliation evidence, and ops dashboard lifecycle review. Execution mode is labeled in the video, and all artifacts reference the same transfer.
```

After recording, fill these metadata fields in the run report:

```text
video_file:
duration:
recorded_at:
transfer_id:
public_ref:
stellar_tx_hash:
payout_instruction_id:
execution_mode:
screenshots_folder:
json_evidence_folder:
```

## 2. Diagramas de Arquitetura

Submit:

```text
docs/insta-awards/deliverables/deliverable-3/evidence/diagramas-de-arquitetura.md
```

This is the most ready field. The file already contains the Mermaid diagrams for:

- end-to-end reviewer flow;
- service architecture;
- lifecycle state model;
- evidence artifact model;
- API walkthrough.

Paste this description with the upload:

```text
Architecture diagrams for the end-to-end transfer-routing demonstration. They show the reviewer flow, frontend/backend services, provider boundaries, lifecycle state machine, evidence artifacts, and API walkthrough from PIX funding through Stellar settlement, payout instruction, reconciliation, and dashboard review.
```

If images are required instead of Markdown, render or screenshot the Mermaid diagrams from:

```text
docs/insta-awards/deliverables/deliverable-3/evidence/diagramas-de-arquitetura.md
```

## 3. Screenshot Fluxo Completo

Submit `evidence/screenshot-fluxo-completo.md` if the platform accepts Markdown evidence.

If the platform requires images, capture and upload these PNGs:

| File | What it must show |
|---|---|
| `01-institution-settlement-overview.png` | End-to-end route overview and selected transfer. |
| `02-quote-and-transfer.png` | BRL amount, USD estimate, fee breakdown, transfer ID. |
| `03-pix-funding.png` | PIX reference and funding status. |
| `04-stellar-settlement.png` | Stellar tx hash when available, network, asset, amount. |
| `05-payout-coordination.png` | Provider, execution mode, payout instruction ID, status. |
| `06-reviewer-evidence.png` | Reviewer evidence for the same transfer. |
| `07-ops-dashboard-list.png` | Same transfer row in `/ops?source=transfers`. |
| `08-ops-dashboard-detail.png` | Lifecycle timeline, reconciliation, raw transfer record. |
| `09-admin-transactions.png` | Admin transaction view for the same transfer. |
| `10-json-evidence-folder.png` | Workflow, payout, orchestration, and reconciliation JSON files. |

Paste this description with the upload:

```text
Screenshot package for one complete TalkToStellar transfer-routing flow. The screenshots show quote, transfer creation, PIX funding, Stellar settlement evidence, payout coordination, reviewer evidence, ops dashboard lifecycle, admin transaction view, and JSON evidence files for the same transfer.
```

## Submission Rules

- Use one transfer ID/public reference across the video, screenshots, and JSON evidence.
- Do not show API keys, private keys, PINs, session tokens, full bank account numbers, or full routing numbers.
- If a step uses sandbox, compatibility, or mock mode, keep that label visible and do not claim live production delivery.
- If final media has not been captured yet, submit the Markdown evidence files above and state that final video/screenshots are pending.

## Final Completion Rule

Deliverable 3 is final only when these all point to the same transfer:

```text
video_file:
screenshots_folder:
final_transfer_record_json:
transfer_id:
public_ref:
stellar_tx_hash:
payout_instruction_id:
execution_mode:
```
