import { expect, test } from "@playwright/test";
import { t } from "@mierkhat/copy";

for (const width of [320, 768, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`workspace navigation and wallet chooser at ${width} in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      // These smoke cases complement the signed-flow regressions in ci-security.spec.ts.
      await page.route("https://soroban-testnet.stellar.org/**", route => route.abort());
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("/app");
      await expect(page.getByRole("heading", { name: t("workspace.ready") })).toBeVisible();
      const connect = page.getByRole("button", { name: t("wallet.connect"), exact: true }).first();
      await expect(connect).toBeEnabled();
      await connect.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Freighter", { exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(connect).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}
