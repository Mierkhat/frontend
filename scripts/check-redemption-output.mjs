/** Inspect real unsigned quotes/reviews in official Freighter, without submitting funds. */
import { chromium, expect as baseExpect } from "@playwright/test";
import { t } from "@mierkhat/copy";
import { formatAmount } from "@mierkhat/sdk";
import fs from "node:fs";
import path from "node:path";
const expect = baseExpect.configure({ timeout: 60000 });
const root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter");
const registry = JSON.parse(fs.readFileSync("src/deployments.json", "utf8")).filter(b=>!b.migration);
const original = registry[0];
const routes = registry.filter(
  (route) => route.profile.vault.address === original.profile.vault.address,
);
const evidence = {
  checkedAt: new Date().toISOString(),
  network: original.networkPassphrase,
  genuineFreighter: true,
  submissions: 0,
  routes: [],
};
const output = "artifacts/redemption-output-check.json";
const save = () =>
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
const context = await chromium.launchPersistentContext(
  path.join(dir, "profile"),
  {
    headless: true,
    channel: "chromium",
    viewport: { width: 1440, height: 1000 },
    args: [
      "--disable-extensions-except=" + path.join(dir, "unpacked"),
      "--load-extension=" + path.join(dir, "unpacked"),
    ],
  },
);
context.setDefaultTimeout(60000);
let app;
try {
  const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker")),
    extension = await context.newPage();
  await extension.goto(
    "chrome-extension://" + worker.url().split("/")[2] + "/index.html",
  );
  await extension
    .getByRole("button", { name: "Unlock", exact: true })
    .waitFor();
  await extension
    .locator("input[type=password]")
    .fill(
      JSON.parse(fs.readFileSync(path.join(dir, "credentials.json"), "utf8"))
        .password,
    );
  await extension.getByRole("button", { name: "Unlock", exact: true }).click();
  await extension
    .getByTestId("network-selector-open")
    .locator("button")
    .first()
    .click();
  await extension.getByText("Testnet", { exact: true }).click();
  app = await context.newPage();
  await app.emulateMedia({ reducedMotion: "reduce" });
  let owner;
  app.on("response", async (response) => {
    if (
      /^\/v1\/accounts\/G[A-Z2-7]{55}$/.test(
        new URL(response.url()).pathname,
      ) &&
      response.ok()
    )
      owner = (await response.json()).owner;
  });
  app.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/submit")
    )
      evidence.submissions++;
  });
  await app.goto("http://localhost:5173/app");
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
    await app
      .getByRole("dialog")
      .getByRole("button", { name: /Freighter/ })
      .click();
  }
  await expect(
    app.getByLabel(t("positions.vault"), { exact: true }),
  ).toBeEnabled();
  await expect.poll(() => owner).toMatch(/^G[A-Z2-7]{55}$/);
  evidence.owner = owner;
  await app
    .getByLabel(t("positions.vault"), { exact: true })
    .selectOption(original.profile.vault.address);
  async function requestReview() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const pending = app.waitForResponse(
        (response) => new URL(response.url()).pathname === "/v1/exit/prepare",
      );
      await app
        .getByRole("button", { name: t("action.review"), exact: true })
        .click();
      const response = await pending;
      if (response.ok()) return response.json();
      if (![429, 503].includes(response.status()) || attempt === 2)
        throw Error("Actual preparation failed: " + response.status());
      await app.waitForTimeout(5000);
    }
  }
  for (const route of routes) {
    const target = route.tokens.find(
      (token) => token.address === route.profile.settlement,
    );
    await app.setViewportSize({ width: 1440, height: 1000 });
    await app
      .getByRole("button", { name: t("theme.label"), exact: true })
      .click();
    await app
      .getByRole("menuitemradio", { name: t("theme.light"), exact: true })
      .click();
    await app
      .getByLabel(t("positions.output"), { exact: true })
      .selectOption(route.epoch);
    const response = await app.request.get(
      "http://localhost:5173/v1/accounts/" + owner + "?epoch=" + route.epoch,
    );
    expect(response.ok()).toBe(true);
    const account = await response.json(),
      shares = (BigInt(account.sharesRaw) / 100n).toString();
    expect(BigInt(shares) > 0n).toBe(true);
    await app
      .getByLabel(t("action.shares"), { exact: true })
      .fill(formatAmount(shares, route.shareDecimals));
    for (let attempt = 0; attempt < 3; attempt++) {
      const pending = app.waitForResponse(
        (response) => new URL(response.url()).pathname === "/v1/exit/quote",
      );
      await app
        .getByRole("button", { name: t("exit.quote"), exact: true })
        .click();
      const quoted = await pending;
      if (quoted.ok()) break;
      if (![429, 503].includes(quoted.status()) || attempt === 2)
        throw Error("Actual quote failed: " + quoted.status());
      await app.waitForTimeout(5000);
    }
    const quote = app.locator(".live-quote"),
      quoteDetails = quote.locator(".internal-quote-details");
    await expect(quote.locator(".redemption-output strong")).toHaveText(
      target.symbol,
    );
    await expect(quote.locator(".redemption-output")).toContainText(
      t("redemption.only_output", { token: target.symbol }),
    );
    await expect(quote.locator(".quote-total")).toContainText(
      t("redemption.estimated_wallet", { token: target.symbol }),
    );
    await expect(quoteDetails).not.toHaveAttribute("open", "");
    await expect(quote.locator(".quote-route").first()).not.toBeVisible();
    await app.screenshot({
      path:
        "artifacts/redemption-quote-" + target.symbol.toLowerCase() + ".png",
      fullPage: true,
    });
    await quoteDetails.locator("summary").click();
    await expect(quoteDetails).toContainText(
      t("redemption.internal_note", { token: target.symbol }),
    );
    await expect(quote.locator(".quote-route")).toHaveCount(2);
    await quoteDetails.locator("summary").click();
    const review = await requestReview();
    expect(review.draft.epoch).toBe(route.epoch);
    expect(review.profileHash).toBe(route.profileHash);
    expect(review.profile.settlement).toBe(target.address);
    expect(review.draft.intent.min_withdraw).toHaveLength(2);
    expect(review.draft.intent.min_swap).toHaveLength(2);
    const panel = app.locator(".review-panel"),
      details = panel.locator("details").first();
    await expect(panel.locator(".redemption-output strong")).toHaveText(
      target.symbol,
    );
    await expect(panel.locator(".minimum-result small")).toHaveText(
      target.symbol,
    );
    await expect(panel.locator(".minimum-result strong")).toContainText(
      formatAmount(review.draft.intent.min_receive, target.decimals),
    );
    await expect(details).not.toHaveAttribute("open", "");
    await details.locator("summary").click();
    await expect(details).toContainText(
      t("redemption.internal_note", { token: target.symbol }),
    );
    for (const underlying of route.profile.assets) {
      const symbol = route.tokens.find(
        (token) => token.address === underlying.asset,
      ).symbol;
      await expect(
        details.getByRole("heading", {
          name:
            underlying.asset === target.address
              ? t("redemption.direct_leg", { token: target.symbol })
              : t("redemption.swap_leg", { from: symbol, to: target.symbol }),
          exact: true,
        }),
      ).toBeVisible();
    }
    await details.locator("summary").click();
    for (const [theme, width] of [
      ["light", 1440],
      ["dark", 320],
    ]) {
      await app
        .getByRole("button", { name: t("theme.label"), exact: true })
        .click();
      await app
        .getByRole("menuitemradio", { name: t("theme." + theme), exact: true })
        .click();
      await app.setViewportSize({ width, height: 1000 });
      expect(
        await app.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(panel.locator(".redemption-output strong")).toHaveText(
        target.symbol,
      );
      await app.screenshot({
        path:
          "artifacts/redemption-review-" +
          target.symbol.toLowerCase() +
          "-" +
          theme +
          ".png",
        fullPage: true,
      });
    }
    evidence.routes.push({
      epoch: route.epoch,
      profileHash: review.profileHash,
      selectedToken: target.symbol,
      selectedTokenAddress: target.address,
      sharesRaw: review.draft.intent.shares,
      minimumRaw: review.draft.intent.min_receive,
      ledger: review.preparedLedger,
      assertions: {
        quoteAndReviewShowOnlySelectedWalletOutput: true,
        internalLegsExplicitAndCollapsedInitially: true,
        finalMinimumUsesSelectedToken: true,
        bothLegConditionsRetained: true,
        fitsMobileAndDesktop: true,
      },
    });
    save();
    console.log(
      "PASS actual unsigned " +
        target.symbol +
        " quote/review; internal MKA/MKB legs preserved; no submission",
    );
    await app.setViewportSize({ width: 1440, height: 1000 });
  }
  expect(evidence.submissions).toBe(0);
  save();
} catch (error) {
  if (app)
    console.error(
      "Visible alerts:",
      await app.getByRole("alert").allTextContents(),
    );
  throw error;
} finally {
  await context.close();
}
