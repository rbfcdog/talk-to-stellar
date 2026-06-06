import { expect, test } from "@playwright/test";

function isClientError(text: string) {
  return (
    text.includes("Encountered a script tag while rendering React component") ||
    text.includes("Application error") ||
    text.includes("Hydration failed") ||
    text.includes("Unhandled Runtime Error")
  );
}

test.describe("user-facing smoke paths", () => {
  test("renders investment alias routes without client errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error" && isClientError(message.text())) errors.push(message.text());
    });

    for (const path of ["/yield", "/rendimento", "/money-cycle?cycle=1&action=deposit", "/mainnet"]) {
      await page.goto(path, { waitUntil: "load" });
      await expect(page.getByText(/Returns|Rendimentos/).first()).toBeVisible();
      await expect(page.getByText(/Sign in|Entre/).first()).toBeVisible();
    }

    expect(errors).toEqual([]);
  });

  test("auth-gated pages render when browser storage is blocked", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => {
      const blocked = () => {
        throw new Error("storage disabled");
      };
      Object.defineProperty(window, "localStorage", { configurable: true, get: blocked });
      Object.defineProperty(window, "sessionStorage", { configurable: true, get: blocked });
    });

    try {
      for (const path of ["/chat", "/balance", "/pix-ramp", "/login", "/create-account", "/pay-anyone"]) {
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => {
          if (message.type() === "error" && isClientError(message.text())) errors.push(message.text());
        });

        await page.goto(path, { waitUntil: "load" });
        await expect(page.locator("body")).not.toContainText("This page couldn’t load");
        await expect(page.locator("body")).not.toContainText("This page couldn't load");
        expect(errors).toEqual([]);
        await page.close();
      }
    } finally {
      await context.close();
    }
  });
});
