import { test, expect } from "@playwright/test";
import publicJourney from "./fixtures/chain-journey.json" with { type: "json" };
for (const width of [320, 768, 1440])
  for (const theme of ["light", "dark"] as const) {
    test(`live home and workspace at ${width} in ${theme}`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.setViewportSize({ width, height: 1000 });
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Your exit. Your conditions." }),
      ).toBeVisible();
      await expect(page.locator(".network-ledger")).toHaveText(
        /Ledger [0-9]+/,
        { timeout: 30000 },
      );
      await expect(page.locator(".route-vault strong")).toHaveText(
        /^[0-9]+(?:\.[0-9]+)?$/,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/home-${width}-${theme}.png`,
        fullPage: true,
      });
      await page.locator("#conditions summary").first().click();
      await expect(
        page.getByText("Your signature binds the share amount.", {
          exact: false,
        }),
      ).toBeVisible();
      if (width <= 800) {
        await page
          .getByRole("button", { name: "Open navigation", exact: true })
          .click();
        await expect(
          page.getByRole("button", { name: "Close navigation" }),
        ).toBeVisible();
        await page.getByRole("button", { name: "Close navigation" }).click();
      }
      await page.goto("/app");
      await expect(
        page.getByRole("heading", { name: "Ready when you are" }),
      ).toBeVisible();
      expect(await page.locator("input").count()).toBe(0);
      await expect(
        page.getByRole("button", { name: "Connect your wallet" }).first(),
      ).toBeEnabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/workspace-${width}-${theme}.png`,
        fullPage: true,
      });
      expect(errors).toEqual([]);
    });
  }
test("tracks the actual committed guarded exit and preserves its receipt on reload", async ({
  page,
}) => {
  const hash = publicJourney.operations.exit.hash;
  await page.goto("/receipt/" + hash);
  await expect(
    page.getByRole("heading", { name: "Your transaction is complete" }),
  ).toBeVisible({ timeout: 40000 });
  await expect(page.locator(".receipt-outcome strong").last()).toContainText(
    "48.7489096",
  );
  await expect(page.getByText(hash, { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download receipt" }).click();
  expect((await download).suggestedFilename()).toBe(
    "mierkhat-" + hash + ".json",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your transaction is complete" }),
  ).toBeVisible();
  await page.goto("/activity");
  await expect(page.locator(".activity-row")).toHaveCount(1);
  await page.getByLabel("Filter activity").selectOption("pending");
  await expect(page.locator(".activity-row")).toHaveCount(0);
  await page.getByLabel("Filter activity").selectOption("terminal");
  await expect(page.locator(".activity-row")).toHaveCount(1);
});
test("validates hash input and keeps an actual unknown network lookup unconfirmed", async ({
  page,
}) => {
  await page.goto("/activity");
  await page.getByLabel("Transaction hash", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Track hash" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Enter a 64 character hexadecimal transaction hash.",
  );
  const hash = crypto.randomUUID().replaceAll("-", "").repeat(2);
  await page.getByLabel("Transaction hash", { exact: true }).fill(hash);
  await page.getByRole("button", { name: "Track hash" }).click();
  await expect(
    page.getByRole("heading", { name: "Waiting for ledger confirmation" }),
  ).toBeVisible();
  await expect(
    page.getByText("We have not confirmed the network result yet.", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 40000 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Waiting for ledger confirmation" }),
  ).toBeVisible();
});
test("supports keyboard navigation and correct metadata without enabling an unknown shared review", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to your action" }),
  ).toBeFocused();
  expect(await page.locator("title").textContent()).toBe(
    "Mierkhat | Make your move",
  );
  expect(
    await page.locator('meta[property="og:title"]').getAttribute("content"),
  ).toBe("Mierkhat | Make your move");
  await page.goto("/review/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: "Sign in your wallet" }),
  ).toHaveCount(0);
});
