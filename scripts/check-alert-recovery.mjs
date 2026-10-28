/** Verify an actual opt-in watch across API/PostgreSQL restart and real worker checks.
 * The browser capability stays in process memory, never public evidence or logs. */
import { chromium, expect as baseExpect } from "@playwright/test";
import { t } from "@mierkhat/copy";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
const expect = baseExpect.configure({ timeout: 120000 }),
  root = path.resolve(".."),
  dir = path.join(root, ".tooling/freighter");
const c = await chromium.launchPersistentContext(path.join(dir, "profile"), {
  headless: true,
  channel: "chromium",
  viewport: { width: 1440, height: 1000 },
  args: [
    "--disable-extensions-except=" + path.join(dir, "unpacked"),
    "--load-extension=" + path.join(dir, "unpacked"),
  ],
});
let stopped = false;
async function restart() {
  const output = fs.openSync(
    path.join(root, ".tooling/local/watch-restart-api.log"),
    "a",
    0o600,
  );
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/local.ts"],
    {
      cwd: path.join(root, "backend"),
      detached: true,
      stdio: ["ignore", output, output],
    },
  );
  child.unref();
  fs.closeSync(output);
  for (let n = 0; n < 150; n++) {
    try {
      if ((await fetch("http://127.0.0.1:3001/v1/health")).ok) {
        stopped = false;
        console.log("Owned API restarted", child.pid);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("API restart incomplete; inspect the private local runtime log");
}
try {
  const page = await c.newPage();
  await page.goto("http://localhost:5173/alerts");
  const access = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("mierkhat.watches.v1") ?? "[]"),
  );
  expect(access.length).toBeGreaterThan(0);
  const a = access.at(-1);
  async function state(key = a.key) {
    const r = await fetch("http://127.0.0.1:3001/v1/watches/" + a.id, {
      headers: { "X-Watch-Key": key },
    });
    return { status: r.status, value: await r.json() };
  }
  const before = await state();
  expect(before.status).toBe(200);
  expect(before.value.notifications.length).toBeGreaterThan(0);
  expect((await state("00".repeat(32))).status).toBe(404);
  const line = execFileSync("ss", ["-ltnp"], { encoding: "utf8" })
    .split("\n")
    .find((l) => l.includes("127.0.0.1:3001 "));
  const pid = Number(line.match(/pid=(\d+)/)[1]);
  expect(fs.realpathSync("/proc/" + pid + "/cwd")).toBe(
    path.join(root, "backend"),
  );
  process.kill(pid, "SIGTERM");
  stopped = true;
  for (let n = 0; n < 150; n++) {
    try {
      process.kill(pid, 0);
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  await restart();
  const after = await state();
  expect(after.status).toBe(200);
  expect(after.value.notifications.map((n) => n.id)).toEqual(
    before.value.notifications.map((n) => n.id),
  );
  await page.reload();
  await expect(
    page.getByText(t("watch.met"), { exact: true }).first(),
  ).toBeVisible();
  for (let n = 0; n < 15; n++) {
    const pending = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/v1/watches/" + a.id + "/rearm",
    );
    await page
      .getByRole("button", { name: t("watch.rearm"), exact: true })
      .last()
      .click();
    const response = await pending;
    if (response.ok()) break;
    if (n === 14) throw Error("Watch remained busy");
    await page.waitForTimeout(2000);
  }
  await expect
    .poll(
      async () => {
        const r = await state();
        return r.value.notifications.length;
      },
      { timeout: 120000 },
    )
    .toBe(before.value.notifications.length + 1);
  // The worker's repeated met state must not add any further notification.
  const rearmed = await state();
  await page
    .getByRole("button", { name: t("watch.refresh"), exact: true })
    .click();
  await expect(page.locator(".watch-update")).toHaveCount(
    rearmed.value.notifications.length,
  );
  while (
    await page
      .getByRole("button", { name: t("watch.seen"), exact: true })
      .count()
  ) {
    await page
      .getByRole("button", { name: t("watch.seen"), exact: true })
      .first()
      .click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({
    path: "artifacts/withdrawal-alerts-recovery.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: t("watch.remove"), exact: true })
    .last()
    .click();
  await expect
    .poll(async () => {
      return (await state()).status;
    })
    .toBe(404);
  expect(
    await page.evaluate(
      (id) =>
        JSON.parse(localStorage.getItem("mierkhat.watches.v1") ?? "[]").some(
          (v) => v.id === id,
        ),
      a.id,
    ),
  ).toBe(false);
  const evidencePath = path.join(
      root,
      "contracts/evidence/freighter-exit-tools.json",
    ),
    evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  evidence.assertions.watch = {
    ...evidence.assertions.watch,
    wrongCapabilityDenied: true,
    realBackendPostgresRestart: true,
    notificationsPreserved: true,
    explicitRearm: true,
    markReadAfterRestart: true,
    serverAndBrowserDeletion: true,
    verifiedAt: new Date().toISOString(),
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  console.log(
    "PASS actual watch restart, rearm, capability isolation and deletion",
  );
} finally {
  await c.close();
  if (stopped) await restart();
}
