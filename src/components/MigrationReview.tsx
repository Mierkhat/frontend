import { useEffect, useRef, useState } from "react";
import {
  formatAmount,
  type DeploymentBundle,
  type Review,
} from "@mierkhat/sdk";
import { t } from "../copy.js";
import { Identity } from "./Shared.js";
export function MigrationReviewPanel({
  review,
  bundle,
  onEdit,
  onSign,
  signing,
  confirmed,
  onConfirm,
}: {
  review: Review;
  bundle: DeploymentBundle;
  onEdit: () => void;
  onSign: () => void;
  signing: boolean;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null),
    [now, setNow] = useState(Date.now()),
    [shared, setShared] = useState(false);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [review.envelopeDigest]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const m = bundle.migration!,
    i = review.draft.intent,
    bounds = i.migration!,
    stale = now / 1000 - Number(review.preparedTime) > 20;
  const settlement = bundle.tokens.find(
    (t) => t.address === bundle.profile.settlement,
  )!;
  return (
    <section className="review-panel migration-review">
      <h2 ref={heading} tabIndex={-1}>
        {t("migration.review")}
      </h2>
      <p>{t("migration.notices")}</p>
      <Identity
        label={t("migration.source")}
        value={bundle.profile.vault.address}
        link
      />
      <Identity
        label={t("migration.destination")}
        value={m.destination.address}
        link
      />
      <dl className="tool-facts">
        <div>
          <dt>{t("migration.shares")}</dt>
          <dd>{formatAmount(i.shares, bundle.shareDecimals)}</dd>
        </div>
        <div>
          <dt>{t("migration.minimum")}</dt>
          <dd>
            {formatAmount(
              bounds.min_destination_shares,
              m.destinationShareDecimals,
            )}
          </dd>
        </div>
        <div>
          <dt>{t("migration.expected")}</dt>
          <dd>
            {formatAmount(
              review.expectedDestinationSharesRaw!,
              m.destinationShareDecimals,
            )}
          </dd>
        </div>
        <div>
          <dt>{t("fee.maximum")}</dt>
          <dd>{formatAmount(review.feeMaximumStroops, 7)} XLM</dd>
        </div>
        <div>
          <dt>{t("review.expiry")}</dt>
          <dd>
            {new Date(Number(i.valid_before_time) * 1000).toLocaleTimeString()}{" "}
            · {t("app.expiry_ledger", { ledger: i.valid_before_ledger })}
          </dd>
        </div>
      </dl>
      <p>{t("migration.guarantee")}</p>
      <p>{t("migration.refund_note")}</p>
      <details className="review-details">
        <summary>{t("migration.internal_details")}</summary>
        <p>
          {t("migration.settlement")}: {settlement.symbol}
        </p>
        {bundle.profile.assets.map((a, n) => {
          const token = bundle.tokens.find((t) => t.address === a.asset)!;
          return (
            <div className="migration-bound" key={a.asset}>
              <Identity label={token.symbol} value={token.address} />
              <p>
                {t("review.withdraw_minima")}:{" "}
                {formatAmount(i.min_withdraw[n]!, token.decimals)}{" "}
                {token.symbol}
              </p>
              {a.asset !== settlement.address && (
                <p>
                  {t("redemption.swap_minimum", { token: settlement.symbol })}:{" "}
                  {formatAmount(i.min_swap[n]!, settlement.decimals)}{" "}
                  {settlement.symbol}
                </p>
              )}
            </div>
          );
        })}
        <p>
          {t("migration.internal_minimum")}:{" "}
          {formatAmount(i.min_receive, settlement.decimals)} {settlement.symbol}
        </p>
        {m.destination_assets.map((a, n) => {
          const token = bundle.tokens.find((t) => t.address === a.asset)!;
          return (
            <div className="migration-bound" key={a.asset}>
              <Identity label={token.symbol} value={token.address} />
              <p>
                {t("migration.deposit_minimum")}:{" "}
                {formatAmount(bounds.min_deposit[n]!, token.decimals)}{" "}
                {token.symbol}
              </p>
              {a.pair && (
                <p>
                  {t("success.spent")}:{" "}
                  {formatAmount(bounds.convert_inputs[n]!, settlement.decimals)}{" "}
                  {settlement.symbol}
                </p>
              )}
            </div>
          );
        })}
        <Identity label={t("contracts.guard")} value={bundle.guard} link />
        <Identity label={t("contracts.profile")} value={bundle.profileHash} />
        <Identity label={t("action.recipient")} value={i.owner} />
      </details>
      {stale && <p role="status">{t("review.expired")}</p>}
      <label className="check-field">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={signing}
          onChange={onConfirm}
        />
        <span>{t("migration.confirm")}</span>
      </label>
      <div className="tool-actions">
        <button
          className="button"
          disabled={!confirmed || signing || stale}
          onClick={onSign}
        >
          {t(signing ? "migration.signing" : "migration.sign")}
        </button>
        <button className="text-button" disabled={signing} onClick={onEdit}>
          {t("action.edit")}
        </button>
        {review.reviewId && (
          <button
            className="text-button"
            disabled={signing}
            onClick={() =>
              void navigator.clipboard
                .writeText(location.origin + "/review/" + review.reviewId)
                .then(() => setShared(true))
                .catch(() => {})
            }
          >
            {t(shared ? "common.copied" : "migration.share_review")}
          </button>
        )}
      </div>
    </section>
  );
}
