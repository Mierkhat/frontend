import { formatAmount, parseAmount, rawAmount } from "@mierkhat/sdk";

/** Floor presets in raw units so a percentage can never overspend a position. */
export function sharePreset(total: string, percent: number, decimals: number) {
  if (!Number.isInteger(percent) || percent < 1 || percent > 100)
    throw Error("Invalid withdrawal percentage");
  return formatAmount(
    ((rawAmount(total, false) * BigInt(percent)) / 100n).toString(),
    decimals,
  );
}

export function remainingPosition(
  total: string,
  amount: string,
  decimals: number,
) {
  try {
    const remaining =
      rawAmount(total, false) - BigInt(parseAmount(amount, decimals));
    return remaining >= 0n
      ? formatAmount(remaining.toString(), decimals)
      : undefined;
  } catch {
    return undefined;
  }
}
