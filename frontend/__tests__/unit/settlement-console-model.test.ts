import { describe, expect, it } from "vitest";
import {
  payoutEvidenceRows,
  redactSensitive,
  routeEconomics,
} from "@/app/international-transfer/settlement-console.model";

describe("institution settlement console model", () => {
  it("derives charged route economics from persisted reconciliation metrics", () => {
    const economics = routeEconomics(
      {
        brl_amount: "560",
        fx_rate: "5.6",
        estimated_usd_amount: "99.55",
      },
      null,
      {
        evidence: {
          metrics: {
            baseline_usd_before_route_costs: "100",
            destination_usd_after_route_costs: "99.55",
            talktostellar_fee_brl: "1.68",
            talktostellar_fee_usd_equivalent: "0.3",
            provider_on_ramp_fee_brl_equivalent: "0.56",
            provider_on_ramp_fee_usd_equivalent: "0.1",
            provider_off_ramp_fee_brl_equivalent: "0.28",
            provider_off_ramp_fee_usd_equivalent: "0.05",
            total_charged_fee_usd: "0.45",
            total_charged_fee_brl_equivalent: "2.52",
          },
          metrics_valid: true,
        },
      },
    );

    expect(economics).toMatchObject({
      sourceBrl: 560,
      fxRate: 5.6,
      grossUsd: 100,
      destinationUsd: 99.55,
      totalFeeUsd: 0.45,
      totalFeeBrl: 2.52,
      retainedPct: 99.55,
      metricsValid: true,
    });
  });

  it("redacts credentials, identities, and bank details from copied evidence", () => {
    expect(redactSensitive({
      session_token: "secret-token",
      wallet_pin: "1234",
      sender_email: "person@example.com",
      accountNumber: "123456789",
      account_number_last4: "6789",
      provider_payout_id: "provider-123",
      amount: "100",
    })).toEqual({
      session_token: "[redacted]",
      wallet_pin: "[redacted]",
      sender_email: "[redacted]",
      accountNumber: "[redacted]",
      account_number_last4: "6789",
      provider_payout_id: "[redacted]",
      amount: "100",
    });
  });

  it("maps the Week 2 payout checklist into the reviewer strip", () => {
    expect(payoutEvidenceRows({
      checklist: [
        { id: "adapter_interface_code", label: "Adapter Interface Code", ready: true, artifact: "backend/src/api/services/usd-payout-adapters.ts" },
        { id: "stellar_transaction_hash", label: "Stellar Transaction Hash", ready: false, artifact: "Awaiting settlement" },
      ],
    })).toEqual([
      expect.objectContaining({ id: "adapter_interface_code", ready: true }),
      expect.objectContaining({ id: "stellar_transaction_hash", ready: false }),
    ]);
    expect(payoutEvidenceRows(null).filter((item) => item.ready)).toHaveLength(2);
  });
});
