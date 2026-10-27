/** Genuine Freighter acceptance for distinct live vault positions and all outputs.
 * No injected wallet, intercepted response or generated balance. Submits testnet transactions. */
import { chromium, expect as baseExpect } from "@playwright/test";
import { t } from "@mierkhat/copy";
import { decodeEnvelope, formatAmount, hex } from "@mierkhat/sdk";
import fs from "node:fs";
import path from "node:path";
const expect = baseExpect.configure({ timeout: 90000 });
const root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter");
const registry = JSON.parse(fs.readFileSync("src/deployments.json", "utf8"));
const evidencePath = path.join(
  root,
  "contracts/evidence/freighter-position-routes.json",
);
let evidence;
try {
  evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
} catch {
  evidence = {
    startedAt: new Date().toISOString(),
    wallet: "Freighter 5.49.0",
    network: registry[0].networkPassphrase,
    operations: {},
    assertions: {},
  };
}
const save = () =>
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
const c = await chromium.launchPersistentContext(path.join(dir, "profile"), {
  headless: true,
  channel: "chromium",
  viewport: { width: 1280, height: 950 },
  args: [
    "--disable-extensions-except=" + path.join(dir, "unpacked"),
    "--load-extension=" + path.join(dir, "unpacked"),
  ],
});
c.setDefaultTimeout(90000);
let app;
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
  app = await c.newPage();
  await app.emulateMedia({ reducedMotion: "reduce" });
  const accounts = new Map();
  let lastReview, setupReview;
  app.on("response", async (response) => {
    const url = new URL(response.url());
    if (!response.ok()) {
      if (url.pathname.startsWith("/v1/"))
        console.log("Live API response", url.pathname, response.status());
      return;
    }
    if (/^\/v1\/accounts\/G[A-Z2-7]{55}$/.test(url.pathname)) {
      const account = await response.json();
      accounts.set(url.searchParams.get("epoch") ?? registry[0].epoch, account);
      evidence.owner = account.owner;
    }
    if (url.pathname === "/v1/exit/prepare") lastReview = await response.json();
    if (url.pathname === "/v1/setup/prepare")
      setupReview = await response.json();
  });
  async function api(route) {
    const response = await app.request.get("http://localhost:5173/v1" + route);
    expect(response.ok()).toBe(true);
    return response.json();
  }
  async function open() {
    await app.goto("http://localhost:5173/app");
    // Existing public recovery pointers take precedence over constructing a new action.
    await app.waitForTimeout(800);
    if (app.url().includes("/receipt/")) {
      await expect(
        app.getByRole("heading", {
          name: t("receipt.setup_success"),
          exact: true,
        }),
      ).toBeVisible();
      await app.goto("http://localhost:5173/app");
    }
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
      app.getByRole("tab", { name: t("workspace.exit"), exact: true }),
    ).toBeVisible();
    await expect(
      app.getByLabel(t("positions.vault"), { exact: true }),
    ).toBeEnabled();
  }
  async function quote() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const pending = app.waitForResponse(
        (r) => new URL(r.url()).pathname === "/v1/exit/quote",
      );
      await app
        .getByRole("button", { name: t("exit.quote"), exact: true })
        .click();
      const response = await pending;
      if (response.ok()) {
        await expect(app.locator(".live-quote")).toBeVisible();
        return;
      }
      if (![429, 503].includes(response.status()) || attempt === 2)
        throw Error("Actual quote failed: HTTP " + response.status());
      await app.waitForTimeout(5000);
    }
  }
  async function prepareReview() {
    for (let attempt = 0; attempt < 3; attempt++) {
      const pending = app.waitForResponse(
        (r) => new URL(r.url()).pathname === "/v1/exit/prepare",
      );
      await app
        .getByRole("button", { name: t("action.review"), exact: true })
        .click();
      const response = await pending;
      if (response.ok()) {
        const review = await response.json();
        await expect(
          app.getByRole("heading", { name: t("review.heading"), exact: true }),
        ).toBeFocused();
        return review;
      }
      if (![429, 503].includes(response.status()) || attempt === 2)
        throw Error("Actual preparation failed: HTTP " + response.status());
      await app.waitForTimeout(5000);
      await quote();
    }
  }
  async function approve(label, bundle, review, setup = false, balanceBefore) {
    const hash = hex(
      decodeEnvelope(review.transactionXdr, bundle.networkPassphrase).hash(),
    );
    evidence.operations[label] = {
      hash,
      epoch: bundle.epoch,
      profileHash: bundle.profileHash,
      stage: "before_signature",
      balanceBefore,
    };
    save();
    await app.getByRole("checkbox").check();
    const pending = c.waitForEvent("page");
    evidence.operations[label].stage = "signature_requested";
    save();
    await app
      .getByRole("button", {
        name: t(setup ? "common.approve" : "action.sign"),
        exact: true,
      })
      .click();
    const popup = await pending;
    await popup.getByRole("button", { name: "Confirm", exact: true }).click();
    await app.waitForURL(new RegExp("/receipt/" + hash + "$"));
    await expect(
      app.getByRole("heading", {
        name: t("receipt.setup_success"),
        exact: true,
      }),
    ).toBeVisible();
    const observation = await api(
      "/transactions/" + hash + "?environment=testnet",
    );
    expect(observation.state).toBe("succeeded");
    evidence.operations[label] = {
      ...evidence.operations[label],
      stage: "confirmed",
      observation,
    };
    save();
    console.log("Confirmed", label, hash);
    return observation;
  }
  async function previous(label) {
    const prior = evidence.operations[label];
    if (!prior) return false;
    if (prior.stage === "before_signature") return false;
    const observation = await api(
      "/transactions/" + prior.hash + "?environment=testnet",
    );
    expect(
      observation.state,
      "Resolve the original hash before constructing any replacement",
    ).toBe("succeeded");
    evidence.operations[label] = { ...prior, stage: "confirmed", observation };
    save();
    console.log("Reused confirmed transaction", label, prior.hash);
    return true;
  }
  await open();
  await expect.poll(() => evidence.owner).toMatch(/^G[A-Z2-7]{55}$/);
  const second = registry.find((b) => b.epoch === "positions-mkout-mkout-v1");
  if (!(await previous("deposit_second_vault"))) {
    await app
      .getByRole("tab", { name: t("workspace.deposit"), exact: true })
      .click();
    await app
      .getByLabel(t("positions.vault"), { exact: true })
      .selectOption(second.profile.vault.address);
    await expect(
      app.getByLabel(t("positions.output"), { exact: true }),
    ).toHaveValue(second.epoch);
    await expect.poll(() => accounts.get(second.epoch)?.tokens).toBeDefined();
    const token = accounts
      .get(second.epoch)
      .tokens.find((t) => t.address === second.profile.settlement);
    const raw = BigInt(token.balanceRaw) / 1000n;
    expect(raw > 0n).toBe(true);
    await app
      .getByLabel(t("deposit.amount", { token: "MKOUT" }), { exact: true })
      .fill(formatAmount(raw.toString(), 7));
    await app
      .getByRole("button", { name: t("deposit.review"), exact: true })
      .click();
    await expect(
      app.getByRole("heading", { name: t("deposit.review"), exact: true }),
    ).toBeVisible();
    await approve("deposit_second_vault", second, setupReview, true);
  }
  await open();
  const positions = await api("/accounts/" + evidence.owner + "/positions");
  expect(positions.positions).toHaveLength(2);
  expect(new Set(positions.positions.map((p) => p.vault)).size).toBe(2);
  for (const p of positions.positions) expect(p.routeEpochs).toHaveLength(3);
  evidence.assertions.onePositionPerVaultDespiteThreeOutputs = true;
  save();
  for (const bundle of registry) {
    let label = bundle.epoch;
    if (
      evidence.operations[label]?.stage === "confirmed" &&
      !evidence.operations[label].verified
    ) {
      await previous(label);
      expect(evidence.operations[label].observation.receipt?.profileHash).toBe(
        bundle.profileHash,
      );
      label += "-receipt-regression";
    }
    if (await previous(label)) continue;
    await open();
    await app
      .getByLabel(t("positions.vault"), { exact: true })
      .selectOption(bundle.profile.vault.address);
    await app.getByLabel(t("positions.output"), { exact: true }).focus();
    await app
      .getByLabel(t("positions.output"), { exact: true })
      .selectOption(bundle.epoch);
    await expect(
      app.getByLabel(t("positions.output"), { exact: true }),
    ).toBeFocused();
    const before = await api(
      "/accounts/" + evidence.owner + "?epoch=" + bundle.epoch,
    );
    const raw = (BigInt(before.sharesRaw) / 20n).toString();
    expect(BigInt(raw) > 0n).toBe(true);
    await app
      .getByLabel(t("action.shares"), { exact: true })
      .fill(formatAmount(raw, bundle.shareDecimals));
    await quote();
    lastReview = await prepareReview();
    expect(lastReview.draft.epoch).toBe(bundle.epoch);
    expect(lastReview.profileHash).toBe(bundle.profileHash);
    // Changing the output must destroy this review and quote, before any approval.
    const other = registry.find(
      (b) =>
        b.profile.vault.address === bundle.profile.vault.address &&
        b.epoch !== bundle.epoch,
    );
    await app
      .getByLabel(t("positions.output"), { exact: true })
      .selectOption(other.epoch);
    await expect(app.locator(".review-panel")).toHaveCount(0);
    await expect(app.locator(".live-quote")).toHaveCount(0);
    await app
      .getByLabel(t("positions.output"), { exact: true })
      .selectOption(bundle.epoch);
    await app
      .getByLabel(t("action.shares"), { exact: true })
      .fill(formatAmount(raw, bundle.shareDecimals));
    await quote();
    lastReview = await prepareReview();
    const observation = await approve(label, bundle, lastReview, false, before);
    expect(observation.receipt.profileHash).toBe(bundle.profileHash);
    expect(observation.receipt.sharesSpent).toBe(raw);
    const output = bundle.tokens.find(
      (t) => t.address === bundle.profile.settlement,
    );
    await expect(app.locator(".receipt-outcome")).toContainText(output.symbol);
    const after = await api(
      "/accounts/" + evidence.owner + "?epoch=" + bundle.epoch,
    );
    expect(BigInt(before.sharesRaw) - BigInt(after.sharesRaw)).toBe(
      BigInt(raw),
    );
    for (const token of before.tokens) {
      const delta =
        BigInt(
          after.tokens.find((t) => t.address === token.address).balanceRaw,
        ) - BigInt(token.balanceRaw);
      expect(delta).toBe(
        token.address === output.address
          ? BigInt(observation.receipt.received)
          : 0n,
      );
    }
    evidence.operations[label].verified = {
      exactSharesSpent: true,
      receiptMatchesSelectedProfile: true,
      selectedTokenDeltaMatchesReceipt: true,
      otherExistingTokensUnchanged: true,
      receiptUsesSelectedToken: true,
    };
    save();
  }
  await open();
  await app
    .getByLabel(t("positions.vault"), { exact: true })
    .selectOption(second.profile.vault.address);
  await app
    .getByLabel(t("positions.output"), { exact: true })
    .selectOption(second.epoch);
  const directAccount = await api(
    "/accounts/" + evidence.owner + "?epoch=" + second.epoch,
  );
  await app
    .getByLabel(t("action.shares"), { exact: true })
    .fill(
      formatAmount(
        (BigInt(directAccount.sharesRaw) / 100n).toString(),
        second.shareDecimals,
      ),
    );
  await quote();
  await expect(app.locator(".quote-route")).toContainText(
    t("exit.direct_output", { token: "MKOUT" }),
  );
  await prepareReview();
  await app.locator(".review-panel details").first().locator("summary").click();
  await expect(app.locator(".review-panel")).toContainText(t("review.no_swap"));
  evidence.assertions.directRedemptionIsExplicitlyLabelledWithoutASwap = true;
  const capturedRoute = registry.find(
    (b) => b.epoch === "positions-mkout-mkb-v1",
  );
  await app
    .getByLabel(t("positions.output"), { exact: true })
    .selectOption(capturedRoute.epoch);
  const captureAccount = await api(
    "/accounts/" + evidence.owner + "?epoch=" + capturedRoute.epoch,
  );
  await expect(app.locator(".share-balance")).toHaveText(
    formatAmount(captureAccount.sharesRaw, capturedRoute.shareDecimals),
  );
  for (const theme of ["light", "dark"]) {
    await app.setViewportSize({ width: 1440, height: 1000 });
    await app
      .getByRole("button", { name: t("theme.label"), exact: true })
      .click();
    await app
      .getByRole("menuitemradio", { name: t("theme." + theme), exact: true })
      .click();
    for (const width of [320, 768, 1440]) {
      await app.setViewportSize({ width, height: 1000 });
      await expect(
        app.getByLabel(t("positions.vault"), { exact: true }),
      ).toHaveValue(second.profile.vault.address);
      const ratios = await app
        .locator(".vault-selectors select")
        .evaluateAll((selects) => {
          const lum = (rgb) =>
            rgb
              .match(/[0-9.]+/g)
              .slice(0, 3)
              .map(Number)
              .map((v) =>
                v / 255 <= 0.04045
                  ? v / 255 / 12.92
                  : ((v / 255 + 0.055) / 1.055) ** 2.4,
              )
              .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
          return selects.map((select) => {
            const s = getComputedStyle(select),
              a = lum(s.color),
              b = lum(s.backgroundColor);
            return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          });
        });
      for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(
        await app.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await app.screenshot({
        path: path.join(
          root,
          "frontend/artifacts/positions-" + width + "-" + theme + ".png",
        ),
        fullPage: true,
      });
    }
  }
  evidence.assertions.selectorsReadableAndFitSixThemeWidthCombinations = true;
  for (const b of registry)
    expect(
      Object.values(evidence.operations).some(
        (operation) => operation.epoch === b.epoch && operation.verified,
      ),
    ).toBe(true);
  evidence.assertions.allSixRealRoutesConfirmed = true;
  evidence.assertions.outputChangeInvalidatesReviewAndQuote = true;
  evidence.assertions.noInjectedWalletOrNetworkInterception = true;
  evidence.completedAt = new Date().toISOString();
  save();
  console.log(
    "PASS both actual vault positions and all three output tokens, actual Freighter approvals and exact receipt/balance checks",
  );
} catch (error) {
  if (app) {
    console.error(
      "Visible app alerts:",
      await app.getByRole("alert").allTextContents(),
    );
    await app
      .screenshot({
        path: path.join(root, ".tooling/freighter/position-routes-failure.png"),
        fullPage: true,
      })
      .catch(() => {});
  }
  throw error;
} finally {
  await c.close();
}
