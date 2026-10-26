import { test, expect } from "@playwright/test";
import chainSuccess from "./fixtures/chain-success.json" with { type: "json" };
for (const width of [320, 768, 1440])
  for (const theme of ["light", "dark"]) {
    test(`workspace and example review at ${width} in ${theme}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/");
      await page.getByLabel("Appearance").selectOption(theme);
      await expect(page).toHaveTitle("Mierkhat | Make your move");
      await expect(
        page.getByRole("button", { name: "Connect your wallet" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Your minimum" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/workspace-${width}-${theme}.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Explore an example" }).click();
      await expect(
        page.getByText(
          "These are example assets. No real transaction can be signed here.",
        ),
      ).toBeVisible();
      await page.getByLabel("Shares to withdraw").fill("notanumber");
      await page.getByRole("button", { name: "Preview example" }).click();
      await expect(page.getByLabel("Shares to withdraw")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      await expect(page.getByRole("alert")).toContainText("Shares to withdraw");
      await page.getByLabel("Shares to withdraw").fill("100");
      await page.getByLabel("Minimum to receive").fill("98");
      await page.getByRole("button", { name: "Preview example" }).click();
      await expect(page.getByText("98", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Sign in your wallet" }),
      ).toBeDisabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `artifacts/review-${width}-${theme}.png`,
        fullPage: true,
      });
      expect(errors).toEqual([]);
    });
  }
test("keyboard navigation, reduced motion and storage denied", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("denied", "SecurityError");
    };
  });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to your action" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  expect(
    await page.locator("main").evaluate((e) => e === document.activeElement),
  ).toBe(true);
  expect(
    await page
      .locator(".boundary")
      .evaluate((e) => getComputedStyle(e).animationName),
  ).toBe("none");
  await page.getByLabel("Appearance").selectOption("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
test("reload resumes hash monitoring and unknown never becomes failure", async ({
  page,
}) => {
  const hash =
    "bb8b93098ca08e20774dc906483487cc9fb887c4b9abea505698fa91baed21cd";
  let terminal = false;
  await page.route("https://soroban-testnet.stellar.org/**", async (route) => {
    const request = route.request().postDataJSON();
    await route.fulfill({
      json: {
        jsonrpc: "2.0",
        id: request.id,
        result: terminal
          ? chainSuccess
          : {
              status: "NOT_FOUND",
              latestLedger: 5400050,
              latestLedgerCloseTime: 1793023837,
              oldestLedger: 1,
              oldestLedgerCloseTime: 1,
            },
      },
    });
  });
  await page.addInitScript(
    ({ hash }) =>
      localStorage.setItem(
        "mierkhat.pending.testnet." + hash,
        JSON.stringify({
          environment: "testnet",
          epoch: "fixture",
          hash,
          intentHash: "02".repeat(32),
          createdAt: new Date().toISOString(),
        }),
      ),
    { hash },
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Waiting for the network" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "We have not confirmed the network result yet. Check this action before starting another.",
    ),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Waiting for the network" }),
  ).toBeVisible();
  expect(
    await page.getByRole("button", { name: "Review your action" }).count(),
  ).toBe(0);
  terminal = true;
  await page.getByRole("button", { name: "Check status" }).click();
  await expect(
    page.getByRole("heading", { name: "Your action is complete" }),
  ).toBeVisible();
  await expect(page.getByText("99.2054606", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download receipt" }).click();
  expect((await download).suggestedFilename()).toBe("Mierkhat receipt.json");
});
test("review links cannot enable an unbundled deployment", async ({ page }) => {
  await page.route("**/v1/reviews/**", (route) =>
    route.fulfill({
      status: 404,
      json: { code: "ReviewMissing", copyKey: "review.missing" },
    }),
  );
  await page.goto("/review/00000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("alert")).toContainText(
    "We could not find this review.",
  );
  await expect(
    page.getByRole("button", { name: "Sign in your wallet" }),
  ).toHaveCount(0);
});
