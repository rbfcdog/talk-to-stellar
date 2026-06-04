import { describe, expect, it } from "vitest";
import { resolveReturnTarget } from "@/lib/return-target";

describe("return target routing", () => {
  it("returns to the original PIX off-ramp screen instead of the generic PIX page", () => {
    const target = resolveReturnTarget({
      language: "pt-BR",
      source: "pix-off",
    });

    expect(target).toMatchObject({
      href: "/pix-off?lang=pt-BR",
      label: "Voltar ao PIX",
      source: "pix-off",
    });
  });

  it("returns to the original PIX on-ramp screen instead of the generic PIX page", () => {
    const target = resolveReturnTarget({
      language: "en",
      source: "pix-on",
    });

    expect(target).toMatchObject({
      href: "/pix-on?lang=en",
      label: "Back to PIX",
      source: "pix-on",
    });
  });

  it("preserves a full original PIX callback URL when return_to is provided", () => {
    const target = resolveReturnTarget({
      language: "pt-BR",
      source: "pix-off",
      returnTo: "/pix-off?mode=offramp&amount=100&source_asset=XLM&destination_pix_key=abc&stay_open=1",
    });

    expect(target.href).toBe("/pix-off?mode=offramp&amount=100&source_asset=XLM&destination_pix_key=abc&stay_open=1&lang=pt-BR");
    expect(target.label).toBe("Voltar ao PIX");
    expect(target.source).toBe("pix-off");
  });
});
