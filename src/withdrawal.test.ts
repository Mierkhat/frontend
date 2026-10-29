import { expect, it } from "vitest";
import { remainingPosition, sharePreset } from "./withdrawal.js";

it("preserves the user's exact position when sizing and previewing a withdrawal", () => {
  const holding = "1999999995";
  expect(remainingPosition(holding, "25", 7)).toBe("174.9999995");
  expect(sharePreset(holding, 25, 7)).toBe("49.9999998");
  expect(sharePreset(holding, 100, 7)).toBe("199.9999995");
  expect(remainingPosition(holding, sharePreset(holding, 100, 7), 7)).toBe("0");
  expect(sharePreset("9007199254740993", 75, 7)).toBe("675539944.1055744");
});

it("never presents a remaining balance for an invalid or overspending withdrawal", () => {
  for (const amount of ["", "0", "200", "1e2", "1.00000001", "-1"])
    expect(remainingPosition("1999999995", amount, 7)).toBeUndefined();
  expect(() => sharePreset("1999999995", 101, 7)).toThrow();
  expect(() => sharePreset("1999999995", 0.5, 7)).toThrow();
});
