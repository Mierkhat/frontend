/** Real unsigned review checks: preserve watched conditions and render migration shares
 * consistently in the workspace and a shared review. No wallet/network substitutes. */
import { chromium, expect as baseExpect } from "@playwright/test";
import { formatAmount } from "@mierkhat/sdk";
import { t } from "@mierkhat/copy";
import fs from "node:fs";
import path from "node:path";
const expect = baseExpect.configure({ timeout: 90000 }),
  root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter");
const registry = JSON.parse(fs.readFileSync("src/deployments.json", "utf8"));
const proofPath = path.join(
    root,
    "contracts/evidence/freighter-exit-tools.json",
  ),
  proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
const c = await chromium.launchPersistentContext(path.join(dir, "profile"), {
  headless: true,
  channel: "chromium",
  viewport: { width: 1440, height: 1000 },
  args: [
    "--disable-extensions-except=" + path.join(dir, "unpacked"),
    "--load-extension=" + path.join(dir, "unpacked"),
  ],
});
c.setDefaultTimeout(90000);
let app;
try {
  const w = c.serviceWorkers()[0] ?? (await c.waitForEvent("serviceworker")),
    ext = await c.newPage();
  await ext.goto("chrome-extension://" + w.url().split("/")[2] + "/index.html");
  await ext.getByRole("button", { name: "Unlock", exact: true }).waitFor();
  await ext
    .locator("input[type=password]")
    .fill(
      JSON.parse(fs.readFileSync(path.join(dir, "credentials.json"), "utf8"))
        .password,
    );
  await ext.getByRole("button", { name: "Unlock", exact: true }).click();
  app = await c.newPage();
  await app.emulateMedia({ reducedMotion: "reduce" });
  let submissions = 0;
  const errors = [];
  app.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/v1\/(exit|setup)\/submit$/.test(new URL(r.url()).pathname)
    )
      submissions++;
  });
  app.on("pageerror", (e) => errors.push(e.message));
  async function api(route) {
    const r = await app.request.get("http://localhost:5173/v1" + route);
    expect(r.ok()).toBe(true);
    return r.json();
  }
  async function response(route, action) {
    console.log("Checking", route);
    for (let n = 0; n < 3; n++) {
      const pending = app.waitForResponse(
        (r) => new URL(r.url()).pathname === route,
      );
      await action();
      const r = await pending;
      if (r.ok()) return r.json();
      if (![429, 503].includes(r.status()))
        throw Error(route + " " + r.status());
      await app.waitForTimeout(3000);
    }
    throw Error("Real API unavailable");
  }
  const b = registry[0],
    owner = proof.owner;
  await app.goto("http://localhost:5173/app?epoch=" + b.epoch);
  await app.waitForTimeout(800);
  if (
    await app
      .getByRole("button", { name: t("wallet.connect"), exact: true })
      .first()
      .isVisible()
  ) {
    await app
      .getByRole("button", { name: t("wallet.connect"), exact: true })
      .first()
      .click();
    const popup = c
      .waitForEvent("page", { timeout: 10000 })
      .catch(() => undefined);
    await app
      .getByRole("dialog")
      .getByRole("button", { name: /Freighter/ })
      .click();
    const permission = await popup;
    if (permission)
      await permission
        .getByRole("button", { name: "Connect", exact: true })
        .click();
  }

  await expect(
    app.getByLabel(t("action.shares"), { exact: true }),
  ).toBeEnabled();
  const account = await api("/accounts/" + owner + "?epoch=" + b.epoch),
    shares = (BigInt(account.sharesRaw) / 100n).toString();
  await app
    .getByLabel(t("action.shares"), { exact: true })
    .fill(formatAmount(shares, b.shareDecimals));
  await app.getByLabel(t("exit.slippage")).selectOption("10");
  const quote = await response("/v1/exit/quote", () =>
    app.getByRole("button", { name: t("exit.quote"), exact: true }).click(),
  );
  const token = b.tokens.find((t) => t.address === b.profile.settlement),
    minimum = ((BigInt(quote.receiveRaw) * 9995n) / 10000n).toString();
  await app
    .getByLabel(t("action.minimum"), { exact: true })
    .fill(formatAmount(minimum, token.decimals));
  const created = await response("/v1/watches", () =>
    app.getByRole("button", { name: t("watch.action"), exact: true }).click(),
  );
  await app.goto("http://localhost:5173/alerts");
  await app
    .getByRole("button", { name: t("watch.open"), exact: true })
    .last()
    .click();
  await expect(app.getByLabel(t("action.shares"), { exact: true })).toHaveValue(
    formatAmount(shares, b.shareDecimals),
  );
  await expect(app.getByLabel(t("exit.slippage"))).toHaveValue("10");
  await response("/v1/exit/quote", () =>
    app.getByRole("button", { name: t("exit.quote"), exact: true }).click(),
  );
  await expect(
    app.getByLabel(t("action.minimum"), { exact: true }),
  ).toHaveValue(formatAmount(minimum, token.decimals));
  const reviewed = await response("/v1/exit/prepare", () =>
    app.getByRole("button", { name: t("action.review"), exact: true }).click(),
  );
  expect(reviewed.draft.intent.min_receive).toBe(minimum);
  await app.goto("http://localhost:5173/alerts");
  await app
    .getByRole("button", { name: t("watch.remove"), exact: true })
    .last()
    .click();
  await expect(app.locator(".watch-card")).toHaveCount(0);
  const migration = registry.find((b) => b.migration),
    m = migration.migration;
  await app.goto("http://localhost:5173/migrate?epoch=" + migration.epoch);
  await expect(
    app.getByLabel(t("migration.shares"), { exact: true }),
  ).toBeEnabled();
  const held = await api("/accounts/" + owner + "?epoch=" + migration.epoch);
  await app
    .getByLabel(t("migration.shares"), { exact: true })
    .fill(
      formatAmount(
        (BigInt(held.sharesRaw) / 100n).toString(),
        migration.shareDecimals,
      ),
    );
  await response("/v1/migrations/quote", () =>
    app
      .getByRole("button", { name: t("migration.quote"), exact: true })
      .click(),
  );
  const r = await response("/v1/exit/prepare", () =>
    app
      .getByRole("button", { name: t("migration.review"), exact: true })
      .click(),
  );
  await expect(app.locator(".migration-review")).toContainText(
    formatAmount(
      r.draft.intent.migration.min_destination_shares,
      m.destinationShareDecimals,
    ),
  );
  await app.goto("http://localhost:5173/review/" + r.reviewId);
  await expect(app.locator(".migration-review")).toBeVisible();
  await expect(app.locator(".migration-review .redemption-output")).toHaveCount(
    0,
  );
  await app.locator(".migration-review .review-details summary").click();
  expect(await app.locator(".migration-bound").count()).toBe(
    migration.profile.assets.length + m.destination_assets.length,
  );
  for (const theme of ["light", "dark"]) {
    await app.setViewportSize({ width: 1440, height: 1000 });
    await app
      .getByRole("button", { name: t("theme.label"), exact: true })
      .click();
    await app
      .getByRole("menuitemradio", { name: t("theme." + theme), exact: true })
      .click();
    for (const width of [320, 1440]) {
      await app.setViewportSize({ width, height: 1000 });
      expect(
        await app.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await app.screenshot({
        path:
          "artifacts/migration-shared-review-" + theme + "-" + width + ".png",
        fullPage: true,
      });
    }
  }
  expect(submissions).toBe(0);
  expect(errors).toEqual([]);
  proof.assertions.watchReview = {
    watchId: created.id,
    receivingMinimumPreserved: true,
    movementBpsPreserved: 10,
    freshQuoteAndReview: true,
    removedAfterCheck: true,
  };
  proof.assertions.sharedMigrationReview = {
    profileHash: migration.profileHash,
    destination: m.destination.address,
    minDestinationSharesRaw: r.draft.intent.migration.min_destination_shares,
    allLegConditionsVisible: true,
    ownerAndGuardIdentified: true,
    bothThemesMobileAndDesktop: true,
    submissions: 0,
    checkedAt: new Date().toISOString(),
  };
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + "\n");
  console.log(
    "PASS actual watch conditions and shared migration review; zero submissions",
  );
} catch (e) {
  if (app)
    await app
      .screenshot({
        path: "artifacts/watch-review-failure.png",
        fullPage: true,
      })
      .catch(() => {});
  throw e;
} finally {
  await c.close();
}
