import { expect, test } from "@playwright/test";
import { t } from "@mierkhat/copy";
import { secureFlow } from "./secure-flow.fixture.js";

test("verified review signs once and retains unresolved receipt after reload", async ({ page }) => {
  const flow = await secureFlow(page);
  await flow.connect();
  await flow.prepare();
  await expect(page.getByRole("heading", { name: t("review.heading"), exact: true })).toBeVisible();
  await flow.confirm();
  await expect.poll(() => flow.submitted.length).toBe(1);
  expect(flow.signatures()).toBe(1);
  await expect(page.getByText(flow.hash(), { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: t("withdrawal.pending"), exact: true })).toBeVisible();
  await expect(page.getByText(t("pending.unknown"), { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(flow.hash(), { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: t("withdrawal.pending"), exact: true })).toBeVisible();
  await expect(page.getByText(t("pending.unknown"), { exact: true })).toBeVisible();
  expect(flow.signatures()).toBe(1);
  expect(flow.submitted).toHaveLength(1);
  expect(flow.errors).toEqual([]);
});


test("stale quote and review refresh preserve the user's shares and exact minimum", async ({ page }) => {
  const flow = await secureFlow(page);
  await flow.connect();
  await flow.prepare({ minimum: "7.1234567", quoteAge: 21 });
  await expect(page.getByRole("heading", { name: t("review.heading"), exact: true })).toBeVisible();
  expect(flow.quotes()).toBe(2);
  expect(flow.drafts[0]!.intent).toMatchObject({ shares: "10000000", min_receive: "71234567" });
  await flow.advance(21);
  await page.getByRole("button", { name: t("review.new"), exact: true }).click();
  await expect.poll(() => flow.drafts.length).toBe(2);
  await expect(page.getByRole("heading", { name: t("review.heading"), exact: true })).toBeVisible();
  expect(flow.drafts[1]!.intent).toMatchObject({ shares: "10000000", min_receive: "71234567" });
  expect(flow.drafts[1]!.intent.intent_id).not.toBe(flow.drafts[0]!.intent.intent_id);
  expect(flow.signatures()).toBe(0);
  expect(flow.errors).toEqual([]);
});

test("tampered backend review cannot advance to wallet signing", async ({ page }) => {
  const flow = await secureFlow(page, { tamperReview: true });
  await flow.connect();
  await flow.prepare();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("heading", { name: t("review.heading"), exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: t("action.sign"), exact: true })).toHaveCount(0);
  expect(flow.signatures()).toBe(0);
  expect(flow.submitted).toHaveLength(0);
  expect(flow.errors).toEqual([]);
});

test("expired confirmed review disables wallet signing", async ({ page }) => {
  const flow = await secureFlow(page);
  await flow.connect();
  await flow.prepare();
  await page.getByRole("button", { name: t("withdrawal.next"), exact: true }).click();
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("button", { name: t("action.sign"), exact: true })).toBeEnabled();
  await flow.advance(181);
  await expect(page.getByRole("button", { name: t("action.sign"), exact: true })).toBeDisabled();
  expect(flow.signatures()).toBe(0);
  expect(flow.submitted).toHaveLength(0);
  expect(flow.errors).toEqual([]);
});

test("account change while wallet approval is unresolved rejects the late signature", async ({ page }) => {
  const flow = await secureFlow(page, { holdSignature: true });
  await flow.connect();
  await flow.prepare();
  await flow.confirm();
  await expect.poll(flow.signatures).toBe(1);
  await flow.changeAccount();
  await flow.advance(3);
  flow.releaseSignature();
  await expect.poll(flow.afterSignatureIdentityReads).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: t("withdrawal.next"), exact: true })).toBeEnabled();
  await expect(page.getByRole("heading", { name: t("review.heading"), exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/app\?/);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("mierkhat.pending.")))).toEqual([]);
  expect(flow.submitted).toHaveLength(0);
  expect(flow.signatures()).toBe(1);
  expect(flow.errors).toEqual([]);
});

test("wallet mutation of the approved transaction is rejected before submission", async ({ page }) => {
  const flow = await secureFlow(page, { mutateSignature: true });
  await flow.connect();
  await flow.prepare();
  await flow.confirm();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(flow.signatures()).toBe(1);
  expect(flow.submitted).toHaveLength(0);
  expect(flow.errors).toEqual([]);
});

test("lost submission response retries identical signed bytes and idempotency without signing again", async ({ page }) => {
  const flow = await secureFlow(page, { loseSubmission: true });
  await flow.connect();
  await flow.prepare();
  await flow.confirm();
  await expect(page.getByRole("button", { name: t("receipt.retry_submit"), exact: true })).toBeVisible();
  await page.getByRole("button", { name: t("receipt.retry_submit"), exact: true }).click();
  await expect.poll(() => flow.submitted.length).toBe(2);
  expect(flow.submitted[1]).toEqual(flow.submitted[0]);
  expect(flow.submitted[0]!.idempotency).toBeTruthy();
  expect(flow.signatures()).toBe(1);
  await expect(page.getByText(flow.hash(), { exact: true }).first()).toBeVisible();
  expect(flow.errors).toEqual([]);
});
