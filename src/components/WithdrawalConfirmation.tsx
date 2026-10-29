import { useEffect, useRef, useState } from "react";
import { Wallet, ChevronLeft } from "lucide-react";
import {
  formatAmount,
  type DeploymentBundle,
  type Review,
} from "@mierkhat/sdk";
import { t } from "../copy.js";
import { Busy, icon } from "./Shared.js";

export function WithdrawalConfirmation({
  review,
  bundle,
  confirmed,
  signing,
  onConfirm,
  onSign,
  onPrevious,
  onRefresh,
}: {
  review: Review;
  bundle: DeploymentBundle;
  confirmed: boolean;
  signing: boolean;
  onConfirm: () => void;
  onSign: () => void;
  onPrevious: () => void;
  onRefresh: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [review.envelopeDigest]);
  const stale = now / 1000 - Number(review.preparedTime) > 20;
  const token = bundle.tokens.find(
    (token) => token.address === bundle.profile.settlement,
  )!;
  return (
    <section className="review-panel wallet-confirmation">
      <span className="section-label">
        <Wallet {...icon} />
        {t("withdrawal.step_confirm")}
      </span>
      <h2 ref={heading} tabIndex={-1}>
        {t("withdrawal.wallet_heading")}
      </h2>
      <p>
        {t(signing ? "withdrawal.wallet_waiting" : "withdrawal.wallet_intro")}
      </p>
      <dl className="review-facts">
        <div>
          <dt>{t("withdrawal.from")}</dt>
          <dd>{bundle.vaultName}</dd>
        </div>
        <div>
          <dt>{t("success.spent")}</dt>
          <dd>
            {formatAmount(review.draft.intent.shares, bundle.shareDecimals)}{" "}
            {t("app.shares_unit")}
          </dd>
        </div>
        <div>
          <dt>{t("action.minimum")}</dt>
          <dd>
            {formatAmount(review.draft.intent.min_receive, token.decimals)}{" "}
            {token.symbol}
          </dd>
        </div>
        <div>
          <dt>{t("fee.maximum")}</dt>
          <dd>{formatAmount(review.feeMaximumStroops, 7)} XLM</dd>
        </div>
      </dl>
      <p className="fine-print">{t("review.failure_fee")}</p>
      {stale && !signing ? (
        <p className="notice" role="status">
          {t("review.stale")}
        </p>
      ) : (
        <label className="check-field">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={onConfirm}
            disabled={signing || stale}
          />
          <span>{t("review.confirm")}</span>
        </label>
      )}
      <div className="action-buttons">
        <button
          className="button"
          disabled={signing || !confirmed || stale}
          onClick={onSign}
        >
          {signing ? (
            <Busy label={t("withdrawal.wallet_waiting")} />
          ) : (
            t("action.sign")
          )}
          <Wallet {...icon} />
        </button>
        <button
          className="button secondary"
          onClick={onPrevious}
          disabled={signing}
        >
          <ChevronLeft {...icon} />
          {t("withdrawal.previous")}
        </button>
        {stale && !signing && (
          <button className="button secondary" onClick={onRefresh}>
            {t("review.new")}
          </button>
        )}
      </div>
    </section>
  );
}
