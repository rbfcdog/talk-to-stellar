import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("PIX asset defaults", () => {
  it("keeps generic PIX add-money links in BRL unless another asset is explicit", () => {
    const text = source("app/pix-ramp/pix-ramp-client.tsx");

    expect(text).toContain('normalizeTargetAsset(asset, "BRL")');
    expect(text).toContain("resolveOnRampTargetAssetFromQuery");
    expect(text).toContain('amountCurrency === "BRL") return "BRL"');
    expect(text).toContain('const headerCurrencyAsset = rampMode === "onramp" ? "BRL" : targetAsset');
    expect(text).not.toContain('mode === "onramp" ? "USDC" : "BRL"');
  });
});
