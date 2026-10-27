import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const dir = path.resolve("../.tooling/freighter"),
  extension = path.join(dir, "unpacked");
const c = await chromium.launchPersistentContext(path.join(dir, "profile"), {
  headless: true,
  channel: "chromium",
  args: [
    "--disable-extensions-except=" + extension,
    "--load-extension=" + extension,
  ],
});
c.setDefaultTimeout(15000);
try {
  const w = c.serviceWorkers()[0] ?? (await c.waitForEvent("serviceworker")),
    p = await c.newPage();
  const base = "chrome-extension://" + w.url().split("/")[2];
  await p.goto(base + "/index.html");
  await p
    .getByRole("button", { name: /^(Create new wallet|Unlock)$/ })
    .first()
    .waitFor({ timeout: 15000 });
  const password = JSON.parse(
    fs.readFileSync(path.join(dir, "credentials.json"), "utf8"),
  ).password;
  if (await p.getByText("Create new wallet", { exact: true }).count()) {
    await p.getByText("Create new wallet", { exact: true }).click();
    await p.locator("input[name=password]").fill(password);
    await p.locator("input[name=confirmPassword]").fill(password);
    await p.locator("input[type=checkbox]").focus();
    await p.keyboard.press("Space");
    await p.getByRole("button", { name: "Confirm", exact: true }).click();
    await p.getByRole("button", { name: "Do this later", exact: true }).click();
  } else if (await p.locator("input[type=password]").count()) {
    await p.locator("input[type=password]").fill(password);
    await p.getByRole("button", { name: "Unlock", exact: true }).click();
    await p
      .getByRole("button", { name: "Unlock", exact: true })
      .waitFor({ state: "hidden", timeout: 15000 });
  }
  await p.waitForTimeout(1000);
  const testnet = p.getByText("Testnet", { exact: true });
  if (await testnet.count()) {
    await p
      .getByTestId("network-selector-open")
      .locator("button")
      .first()
      .click();
    await testnet.click();
    await p.waitForTimeout(1000);
  }
  console.log("url", p.url());
  console.log("body", await p.locator("body").innerText());
  console.log(
    "buttons",
    await p.locator("button").evaluateAll((es) =>
      es.map((e) => ({
        text: e.innerText,
        aria: e.getAttribute("aria-label"),
        test: e.getAttribute("data-testid"),
      })),
    ),
  );
  await p.screenshot({
    path: path.resolve("../.tooling/redesign/freighter-home.png"),
  });
} finally {
  await c.close();
}
