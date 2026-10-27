import { t } from "@mierkhat/copy";
/** Actual Freighter 5.49.0 and public Stellar testnet. No wallet injection or network interception. */
import { chromium, expect } from "@playwright/test";
import fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
const root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter"),
  extension = path.join(dir, "unpacked"),
  evidencePath = path.join(root, "contracts/evidence/freighter-journey.json");
let restartNeeded = false;
async function restartLocalAPI() {
  if (!restartNeeded) return;
  await new Promise((r) => setTimeout(r, 3000));
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/local.ts"],
    {
      cwd: path.join(root, "backend"),
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        MIERKHAT_TEST_API_OUTAGE: undefined,
        MIERKHAT_OWNED_API_PID: undefined,
      },
    },
  );
  child.unref();
  for (let n = 0; n < 100; n++) {
    try {
      if ((await fetch("http://127.0.0.1:3001/v1/health")).ok) {
        restartNeeded = false;
        fs.writeFileSync(
          path.join(root, ".tooling/local/active-api.json"),
          JSON.stringify({
            pid: child.pid,
            port: 3001,
            command: "node --import tsx scripts/local.ts",
          }),
        );
        console.log("Local API restarted, owner process", child.pid);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
  throw Error("Local API restart failed");
}
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
      app.getByRole("heading", { name: t("receipt.setup_success") }),
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
        app.getByRole("heading", { name: t("receipt.setup_success") }),
      ).toBeVisible({ timeout: 90000 });
      await app.goto("http://localhost:5173/app");
    }
    if (
      await app
        .getByRole("button", { name: t("wallet.connect"), exact: true })
        .first()
        .isVisible()
    ) {
      const pending = c.waitForEvent("page");
      await app
        .getByRole("button", { name: t("wallet.connect"), exact: true })
        .first()
        .click();
      const picker = app.getByRole("dialog", { name: t("wallet.choose") });
      await picker.getByRole("button", { name: /Freighter/ }).click();
      const popup = await pending;
      await popup.getByRole("button", { name: "Connect", exact: true }).click();
    }
    await app.getByRole("heading", { name: t("setup.heading") }).waitFor();
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
              (e, expected) => !e.disabled || e.textContent.includes(expected),
              t("setup.funded"),
            ),
        { timeout: 45000 },
      )
      .toBe(true);
  }
  async function sign(label) {
    await app.getByRole("checkbox").check();
    const pending = c.waitForEvent("page");
    await app
      .getByRole("button", { name: t("common.approve"), exact: true })
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
      app.getByRole("heading", { name: t("receipt.setup_success") }),
    ).toBeVisible({ timeout: 45000 });
    console.log("PASS existing real Freighter journey verified by receipt");
    if (!evidence.operations.restoration) {
      await open();
      await app.getByText(t("restore.maintenance"), { exact: true }).click();
      await app
        .getByRole("button", {
          name: t("restore.action"),
          exact: true,
        })
        .click();
      await app
        .getByRole("heading", { name: t("restore.heading"), exact: true })
        .waitFor();
      await sign("restoration");
      evidence.assertions.explicitRestorationTransactionConfirmed = true;
      evidence.restorationScope =
        "Real RestoreFootprint submission for the pinned deployment. Entries were live; an archived-to-live transition is not claimed.";
      save();
    }
  } else {
    const fund = app.getByRole("button", {
      name: t("setup.fund"),
      exact: true,
    });
    if (await fund.count()) {
      await expect(fund).toBeEnabled();
      await fund.click();
      await app
        .getByRole("button", { name: t("setup.funded"), exact: true })
        .waitFor({ timeout: 45000 });
    }
    evidence.funded = true;
    save();
    const trust = app.getByRole("button", {
      name: t("setup.trust"),
      exact: true,
    });
    if (await trust.count()) {
      await expect(trust).toBeEnabled();
      await trust.click();
      await app
        .getByRole("heading", { name: t("setup.trust_review") })
        .waitFor();
      await sign("trustlines");
      await open();
    }
    if (!evidence.operations.faucet) {
      await app
        .getByRole("button", { name: t("setup.faucet"), exact: true })
        .click();
      await receipt("faucet");
      await open();
    }
    if (!evidence.operations.deposit) {
      await app
        .getByRole("tab", { name: t("workspace.deposit"), exact: true })
        .click();
      await app
        .getByLabel(t("deposit.amount", { token: "MKA" }), { exact: true })
        .fill("10");
      await app
        .getByLabel(t("deposit.amount", { token: "MKB" }), { exact: true })
        .fill("10");
      await app
        .getByRole("button", { name: t("deposit.review"), exact: true })
        .click();
      await app.getByRole("heading", { name: t("deposit.review") }).waitFor();
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
    await app
      .getByRole("button", { name: t("action.max"), exact: true })
      .click();
    await app
      .getByRole("button", { name: t("exit.quote"), exact: true })
      .click();
    await app.getByRole("heading", { name: t("exit.route") }).waitFor();
    await app
      .getByRole("button", { name: t("action.review"), exact: true })
      .click();
    await app.getByRole("heading", { name: t("review.heading") }).waitFor();
    await app.screenshot({
      path: path.join(root, ".tooling/redesign/exit-review-desktop.png"),
      fullPage: true,
    });
    // Guarded exits use the same genuine extension signing popup with their own exact verifier.
    await app.getByRole("checkbox").check();
    const pending = c.waitForEvent("page");
    await app
      .getByRole("button", { name: t("action.sign"), exact: true })
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
      app.getByRole("heading", { name: t("receipt.setup_success") }),
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
  if (process.env.MIERKHAT_CAPTURE_REVIEW === "1") {
    await open();
    await app
      .getByRole("tab", { name: t("workspace.deposit"), exact: true })
      .click();
    await app
      .getByLabel(t("deposit.amount", { token: "MKA" }), { exact: true })
      .fill("1");
    await app
      .getByLabel(t("deposit.amount", { token: "MKB" }), { exact: true })
      .fill("1");
    await app
      .getByRole("button", { name: t("deposit.review"), exact: true })
      .click();
    await app
      .getByRole("heading", { name: t("deposit.review"), exact: true })
      .waitFor();
    await app
      .getByRole("button", { name: t("theme.label"), exact: true })
      .click();
    await app
      .getByRole("menuitemradio", { name: t("theme.system"), exact: true })
      .click();
    for (const width of [320, 768, 1440])
      for (const theme of ["light", "dark"]) {
        await app.setViewportSize({ width, height: 1000 });
        await app.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
        await app.waitForTimeout(100);
        expect(
          await app.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await app.screenshot({
          path: path.join(
            root,
            "frontend/artifacts/review-" + width + "-" + theme + ".png",
          ),
          fullPage: true,
        });
      }
    console.log(
      "PASS real prepared deposit review at all six width/theme combinations; no transaction submitted for these screenshots",
    );
    await open();
  }
  if (process.env.MIERKHAT_TEST_API_OUTAGE === "1") {
    const pid = Number(process.env.MIERKHAT_OWNED_API_PID);
    if (!Number.isSafeInteger(pid) || pid <= 1)
      throw Error("Explicit owned API PID required");
    await open();
    await app.getByText(t("restore.maintenance"), { exact: true }).click();
    await app
      .getByRole("button", { name: t("restore.action"), exact: true })
      .click();
    await app
      .getByRole("heading", { name: t("restore.heading"), exact: true })
      .waitFor();
    process.kill(pid, "SIGTERM");
    restartNeeded = true;
    await app.getByRole("checkbox").check();
    const pending = c.waitForEvent("page");
    await app
      .getByRole("button", { name: t("common.approve"), exact: true })
      .click();
    const popup = await pending;
    await popup.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      app.getByRole("button", {
        name: t("receipt.retry_submit"),
        exact: true,
      }),
    ).toBeVisible({ timeout: 60000 });
    const hash = await app.locator(".storage-recovery code").innerText();
    const lookup = await (
      await fetch("https://soroban-testnet.stellar.org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: { hash },
        }),
      })
    ).json();
    expect(lookup.result.status).toBe("NOT_FOUND");
    evidence.apiOutageRecovery = {
      hash,
      signedBytesRetainedInMemory: true,
      publicHashSavedBeforeSend: true,
      rpcNotFoundBeforeRetry: true,
    };
    save();
    await app.screenshot({
      path: path.join(root, ".tooling/redesign/api-outage-recovery.png"),
      fullPage: true,
    });
    await restartLocalAPI();
    let prompts = 0;
    const count = (p) => {
      if (p.url().startsWith("chrome-extension://")) prompts++;
    };
    c.on("page", count);
    await app
      .getByRole("button", {
        name: t("receipt.retry_submit"),
        exact: true,
      })
      .click();
    const result = await receipt("outageRecovery");
    c.off("page", count);
    expect(result.hash).toBe(hash);
    expect(prompts).toBe(0);
    evidence.apiOutageRecovery = {
      ...evidence.apiOutageRecovery,
      retriedIdenticalHash: true,
      noSecondWalletPrompt: true,
      observation: result,
    };
    save();
    console.log(
      "PASS genuine API outage retained signed bytes and retried the same hash without another wallet prompt",
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
  await restartLocalAPI();
  await c.close();
}
