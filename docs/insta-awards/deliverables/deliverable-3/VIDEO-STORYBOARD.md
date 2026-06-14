# Demo Video Storyboard

Target length: 5-8 minutes.

The final video should prove that reviewers can understand the flow, not just watch clicks. Narration should name the current state, evidence artifact, and code-backed system boundary for each segment.

## Chapter Plan

| Time | Segment | Screen | Narration goal |
|------|---------|--------|----------------|
| 0:00-0:30 | Opening | `README.md` or title slide | State the demo scope: PIX funding, Stellar USDC settlement, USD payout coordination, reconciliation. |
| 0:30-1:15 | Architecture | `ARCHITECTURE-DIAGRAMS.md` | Explain the service map and evidence model before showing UI. |
| 1:15-2:15 | Quote and transfer | `/institution-settlement` | Show BRL input, USD estimate, transfer creation, and same-name destination control. |
| 2:15-3:00 | PIX funding | `/institution-settlement` | Show PIX order/funding state and identify real provider, sandbox, or mock mode. |
| 3:00-4:00 | Stellar settlement | `/institution-settlement` and optional Stellar explorer | Show `stellar_tx_hash`, amount, asset, and network when real testnet is used. |
| 4:00-5:00 | Payout coordination | Payout tab/panel | Show Circle/provider mode, payout instruction ID, status, and evidence redaction. |
| 5:00-6:00 | Reconciliation | Reviewer evidence panel and JSON | Show workflow/reviewer evidence/reconciliation outputs for the same transfer. |
| 6:00-7:00 | Ops dashboard | `/ops` and optional `/admin/transactions` | Show normalized lifecycle row, timeline, reconciliation, and raw record. |
| 7:00-8:00 | Close | `REVIEWER-PACKAGE.md` | Summarize artifact locations and label any remaining blocked items. |

## Narration Script

Use this as a base script. Replace bracketed values during the final recording.

```text
This is the TalkToStellar institutional settlement flow demonstration.
The run tracks one transfer from PIX funding in Brazil, through Stellar USDC settlement, into USD payout coordination and reviewer-safe reconciliation evidence.

The transfer used in this recording is [TRANSFER_ID] with public reference [PUBLIC_REF].
The execution mode is [REAL TESTNET / SANDBOX / COMPATIBILITY / MOCK], and I will call that out whenever a provider boundary appears.

The first diagram shows the path: quote, transfer creation, PIX funding, Stellar settlement, payout instruction, status monitoring, and final evidence.
The important review point is that every screenshot and JSON artifact refers to the same transfer.

Now I am creating or loading the transfer in the institution settlement console.
The quote captures the BRL input amount, estimated USD output, USDC settlement amount, and fees.
The transfer stores sender identity, recipient identity, payout destination metadata, and same-name account alignment.

Next is PIX funding.
This run uses [Etherfuse sandbox / mock PIX], so the funding evidence is labeled accordingly.
The flow does not claim production PIX movement unless the provider evidence shows it.

Now Stellar settlement.
The settlement service submits USDC when testnet credentials are configured.
For this run the Stellar evidence is [TX HASH / MOCK HASH], and the evidence JSON records network, asset, amount, memo, and source/destination metadata.

After settlement, the payout adapter creates the USD payout instruction.
The provider is [Circle / Bridge / Etherfuse / mock].
The execution mode is [compatibility / sandbox_api / live_api / proof / mock].
Sensitive bank fields are redacted, and a real provider payout is only claimed if the provider returned a payout ID and response evidence.

The final section is reconciliation.
The reviewer evidence endpoint links the quote, PIX funding, Stellar settlement, payout instruction, status history, privacy notes, and readiness checklist.
The ops dashboard shows the same transfer in the normalized lifecycle timeline.

The final package includes this video, screenshots, architecture diagrams, setup docs, the technical walkthrough, JSON exports, and a run report.
Any blocked item is listed in STATUS.md with a concrete next step.
```

## Recording Checklist

- Use a clean browser profile or private window.
- Hide bookmark bars, unrelated tabs, personal account names, and secrets.
- Keep terminal font readable.
- Announce the execution mode before showing provider output.
- Show the same transfer ID in UI, API output, and evidence files.
- Pause briefly on each evidence screen so reviewers can read it.
- End by opening `REVIEWER-PACKAGE.md`.

## Final Video Metadata

Record these fields in the final run report:

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
