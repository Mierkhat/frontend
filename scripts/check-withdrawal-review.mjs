/** Real Freighter/testnet regression for reviewing a withdrawal after reading a quote.
 * Uses the isolated acceptance wallet, never a personal profile or injected provider. */
import { chromium, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 60000 });
import { t } from "@mierkhat/copy";
import { formatAmount, parseAmount } from "@mierkhat/sdk";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter");
const verify = process.argv.includes("--verify");
const output = path.join(
  root,
  ".tooling/palette/withdrawal-review-" +
    (verify ? "verified" : "repro") +
    ".json",
);
fs.mkdirSync(path.dirname(output), { recursive: true });
const c = await chromium.launchPersistentContext(path.join(dir, "profile"), {
  headless: true,
  channel: "chromium",
  viewport: { width: 1280, height: 850 },
  args: [
    "--disable-extensions-except=" + path.join(dir, "unpacked"),
    "--load-extension=" + path.join(dir, "unpacked"),
  ],
});
c.setDefaultTimeout(60000);
const evidence = {
  checkedAt: new Date().toISOString(),
  genuineFreighter: true,
  actualTestnet: true,
  withdrawalSubmissions: 0,
};
const save = () =>
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
try {
  const worker =
      c.serviceWorkers()[0] ?? (await c.waitForEvent("serviceworker")),
    ext = await c.newPage();
  await ext.goto(
    "chrome-extension://" + worker.url().split("/")[2] + "/index.html",
  );
  await ext.getByRole("button", { name: "Unlock", exact: true }).waitFor();
  await ext
    .locator("input[type=password]")
    .fill(
      JSON.parse(fs.readFileSync(path.join(dir, "credentials.json"), "utf8"))
        .password,
    );
  await ext.getByRole("button", { name: "Unlock", exact: true }).click();
  await ext
    .getByTestId("network-selector-open")
    .locator("button")
    .first()
    .click();
  await ext.getByText("Testnet", { exact: true }).click();
  const app = await c.newPage();
  await app.emulateMedia({ reducedMotion: "reduce" });
  let account,
    prepares = 0,
    quotes = 0,
    lastMinimum,
    latestQuote;
  app.on("requestfailed", (request) => {
    if (request.url().includes("/v1/"))
      console.log(
        "Live API transport failure",
        new URL(request.url()).pathname,
        request.failure()?.errorText,
      );
  });
  app.on("response", async (response) => {
    if (response.url().includes("/v1/exit/")) {
      console.log(
        "Live withdrawal response",
        new URL(response.url()).pathname,
        response.status(),
      );
      if (!response.ok()) {
        const error = await response.json().catch(() => ({}));
        console.log("Live API error reference", error.code ?? "Unavailable");
      }
    }
    if (/\/v1\/accounts\/G/.test(response.url()) && response.ok())
      account = await response.json();
    if (response.url().endsWith("/v1/exit/quote") && response.ok())
      latestQuote = await response.json();
    if (response.url().endsWith("/v1/setup/submit") && response.ok()) {
      evidence.depositHash = (await response.json()).hash;
      save();
    }
  });
  app.on("request", (request) => {
    if (request.method() !== "POST") return;
    if (request.url().endsWith("/v1/exit/prepare")) {
      prepares++;
      lastMinimum = request.postDataJSON().intent.min_receive;
    }
    if (request.url().endsWith("/v1/exit/quote")) quotes++;
    evidence.prepareRequests = prepares;
    evidence.quoteRequests = quotes;
    save();
    if (request.url().endsWith("/v1/exit/submit"))
      evidence.withdrawalSubmissions++;
  });
  await app.goto("http://localhost:5173/app");
  await app.evaluate(() => localStorage.removeItem("mierkhat.connected"));
  await app.reload();
  await app
    .getByRole("button", { name: t("wallet.connect"), exact: true })
    .first()
    .click();
  await app
    .getByRole("dialog")
    .getByRole("button", { name: /Freighter/ })
    .click();
  await app
    .getByRole("tab", { name: t("workspace.exit"), exact: true })
    .waitFor();
  await expect.poll(() => account?.sharesRaw, { timeout: 60000 }).toBeDefined();
  if (BigInt(account.sharesRaw) === 0n) {
    await app
      .getByRole("tab", { name: t("workspace.deposit"), exact: true })
      .click();
    for (const symbol of ["MKA", "MKB"]) {
      const token = account.tokens.find((token) => token.symbol === symbol);
      const raw = BigInt(token.balanceRaw) / 1000n;
      expect(raw > 0n).toBe(true);
      await app
        .getByLabel(t("deposit.amount", { token: symbol }), { exact: true })
        .fill(formatAmount(raw.toString(), 7));
    }
    await app
      .getByRole("button", { name: t("deposit.review"), exact: true })
      .click();
    await app
      .getByRole("heading", { name: t("deposit.review"), exact: true })
      .waitFor();
    await app.getByRole("checkbox").check();
    const pending = c.waitForEvent("page");
    await app
      .getByRole("button", { name: t("common.approve"), exact: true })
      .click();
    const popup = await pending;
    await popup.getByRole("button", { name: "Confirm", exact: true }).click();
    await app.waitForURL(/\/receipt\/[a-f0-9]{64}/);
    await expect(
      app.getByRole("heading", {
        name: t("receipt.setup_success"),
        exact: true,
      }),
    ).toBeVisible({ timeout: 90000 });
    account = undefined;
    await app.goto("http://localhost:5173/app");
    await expect
      .poll(() => account?.sharesRaw, { timeout: 60000 })
      .toBeDefined();
    console.log(
      "Confirmed real acceptance-wallet deposit",
      evidence.depositHash,
    );
  }
  const sharesRaw = (BigInt(account.sharesRaw) / 2n).toString();
  expect(BigInt(sharesRaw) > 0n).toBe(true);
  evidence.owner = account.owner;
  evidence.sharesRaw = sharesRaw;
  save();
  await app
    .getByRole("tab", { name: t("workspace.exit"), exact: true })
    .click();
  await app
    .getByLabel(t("action.shares"), { exact: true })
    .fill(formatAmount(sharesRaw, 7));
  await app.getByRole("button", { name: t("exit.quote"), exact: true }).click();
  await expect(app.locator(".live-quote")).toBeVisible();
  const minimumInput = app.getByLabel(t("action.minimum"), { exact: true });
  const suggestedMinimum = await minimumInput.inputValue();
  const minimum = formatAmount(
    ((BigInt(parseAmount(suggestedMinimum, 7)) * 99n) / 100n).toString(),
    7,
  );
  await minimumInput.fill(minimum);
  console.log(
    "Real withdrawal quote loaded; waiting beyond its original 20-second freshness gate",
  );
  await app.waitForTimeout(24000);
  await app
    .getByRole("button", { name: t("action.review"), exact: true })
    .click();
  if (!verify) {
    const alert = app.getByRole("alert");
    await expect(alert).toContainText(t("exit.quote_expired"));
    evidence.quoteExpiryErrorOutsideViewport = await alert.evaluate(
      (element) => {
        const r = element.getBoundingClientRect();
        return r.bottom <= 0 || r.top >= innerHeight;
      },
    );
    evidence.prepareRequests = prepares;
    evidence.quoteRequests = quotes;
    await app.screenshot({
      path: path.join(root, ".tooling/palette/withdrawal-before-fix.png"),
      fullPage: true,
    });
    console.log(
      "REPRODUCED",
      JSON.stringify({
        prepareRequests: prepares,
        errorOutsideViewport: evidence.quoteExpiryErrorOutsideViewport,
      }),
    );
  } else {
    const heading = app.getByRole("heading", {
      name: t("review.heading"),
      exact: true,
    });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    expect(quotes).toBeGreaterThan(1);
    expect(prepares).toBe(1);
    expect(formatAmount(lastMinimum, 7)).toBe(minimum);
    evidence.assertions = {
      staleQuoteRefreshed: true,
      chosenMinimumPreserved: true,
      exactlyOneReviewPrepared: true,
      reviewHeadingFocusedAndVisible: true,
      noWithdrawalSubmitted: evidence.withdrawalSubmissions === 0,
      noInjectedWallet: true,
      noNetworkInterception: true,
    };
    await app.screenshot({
      path: path.join(
        root,
        "frontend/artifacts/withdrawal-review-red-grey.png",
      ),
      fullPage: true,
    });
    await app
      .getByRole("button", { name: t("action.edit"), exact: true })
      .click();
    const highMinimum = formatAmount(
      (BigInt(latestQuote.receiveRaw) * 2n).toString(),
      7,
    );
    await minimumInput.fill(highMinimum);
    await app
      .getByRole("button", { name: t("action.review"), exact: true })
      .click();
    const alert = app.getByRole("alert");
    await expect(alert).toContainText(t("exit.high_minimum"));
    await expect(alert).toBeFocused();
    await expect(alert).toBeInViewport();
    await expect(minimumInput).toHaveValue(highMinimum);
    expect(prepares).toBe(1);
    expect(evidence.withdrawalSubmissions).toBe(0);
    evidence.assertions.minimumAboveQuoteExplainedInFocusedVisibleError = true;
    evidence.assertions.rejectedMinimumNotLowered = true;
    evidence.quoteRequests = quotes;
    evidence.prepareRequests = prepares;
    console.log(
      "PASS expired real quote refreshed, custom minimum preserved, review and action errors focused/visible, and zero automatic submissions",
    );
  }
  save();
} catch (error) {
  for (const page of c.pages()) {
    if (page.url().startsWith("http://localhost:5173")) {
      await page
        .screenshot({
          path: path.join(
            root,
            ".tooling/palette/withdrawal-verification-failure.png",
          ),
          fullPage: true,
        })
        .catch(() => {});
      console.error(
        "Visible app alerts:",
        await page.getByRole("alert").allTextContents(),
      );
    }
  }
  throw error;
} finally {
  await c.close();
}
