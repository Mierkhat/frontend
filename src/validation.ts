import { MierkhatError, parseAmount } from "@mierkhat/sdk";
import type { CopyKey } from "./copy.js";

export function validateAmount(
  value: string,
  decimals: number,
  limits: { balanceRaw?: string; maximumRaw?: string } = {},
): { raw?: string; issue?: CopyKey } {
  if (!value.trim()) return { issue: "input.positive" };
  try {
    const raw = parseAmount(value, decimals);
    if (limits.balanceRaw !== undefined && BigInt(raw) > BigInt(limits.balanceRaw))
      return { issue: "exit.balance" };
    if (limits.maximumRaw !== undefined && BigInt(raw) > BigInt(limits.maximumRaw))
      return { issue: "exit.high_minimum" };
    return { raw };
  } catch (error) {
    return { issue: error instanceof MierkhatError ? error.copyKey as CopyKey : "input.invalid" };
  }
}
