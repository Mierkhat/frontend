import { expect, test } from "@playwright/test";
import { t } from "@mierkhat/copy";

test("home defers task pages and a failed task import exposes a reload action", async ({ page }) => {
  const modules: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".js")) modules.push(request.url());
  });
  await page.route("**/v1/network", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"Unavailable"}' }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: t("home.headline_a") + " " + t("home.headline_b") })).toBeVisible();
  expect(modules.some((url) => /\/(PositionsWorkspace|Migration|WithdrawalTools|Activity)-/.test(url))).toBe(false);
  await page.route("**/assets/PositionsWorkspace-*.js", (route) => route.abort());
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: t("common.unavailable"), exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: t("common.refresh"), exact: true })).toHaveAttribute("href", /\/app$/);
  await page.unroute("**/assets/PositionsWorkspace-*.js");
  await page.getByRole("link", { name: t("common.refresh"), exact: true }).click();
  await expect(page.getByRole("heading", { name: t("workspace.ready") })).toBeVisible();
});

test("lazy task pages and deep links retain their primary content", async ({ page }) => {
  await page.route("**/v1/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"code":"Unavailable","copyKey":"service.unavailable"}' }));
  await page.route("https://soroban-testnet.stellar.org/**", (route) => route.abort());
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const route of ["/alerts", "/migrate", "/withdrawals", "/activity", "/contracts", "/help", "/review/missing", "/receipt/" + "01".repeat(32)]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(errors).toEqual([]);
});
