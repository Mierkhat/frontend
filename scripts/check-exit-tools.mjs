/** Genuine official Freighter, persistent API/PostgreSQL and public Stellar testnet.
 * No injected wallet, intercepted network response or fabricated holding. */
import { chromium, expect as baseExpect } from "@playwright/test";
import { t } from "@mierkhat/copy";
import { formatAmount, decodeEnvelope, hex } from "@mierkhat/sdk";
import fs from "node:fs";
import path from "node:path";
const expect = baseExpect.configure({ timeout: 90000 });
const root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter");
const registry = JSON.parse(fs.readFileSync("src/deployments.json", "utf8"));
const evidencePath = path.join(
  root,
  "contracts/evidence/freighter-exit-tools.json",
);
let evidence;
try {
  evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
} catch {
  evidence = {
    startedAt: new Date().toISOString(),
    network: registry[0].networkPassphrase,
    wallet: "Official Freighter 5.49.0",
    operations: {},
    assertions: {},
  };
}
const save = () =>
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
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
context.setDefaultTimeout(90000);
let page;
try {
  const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker")),
    ext = await context.newPage();
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
  page = await context.newPage();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let owner, lastReview;
  page.on("response", async (r) => {
    const u = new URL(r.url());
    if (!r.ok()) return;
    if (/^\/v1\/accounts\/G[A-Z2-7]{55}$/.test(u.pathname)) {
      owner = (await r.json()).owner;
    }
    if (u.pathname === "/v1/exit/prepare") lastReview = await r.json();
  });
  async function api(route) {
    const r = await page.request.get("http://localhost:5173/v1" + route);
    expect(r.ok()).toBe(true);
    return r.json();
  }
  async function open(url) {
    await page.goto("http://localhost:5173" + url);
    await page.waitForTimeout(500);
  }
  async function response(pathname, action) {
    for (let n = 0; n < 3; n++) {
      const pending = page.waitForResponse(
        (r) => new URL(r.url()).pathname === pathname,
        { timeout: 90000 },
      );
      await action();
      const r = await pending;
      if (r.ok()) return r.json();
      const error = await r.json().catch(() => ({}));
      if (![429, 503].includes(r.status()) && error.code !== "ReadUnavailable")
        throw Error(
          pathname + " rejected " + r.status() + " " + JSON.stringify(error),
        );
      await page.waitForTimeout(4000);
    }
    throw Error("Live request unavailable " + pathname);
  }
  async function previous(label) {
    const prior = evidence.operations[label];
    if (!prior || prior.stage === "before_signature") return false;
    const observation = await api(
      "/transactions/" + prior.hash + "?environment=testnet",
    );
    expect(
      observation.state,
      "Resolve the original signed hash before any replacement",
    ).toBe("succeeded");
    expect(observation.receipt).toBeDefined();
    prior.observation = observation;
    prior.stage = "confirmed";
    save();
    return true;
  }
  async function approve(label, b, review, before, migration = false) {
    const hash = hex(
      decodeEnvelope(review.transactionXdr, b.networkPassphrase).hash(),
    );
    evidence.operations[label] = {
      hash,
      epoch: b.epoch,
      profileHash: b.profileHash,
      before,
      stage: "before_signature",
    };
    save();
    await page.getByRole("checkbox").check();
    const pending = context.waitForEvent("page");
    evidence.operations[label].stage = "signature_requested";
    save();
    await page
      .getByRole("button", {
        name: t(migration ? "migration.sign" : "action.sign"),
        exact: true,
      })
      .click();
    const popup = await pending;
    await popup.getByRole("button", { name: "Confirm", exact: true }).click();
    await page.waitForURL(new RegExp("/receipt/" + hash + "$"));
    await expect(
      page.getByRole("heading", {
        name: t("receipt.setup_success"),
        exact: true,
      }),
    ).toBeVisible();
    const observation = await api(
      "/transactions/" + hash + "?environment=testnet",
    );
    expect(observation.state).toBe("succeeded");
    expect(observation.receipt).toBeDefined();
    evidence.operations[label] = {
      ...evidence.operations[label],
      stage: "confirmed",
      observation,
    };
    save();
    console.log("Confirmed", label, hash);
    return observation;
  }
  await open("/app");
  if (
    await page
      .getByRole("button", { name: t("wallet.connect"), exact: true })
      .first()
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: t("wallet.connect"), exact: true })
      .first()
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Freighter/ })
      .click();
  }
  await expect.poll(() => owner).toMatch(/^G[A-Z2-7]{55}$/);
  evidence.owner = owner;
  save();
  const b = registry[0];
  await open("/withdrawals");
  await page.getByLabel(t("readiness.address")).fill(owner);
  const readiness = await response("/v1/withdrawals/readiness", () =>
    page
      .getByRole("button", { name: t("readiness.check"), exact: true })
      .first()
      .click(),
  );
  expect(readiness.status).toBe("full");
  expect(BigInt(readiness.testedSharesRaw)).toBeGreaterThan(0n);
  evidence.assertions.readiness = {
    ledger: readiness.observedLedger,
    fullFlow: true,
    holdingsRaw: readiness.holdingsRaw,
    testedSharesRaw: readiness.testedSharesRaw,
    estimatedReceiveRaw: readiness.estimatedReceiveRaw,
  };
  save();
  await expect(
    page.getByText(t("readiness.full"), { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/withdrawal-readiness.png",
    fullPage: true,
  });
  if (!(await previous("target_withdrawal"))) {
    await open("/app?epoch=" + b.epoch);
    await page.getByLabel(t("plan.mode")).selectOption("target");
    const target = (BigInt(readiness.estimatedReceiveRaw) / 100n).toString();
    const token = b.tokens.find((t) => t.address === b.profile.settlement);
    await page
      .getByLabel(t("plan.target"), { exact: true })
      .fill(formatAmount(target, token.decimals));
    const plan = await response("/v1/withdrawals/plan", () =>
      page.getByRole("button", { name: t("plan.action"), exact: true }).click(),
    );
    expect(plan.draft.intent.min_receive).toBe(target);
    expect(BigInt(plan.review.expectedReceiveRaw)).toBeGreaterThanOrEqual(
      BigInt(target),
    );
    await expect(page.locator(".live-quote")).toBeVisible();
    await response("/v1/exit/prepare", () =>
      page
        .getByRole("button", { name: t("action.review"), exact: true })
        .click(),
    );
    const before = await api("/accounts/" + owner + "?epoch=" + b.epoch);
    const observation = await approve(
      "target_withdrawal",
      b,
      lastReview,
      before,
    );
    const after = await api("/accounts/" + owner + "?epoch=" + b.epoch);
    expect(BigInt(before.sharesRaw) - BigInt(after.sharesRaw)).toBe(
      BigInt(observation.receipt.sharesSpent),
    );
    for (const token of before.tokens) {
      const delta =
        BigInt(
          after.tokens.find((t) => t.address === token.address).balanceRaw,
        ) - BigInt(token.balanceRaw);
      expect(delta).toBe(
        token.address === b.profile.settlement
          ? BigInt(observation.receipt.received)
          : 0n,
      );
    }
    expect(BigInt(observation.receipt.received)).toBeGreaterThanOrEqual(
      BigInt(target),
    );
    evidence.operations.target_withdrawal.verified = {
      exactShares: true,
      minimumTarget: target,
      actualOutput: observation.receipt.received,
      otherTokensUnchanged: true,
    };
    save();
  }
  for (const b of registry.filter((b) => b.migration)) {
    const label = b.epoch;
    if (await previous(label)) continue;
    await open("/migrate?epoch=" + b.epoch);
    await expect(
      page.getByLabel(t("migration.shares"), { exact: true }),
    ).toBeEnabled();
    const before = await api("/accounts/" + owner + "?epoch=" + b.epoch),
      destinationRoute = registry.find(
        (r) =>
          !r.migration &&
          r.profile.vault.address === b.migration.destination.address,
      ),
      destinationBefore = await api(
        "/accounts/" + owner + "?epoch=" + destinationRoute.epoch,
      );
    const shares = (BigInt(before.sharesRaw) / 100n).toString();
    expect(BigInt(shares)).toBeGreaterThan(0n);
    await page
      .getByLabel(t("migration.shares"), { exact: true })
      .fill(formatAmount(shares, b.shareDecimals));
    const quote = await response("/v1/migrations/quote", () =>
      page
        .getByRole("button", { name: t("migration.quote"), exact: true })
        .click(),
    );
    expect(BigInt(quote.destinationSharesRaw)).toBeGreaterThan(0n);
    for (const theme of ["light", "dark"]) {
      await page
        .getByRole("button", { name: t("theme.label"), exact: true })
        .click();
      await page
        .getByRole("menuitemradio", { name: t("theme." + theme), exact: true })
        .click();
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.getByLabel(t("migration.shares"), { exact: true }).click();
        const focused = await page
          .getByLabel(t("migration.shares"), { exact: true })
          .evaluate((e) => {
            const inner = getComputedStyle(e),
              outer = getComputedStyle(e.parentElement);
            return {
              inner: inner.outlineWidth,
              outer: outer.outlineWidth,
              offset: outer.outlineOffset,
              shadow: outer.boxShadow,
            };
          });
        expect(focused).toEqual({
          inner: "0px",
          outer: "2px",
          offset: "-2px",
          shadow: "none",
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: "artifacts/" + label + "-" + theme + "-" + width + ".png",
          fullPage: true,
        });
      }
    }
    await page.getByLabel(t("migration.minimum"), { exact: true }).fill(".");
    await expect(
      page.getByRole("heading", { name: t("migration.heading"), exact: true }),
    ).toBeVisible();
    await page
      .getByLabel(t("migration.minimum"), { exact: true })
      .fill(
        formatAmount(
          quote.draft.intent.migration.min_destination_shares,
          b.migration.destinationShareDecimals,
        ),
      );
    await response("/v1/exit/prepare", () =>
      page
        .getByRole("button", { name: t("migration.review"), exact: true })
        .click(),
    );
    const observation = await approve(
        label,
        b,
        lastReview,
        { source: before, destination: destinationBefore },
        true,
      ),
      receipt = observation.receipt;
    expect(receipt.migration.destination).toBe(b.migration.destination.address);
    const after = await api("/accounts/" + owner + "?epoch=" + b.epoch),
      destinationAfter = await api(
        "/accounts/" + owner + "?epoch=" + destinationRoute.epoch,
      );
    expect(BigInt(before.sharesRaw) - BigInt(after.sharesRaw)).toBe(
      BigInt(shares),
    );
    expect(BigInt(after.sharesRaw)).toBeGreaterThan(0n);
    expect(
      BigInt(destinationAfter.sharesRaw) - BigInt(destinationBefore.sharesRaw),
    ).toBe(BigInt(receipt.migration.destinationShares));
    for (const token of before.tokens) {
      const delta =
          BigInt(
            after.tokens.find((t) => t.address === token.address).balanceRaw,
          ) - BigInt(token.balanceRaw),
        index = receipt.migration.refundAssets.indexOf(token.address);
      expect(delta).toBe(
        index < 0 ? 0n : BigInt(receipt.migration.refunds[index]),
      );
    }
    await expect(page.locator(".receipt-outcome")).toContainText(
      t("migration.received"),
    );
    await page.reload();
    await expect(page.locator(".receipt-outcome")).toContainText(
      t("migration.received"),
    );
    evidence.operations[label].verified = {
      exactSourceShareSpend: true,
      sourceRemainderPreserved: true,
      destinationDeltaMatchesReceipt: true,
      allTokenDeltasEqualRefunds: true,
      receiptPersistsOnReload: true,
      focusAndResponsiveBothThemes: true,
    };
    save();
  }
  // A fresh watch is evaluated by the real background worker; no synthetic observations.
  await open("/migrate?epoch=" + registry.find((b) => b.migration).epoch);
  const watchBundle = registry.find((b) => b.migration),
    account = await api("/accounts/" + owner + "?epoch=" + watchBundle.epoch);
  await page
    .getByLabel(t("migration.shares"), { exact: true })
    .fill(
      formatAmount(
        (BigInt(account.sharesRaw) / 100n).toString(),
        watchBundle.shareDecimals,
      ),
    );
  await response("/v1/migrations/quote", () =>
    page
      .getByRole("button", { name: t("migration.quote"), exact: true })
      .click(),
  );
  await response("/v1/watches", () =>
    page.getByRole("button", { name: t("watch.action"), exact: true }).click(),
  );
  await open("/alerts");
  await expect(
    page.getByText(t("watch.met"), { exact: true }).first(),
  ).toBeVisible({ timeout: 90000 });
  await page.reload();
  await expect(
    page.getByText(t("watch.met"), { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "artifacts/withdrawal-alerts.png",
    fullPage: true,
  });
  const update = page.locator(".watch-update");
  expect(await update.count()).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: t("watch.seen"), exact: true })
    .first()
    .click();
  evidence.assertions.watch = {
    realBackgroundPreflight: true,
    inAppNotification: true,
    persistsOnReload: true,
    markRead: true,
  };
  expect(errors).toEqual([]);
  evidence.completedAt = new Date().toISOString();
  save();
  console.log(
    "PASS genuine Freighter exit tools",
    Object.keys(evidence.operations).length,
    "signed actions",
  );
} catch (error) {
  if (page)
    await page
      .screenshot({ path: "artifacts/exit-tools-failure.png", fullPage: true })
      .catch(() => {});
  save();
  throw error;
} finally {
  await context.close();
}
