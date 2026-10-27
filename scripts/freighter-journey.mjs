/** Actual Freighter 5.49.0 and public Stellar testnet. No wallet injection or network interception. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter"),
  extension = path.join(dir, "unpacked"),
  evidencePath = path.join(root, "contracts/evidence/freighter-journey.json");
const c = await chromium.launchPersistentContext(path.join(dir, "profile"), {
  headless: true,
  channel: "chromium",
  viewport: { width: 1440, height: 1000 },
  args: [
    "--disable-extensions-except=" + extension,
    "--load-extension=" + extension,
  ],
});
c.setDefaultTimeout(40000);
let evidence;
try {
  evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
} catch {
  evidence = {
    wallet: "Freighter",
    walletVersion: "5.49.0",
    network: "Test SDF Network ; September 2015",
    startedAt: new Date().toISOString(),
    operations: {},
  };
}
function save() {
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
}
try {
  const w = c.serviceWorkers()[0] ?? (await c.waitForEvent("serviceworker")),
    ext = await c.newPage(),
    base = "chrome-extension://" + w.url().split("/")[2];
  await ext.goto(base + "/index.html");
  await ext.getByRole("button", { name: "Unlock", exact: true }).waitFor();
  await ext
    .locator("input[type=password]")
    .fill(
      JSON.parse(fs.readFileSync(path.join(dir, "credentials.json"), "utf8"))
        .password,
    );
  await ext.getByRole("button", { name: "Unlock", exact: true }).click();
  await ext.getByTestId("network-selector-open").waitFor();
  await ext
    .getByTestId("network-selector-open")
    .locator("button")
    .first()
    .click();
  await ext.getByText("Testnet", { exact: true }).click();
  const app = await c.newPage();
  const pageErrors = [];
  app.on("pageerror", (e) => pageErrors.push(e.message));
  let account;
  app.on("response", async (r) => {
    if (/\/v1\/accounts\/G/.test(r.url()) && r.ok()) {
      account = await r.json();
      evidence.owner = account.owner;
      save();
    }
  });
  async function receipt(label) {
    await app.waitForURL(/\/receipt\/[a-f0-9]{64}/, { timeout: 50000 });
    const hash = app.url().split("/receipt/")[1].split("?")[0];
    evidence.operations[label] = { hash };
    save();
    await expect(
      app.getByRole("heading", { name: "Your transaction is complete" }),
    ).toBeVisible({ timeout: 90000 });
    const result = await (
      await app.request.get(
        "http://localhost:5173/v1/transactions/" +
          hash +
          "?environment=testnet",
      )
    ).json();
    expect(result.state).toBe("succeeded");
    evidence.operations[label] = result;
    save();
    console.log(label, hash);
    return result;
  }
  async function open() {
    await app.goto("http://localhost:5173/app");
    await app.waitForTimeout(1000);
    if (app.url().includes("/receipt/")) {
      await expect(
        app.getByRole("heading", { name: "Your transaction is complete" }),
      ).toBeVisible({ timeout: 90000 });
      await app.goto("http://localhost:5173/app");
    }
    if (
      await app
        .getByRole("button", { name: "Connect your wallet", exact: true })
        .first()
        .isVisible()
    ) {
      const pending = c.waitForEvent("page");
      await app
        .getByRole("button", { name: "Connect your wallet", exact: true })
        .first()
        .click();
      const popup = await pending;
      await popup.getByRole("button", { name: "Connect", exact: true }).click();
    }
    await app.getByRole("heading", { name: "Get your wallet ready" }).waitFor();
    await expect
      .poll(() => account?.owner ?? evidence.owner, { timeout: 30000 })
      .toMatch(/^G[A-Z2-7]{55}$/);
    await expect
      .poll(
        async () =>
          app
            .locator(".setup-actions button")
            .first()
            .evaluate(
              (e) => !e.disabled || e.textContent.includes("Account funded"),
            ),
        { timeout: 45000 },
      )
      .toBe(true);
  }
  async function sign(label) {
    await app.getByRole("checkbox").check();
    const pending = c.waitForEvent("page");
    await app
      .getByRole("button", { name: "Sign in Freighter", exact: true })
      .click();
    const popup = await pending;
    await popup.getByRole("button", { name: "Confirm", exact: true }).waitFor();
    await popup.screenshot({
      path: path.join(
        root,
        ".tooling/redesign/freighter-" + label + "-approval.png",
      ),
    });
    await popup.getByRole("button", { name: "Confirm", exact: true }).click();
    return receipt(label);
  }
  await open();
  if (evidence.completedAt) {
    await app.goto(
      "http://localhost:5173/receipt/" + evidence.operations.exit.hash,
    );
    await expect(
      app.getByRole("heading", { name: "Your transaction is complete" }),
    ).toBeVisible({ timeout: 45000 });
    console.log("PASS existing real Freighter journey verified by receipt");
  } else {
    const fund = app.getByRole("button", {
      name: "Fund account with testnet XLM",
      exact: true,
    });
    if (await fund.count()) {
      await expect(fund).toBeEnabled();
      await fund.click();
      await app
        .getByRole("button", { name: "Account funded", exact: true })
        .waitFor({ timeout: 45000 });
    }
    evidence.funded = true;
    save();
    const trust = app.getByRole("button", {
      name: "Approve token trustlines",
      exact: true,
    });
    if (await trust.count()) {
      await expect(trust).toBeEnabled();
      await trust.click();
      await app
        .getByRole("heading", { name: "Allow these testnet assets" })
        .waitFor();
      await sign("trustlines");
      await open();
    }
    if (!evidence.operations.faucet) {
      await app
        .getByRole("button", { name: "Receive testnet tokens", exact: true })
        .click();
      await receipt("faucet");
      await open();
    }
    if (!evidence.operations.deposit) {
      await app.getByRole("tab", { name: "Deposit", exact: true }).click();
      await app.getByLabel("Deposit MKA", { exact: true }).fill("10");
      await app.getByLabel("Deposit MKB", { exact: true }).fill("10");
      await app
        .getByRole("button", { name: "Review deposit", exact: true })
        .click();
      await app.getByRole("heading", { name: "Review deposit" }).waitFor();
      await app.screenshot({
        path: path.join(root, ".tooling/redesign/deposit-review-desktop.png"),
        fullPage: true,
      });
      await sign("deposit");
      await open();
    }
    evidence.beforeExit = await (
      await app.request.get(
        "http://localhost:5173/v1/accounts/" + evidence.owner,
      )
    ).json();
    save();
    await app.getByRole("button", { name: "Max", exact: true }).click();
    await app
      .getByRole("button", { name: "Get live quote", exact: true })
      .click();
    await app.getByRole("heading", { name: "Your live route" }).waitFor();
    await app
      .getByRole("button", { name: "Review your action", exact: true })
      .click();
    await app
      .getByRole("heading", { name: "Take a moment with the numbers" })
      .waitFor();
    await app.screenshot({
      path: path.join(root, ".tooling/redesign/exit-review-desktop.png"),
      fullPage: true,
    });
    // Guarded exits use the same genuine extension signing popup with their own exact verifier.
    await app.getByRole("checkbox").check();
    const pending = c.waitForEvent("page");
    await app
      .getByRole("button", { name: "Sign in your wallet", exact: true })
      .click();
    const popup = await pending;
    await popup.getByRole("button", { name: "Confirm", exact: true }).waitFor();
    await popup.screenshot({
      path: path.join(root, ".tooling/redesign/freighter-exit-approval.png"),
    });
    await popup.getByRole("button", { name: "Confirm", exact: true }).click();
    const result = await receipt("exit");
    expect(result.receipt).toBeTruthy();
    evidence.afterExit = await (
      await app.request.get(
        "http://localhost:5173/v1/accounts/" + evidence.owner,
      )
    ).json();
    expect(evidence.afterExit.sharesRaw).toBe("0");
    const underlying = evidence.beforeExit.tokens.filter((t) =>
      ["MKA", "MKB"].includes(t.symbol),
    );
    for (const token of underlying)
      expect(
        evidence.afterExit.tokens.find((t) => t.address === token.address)
          .balanceRaw,
      ).toBe(token.balanceRaw);
    const before = BigInt(
        evidence.beforeExit.tokens.find((t) => t.symbol === "MKOUT").balanceRaw,
      ),
      after = BigInt(
        evidence.afterExit.tokens.find((t) => t.symbol === "MKOUT").balanceRaw,
      );
    expect(after - before).toBe(BigInt(result.receipt.received));
    await app.reload();
    await expect(
      app.getByRole("heading", { name: "Your transaction is complete" }),
    ).toBeVisible();
    await expect(
      app
        .getByText(
          result.receipt.received === "0"
            ? "impossible"
            : (BigInt(result.receipt.received) / 10000000n).toString(),
          { exact: false },
        )
        .first(),
    ).toBeVisible();
    await app.screenshot({
      path: path.join(root, ".tooling/redesign/freighter-receipt-desktop.png"),
      fullPage: true,
    });
    evidence.completedAt = new Date().toISOString();
    evidence.assertions = {
      genuineFreighterExtension: true,
      noInjectedWallet: true,
      noNetworkInterception: true,
      allTransactionsConfirmed: true,
      shareBalanceSpent: true,
      existingUnderlyingUnchanged: true,
      settlementDeltaMatchesReceipt: true,
      reloadRecovery: true,
    };
    expect(pageErrors).toEqual([]);
    save();
    console.log(
      "PASS real Freighter signed trustlines, deposit, guarded exit, actual receipt and balance invariants",
    );
  }
} catch (error) {
  console.error(error.message);
  for (const p of c.pages()) {
    if (p.url().startsWith("http://localhost:5173")) {
      console.error((await p.locator("main").innerText()).slice(-7000));
      await p.screenshot({
        path: path.join(
          root,
          ".tooling/redesign/freighter-journey-failure.png",
        ),
        fullPage: true,
      });
    }
  }
  process.exitCode = 1;
} finally {
  await c.close();
}
