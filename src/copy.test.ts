import { it, expect } from "vitest";
import { t } from "./copy.js";
it("renders exact identifiers without rewriting them as editorial text", () => {
  const token = "USD-TEST";
  expect(
    t("action.minimum_summary", { amount: "900719925.4740993", token }),
  ).toBe("Receive at least 900719925.4740993 USD-TEST");
});
