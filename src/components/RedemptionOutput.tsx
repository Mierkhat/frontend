import type { DeploymentBundle } from "@mierkhat/sdk";
import { t } from "../copy.js";

/** The wallet's payment is separate from the vault's internal redemption legs. */
export function RedemptionOutput({ bundle }: { bundle: DeploymentBundle }) {
  const output = bundle.tokens.find(
    (token) => token.address === bundle.profile.settlement,
  )!;
  const direct = bundle.profile.assets.every(
    (asset) => asset.asset === output.address,
  );
  const assets = bundle.profile.assets
    .map(
      (asset) =>
        bundle.tokens.find((token) => token.address === asset.asset)!.symbol,
    )
    .join(", ");
  return (
    <div
      className="redemption-output"
      role="group"
      aria-label={t("redemption.output")}
    >
      <div>
        <span>{t("redemption.output")}</span>
        <strong>{output.symbol}</strong>
      </div>
      <p>{t("redemption.only_output", { token: output.symbol })}</p>
      <p>
        {direct
          ? t("redemption.direct", { token: output.symbol })
          : t("redemption.internal_flow", { assets, token: output.symbol })}
      </p>
    </div>
  );
}
