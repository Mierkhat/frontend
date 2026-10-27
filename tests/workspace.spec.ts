import { t } from "@mierkhat/copy";
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
        page.getByRole("heading", {
          name: t("home.headline_a") + " " + t("home.headline_b"),
        }),
      ).toBeVisible();
      await expect(page.locator(".network-ledger")).toHaveText(
        /Ledger [0-9]+/,
        { timeout: 45000 },
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
        page.getByText(t("home.condition_spend_body"), {
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
        page.getByRole("heading", { name: t("workspace.ready") }),
      ).toBeVisible();
      expect(await page.locator("input").count()).toBe(0);
      await expect(
        page.getByRole("button", { name: t("wallet.connect") }).first(),
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
    page.getByRole("heading", { name: t("receipt.setup_success") }),
  ).toBeVisible({ timeout: 40000 });
  await expect(page.locator(".receipt-outcome strong").last()).toContainText(
    "48.7489096",
  );
  await expect(page.getByText(hash, { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: t("receipt.download") }).click();
  expect((await download).suggestedFilename()).toBe(
    "mierkhat-" + hash + ".json",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: t("receipt.setup_success") }),
  ).toBeVisible();
  await page.goto("/activity");
  await expect(page.locator(".activity-row")).toHaveCount(1);
  await page.getByLabel(t("activity.filter")).selectOption("pending");
  await expect(page.locator(".activity-row")).toHaveCount(0);
  await page.getByLabel(t("activity.filter")).selectOption("terminal");
  await expect(page.locator(".activity-row")).toHaveCount(1);
});
test("validates hash input and keeps an actual unknown network lookup unconfirmed", async ({
  page,
}) => {
  await page.goto("/activity");
  await page.getByLabel("Transaction hash", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: t("activity.track") }).click();
  await expect(page.getByRole("alert")).toHaveText(t("input.hash_required"));
  const hash = crypto.randomUUID().replaceAll("-", "").repeat(2);
  await page.getByLabel("Transaction hash", { exact: true }).fill(hash);
  await page.getByRole("button", { name: t("activity.track") }).click();
  await expect(
    page.getByRole("heading", { name: t("receipt.waiting") }),
  ).toBeVisible();
  await expect(
    page.getByText(t("pending.unknown"), {
      exact: false,
    }),
  ).toBeVisible({ timeout: 40000 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: t("receipt.waiting") }),
  ).toBeVisible();
});
test("supports keyboard navigation and correct metadata without enabling an unknown shared review", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: t("nav.skip") })).toBeFocused();
  expect(await page.locator("title").textContent()).toBe(t("title.home"));
  expect(
    await page.locator('meta[property="og:title"]').getAttribute("content"),
  ).toBe(t("title.home"));
  await page.goto("/contracts");
  await page
    .getByRole("link", { name: t("nav.conditions"), exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: t("home.promise_a") + " " + t("home.promise_b"),
    }),
  ).toBeInViewport();
  await page.goto("/review/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20000 });
  await expect(
    page.getByRole("button", { name: t("action.sign") }),
  ).toHaveCount(0);
});

test("opens a wallet chooser before connection and handles missing Freighter without a global spinner", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page
      .locator("header")
      .getByRole("link", { name: "Open workspace", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('header [aria-current="page"]')).toHaveText(
    "Workspace",
  );
  const connect = page
    .getByRole("button", { name: t("wallet.connect"), exact: true })
    .first();
  await connect.click();
  const dialog = page.getByRole("dialog", { name: t("wallet.choose") });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link", { name: /Freighter/ })).toHaveAttribute(
    "href",
    "https://www.freighter.app/",
  );
  await expect(page.locator(".connection-status")).toHaveCount(0);
  await expect(
    page.getByText(t("common.checking"), { exact: true }),
  ).toHaveCount(0);
  expect(page.context().pages()).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(connect).toBeFocused();
  await connect.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: t("wallet.close") }).click();
  await expect(connect).toBeFocused();
});
test("keeps all appearance options readable in dark mode and supports keyboard selection", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/app");
  const trigger = page.getByRole("button", { name: "Appearance", exact: true });
  await trigger.click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await trigger.click();
  await expect(
    page.getByRole("menuitemradio", { name: "Dark", exact: true }),
  ).toHaveAttribute("aria-checked", "true");
  const ratios = await page
    .getByRole("menuitemradio")
    .evaluateAll((options) => {
      const lum = (rgb: string) => {
        const n = rgb
          .match(/[0-9.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((v) => {
            v /= 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          });
        return 0.2126 * n[0]! + 0.7152 * n[1]! + 0.0722 * n[2]!;
      };
      return options.map((option) => {
        const s = getComputedStyle(option),
          a = lum(s.color),
          b = lum(s.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      });
    });
  expect(ratios).toHaveLength(3);
  for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitemradio", { name: "System", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem("mierkhat.theme")),
  ).toBe("system");
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("fits the wallet dialog and themed appearance menu on a narrow screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/app");
  await page
    .getByRole("button", { name: t("wallet.connect"), exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: t("wallet.choose") });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: "test-results/wallet-dialog-mobile-dark.png" });
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await expect(
    page.getByRole("menuitemradio", { name: "Light", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("reveals sections once, keeps focused content visible and stops motion when the preference changes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await page.evaluate(() => {
    const target = document.querySelector(".condition-list details")!;
    window.scrollTo({
      top: target.getBoundingClientRect().top + scrollY - 160,
      behavior: "instant",
    });
  });
  const condition = page.locator(".condition-list details").first();
  await expect
    .poll(() =>
      condition.evaluate(
        (el) =>
          el.getAnimations().filter((a) => a.playState === "running").length,
      ),
    )
    .toBeGreaterThan(0);
  const summary = condition.locator("summary");
  await summary.focus();
  await expect(summary).toBeFocused();
  await expect
    .poll(() => condition.evaluate((el) => el.getAnimations().length))
    .toBe(0);
  await summary.press("Enter");
  await expect(condition.locator("p")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.getAnimations().filter((a) => a.playState === "running")
            .length,
      ),
    )
    .toBe(0);
  await page.goto("/app");
  await page
    .getByRole("button", { name: t("wallet.connect"), exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("closes mobile navigation with Escape and returns focus to its toggle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/help");
  const toggle = page.getByRole("button", { name: t("nav.menu"), exact: true });
  await toggle.click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: t("nav.activity"), exact: true })
    .focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
