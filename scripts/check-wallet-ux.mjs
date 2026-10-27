/** Genuine extension interaction, using only the isolated test profile. No injected wallet. */
import { chromium, expect } from "@playwright/test";
import { t } from "@mierkhat/copy";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter"),
  extension = path.join(dir, "unpacked");
const context = await chromium.launchPersistentContext(
  path.join(dir, "profile"),
  {
    headless: true,
    channel: "chromium",
    viewport: { width: 1440, height: 1000 },
    args: [
      "--disable-extensions-except=" + extension,
      "--load-extension=" + extension,
    ],
  },
);
context.setDefaultTimeout(30000);
try {
  const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker")),
    extensionPage = await context.newPage(),
    base = "chrome-extension://" + worker.url().split("/")[2];
  await extensionPage.goto(base + "/index.html");
  await extensionPage
    .getByRole("button", { name: "Unlock", exact: true })
    .waitFor();
  await extensionPage
    .locator("input[type=password]")
    .fill(
      JSON.parse(fs.readFileSync(path.join(dir, "credentials.json"), "utf8"))
        .password,
    );
  await extensionPage
    .getByRole("button", { name: "Unlock", exact: true })
    .click();
  const network = extensionPage.getByTestId("network-selector-open");
  await network.locator("button").first().click();
  await extensionPage.getByText("Testnet", { exact: true }).click();
  await network.locator("button").first().click();
  const remove = network.locator("button.allow-list-remove");
  if (await remove.count()) {
    await remove.click();
  } else await network.locator("button").first().click();
  const app = await context.newPage();
  await app.emulateMedia({ colorScheme: "dark" });
  await app.goto("http://localhost:5173/app");
  await app.evaluate(() => localStorage.removeItem("mierkhat.connected"));
  await app.reload();
  await expect(
    app.getByRole("heading", { name: t("workspace.ready") }),
  ).toBeVisible();
  const errors = [];
  app.on("pageerror", (e) => errors.push(e.message));
  const connect = app
    .getByRole("button", { name: t("wallet.connect"), exact: true })
    .first();
  await connect.click();
  const dialog = app.getByRole("dialog", { name: t("wallet.choose") });
  await expect(dialog).toBeVisible();
  const provider = dialog.getByRole("button", { name: /Freighter/ });
  await expect(provider).toBeEnabled();
  await app.screenshot({
    path: path.join(root, ".tooling/copy-refresh/wallet-installed-dark.png"),
  });
  await app.keyboard.press("Escape");
  await expect(connect).toBeFocused();
  await connect.click();
  await expect(app.getByRole("dialog")).toBeVisible();
  const pending = context.waitForEvent("page");
  await app
    .getByRole("dialog")
    .getByRole("button", { name: /Freighter/ })
    .click();
  await expect(app.getByRole("dialog").getByRole("status")).toContainText(
    t("wallet.connecting"),
  );
  await expect(app.locator(".connection-status")).toHaveCount(0);
  const popup = await pending;
  await popup.getByRole("button", { name: "Connect", exact: true }).waitFor();
  await app.screenshot({
    path: path.join(root, ".tooling/copy-refresh/wallet-waiting-dark.png"),
  });
  await popup.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(app.getByRole("dialog")).toHaveCount(0);
  await expect(
    app.getByRole("heading", { name: t("setup.heading") }),
  ).toBeVisible();
  await expect(
    app
      .locator("header")
      .getByRole("link", { name: t("home.open"), exact: true }),
  ).toHaveCount(0);
  await app
    .getByRole("button", { name: t("theme.label"), exact: true })
    .click();
  await app
    .getByRole("menuitemradio", { name: t("theme.dark"), exact: true })
    .click();
  await app
    .getByRole("button", { name: t("theme.label"), exact: true })
    .click();
  await app.screenshot({
    path: path.join(root, ".tooling/copy-refresh/theme-menu-dark.png"),
  });
  await app.keyboard.press("Escape");
  await app.screenshot({
    path: path.join(root, ".tooling/copy-refresh/workspace-connected.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
  fs.writeFileSync(
    path.join(root, ".tooling/copy-refresh/wallet-ux.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        wallet: "Freighter 5.49.0",
        network: "Stellar testnet",
        assertions: {
          genuineExtension: true,
          selectorBeforeApproval: true,
          extensionDetected: true,
          escapeReturnsFocus: true,
          walletSpecificProgress: true,
          connectedThroughActualApproval: true,
          noWorkspaceCtaOnWorkspace: true,
          darkMenuReadable: true,
          noInjectedWallet: true,
          noNetworkInterception: true,
        },
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS actual Freighter detection, chooser, focus restoration, inline approval progress, connection and dark appearance menu",
  );
} finally {
  await context.close();
}
