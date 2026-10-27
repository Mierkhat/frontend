/** Actual Freighter account change during an unresolved signing request.
 * No injected provider, intercepted RPC, or user browser profile. */
import { chromium, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 60000 });
import { t } from "@mierkhat/copy";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter");
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
context.setDefaultTimeout(40000);
let extensionPage, base;
async function selectAccount(name) {
  await extensionPage.goto(base + "/index.html");
  const current = extensionPage
    .getByText(/^Account [0-9]+$/, { exact: true })
    .first();
  await current.waitFor();
  await current.click();
  await extensionPage
    .getByRole("heading", { name: "Wallets", exact: true })
    .waitFor();
  await extensionPage
    .getByTestId("wallet-row-select")
    .filter({ hasText: name })
    .click();
}
try {
  const worker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent("serviceworker"));
  base = "chrome-extension://" + worker.url().split("/")[2];
  extensionPage = await context.newPage();
  await extensionPage.goto(base + "/index.html");
  await extensionPage
    .getByRole("button", { name: "Unlock", exact: true })
    .waitFor();
  const password = JSON.parse(
    fs.readFileSync(path.join(dir, "credentials.json"), "utf8"),
  ).password;
  await extensionPage.locator("input[type=password]").fill(password);
  await extensionPage
    .getByRole("button", { name: "Unlock", exact: true })
    .click();
  await extensionPage
    .getByText(/^Account [0-9]+$/, { exact: true })
    .first()
    .click();
  await extensionPage
    .getByRole("heading", { name: "Wallets", exact: true })
    .waitFor();
  await extensionPage.getByTestId("wallet-row-select").first().waitFor();
  if ((await extensionPage.getByTestId("wallet-row-select").count()) < 2) {
    await extensionPage.getByTestId("add-wallet").click();
    await extensionPage
      .getByRole("link", { name: /Create a new wallet/ })
      .click();
    await extensionPage.locator("input[name=password]").fill(password);
    await extensionPage
      .getByRole("button", { name: "Create New Address", exact: true })
      .click();
    await extensionPage
      .getByText("Account 2", { exact: true })
      .first()
      .waitFor();
  }
  await selectAccount("Account 1");
  const network = extensionPage.getByTestId("network-selector-open");
  await network.locator("button").first().click();
  await extensionPage.getByText("Testnet", { exact: true }).click();
  console.log("Actual isolated Freighter accounts ready on testnet");
  const app = await context.newPage(),
    submissions = [],
    observedOwners = new Set();
  app.on("request", (request) => {
    const url = new URL(request.url());
    if (
      request.method() === "POST" &&
      /\/v1\/(setup|exit)\/submit$/.test(url.pathname)
    )
      submissions.push(url.pathname);
    const match = url.pathname.match(/^\/v1\/accounts\/(G[A-Z2-7]{55})$/);
    if (match) observedOwners.add(match[1]);
  });
  await app.goto("http://localhost:5173/app");
  // Use the real disconnected UI instead of racing stored reconnection.
  await app.evaluate(() => localStorage.removeItem("mierkhat.connected"));
  await app.reload();
  if (
    await app
      .getByRole("button", { name: t("wallet.connect"), exact: true })
      .count()
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
  const withdraw = app.getByRole("tab", {
    name: t("workspace.exit"),
    exact: true,
  });
  const deposit = app.getByRole("tab", {
    name: t("workspace.deposit"),
    exact: true,
  });
  await withdraw.focus();
  await withdraw.press("ArrowRight");
  await expect(deposit).toBeFocused();
  await expect(deposit).toHaveAttribute("aria-selected", "true");
  await expect(
    app.getByRole("tabpanel", { name: t("workspace.deposit"), exact: true }),
  ).toBeVisible();
  await deposit.press("Home");
  await expect(withdraw).toBeFocused();
  await expect(withdraw).toHaveAttribute("aria-selected", "true");
  console.log("Connected transaction tabs pass keyboard and ARIA checks");
  await app.locator(".maintenance summary").click();
  await app
    .getByRole("button", { name: t("restore.action"), exact: true })
    .click();
  await expect(
    app.getByRole("heading", { name: t("restore.heading"), exact: true }),
  ).toBeVisible();
  await app.getByRole("checkbox").check();
  const popupPromise = context.waitForEvent("page");
  await app
    .getByRole("button", { name: t("common.approve"), exact: true })
    .click();
  const popup = await popupPromise;
  await popup.getByRole("button", { name: "Confirm", exact: true }).waitFor();
  console.log(
    "Actual Freighter transaction prompt is pending; changing the real selected account",
  );
  await selectAccount("Account 2");
  await expect(
    app.getByRole("heading", { name: t("restore.heading"), exact: true }),
  ).toHaveCount(0, { timeout: 20000 });
  expect(submissions).toHaveLength(0);
  let lateResponse = "declined";
  const confirm = popup.getByRole("button", { name: "Confirm", exact: true });
  if (await confirm.isEnabled()) {
    await confirm.click();
    lateResponse = "original request approved after identity changed";
  } else {
    const reject = popup
      .getByRole("button", { name: /^(Cancel|Reject)$/ })
      .first();
    if (await reject.count()) await reject.click();
    else await popup.close();
  }
  await expect.poll(() => popup.isClosed(), { timeout: 20000 }).toBe(true);
  // Let the real extension response and the app's next identity poll finish.
  await app.waitForTimeout(3000);
  expect(submissions).toHaveLength(0);
  const evidence = {
    checkedAt: new Date().toISOString(),
    wallet: "Freighter 5.49.0",
    network: "Stellar testnet",
    observedOwners: [...observedOwners],
    lateResponse,
    assertions: {
      genuineExtension: true,
      actualAccountSwitchDuringPendingPrompt: true,
      staleReviewRemoved: true,
      zeroSubmissionsAfterSwitch: true,
      connectedTabKeyboardAndAriaVerified: true,
      noInjectedWallet: true,
      noNetworkInterception: true,
    },
  };
  fs.writeFileSync(
    path.join(root, "contracts/evidence/freighter-identity-change.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(
    "PASS actual Freighter identity switch invalidates pending review and produces zero submissions",
  );
} finally {
  if (extensionPage && base) {
    try {
      await selectAccount("Account 1");
    } catch {}
  }
  await context.close();
}
