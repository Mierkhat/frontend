import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ShieldCheck, Clock, Share2 } from "lucide-react";
import {
  formatAmount,
  type DeploymentBundle,
  type Review,
  type SetupReview,
} from "@mierkhat/sdk";
import { t } from "../copy.js";
import { Busy, Identity, icon } from "./Shared.js";
import { RedemptionOutput } from "./RedemptionOutput.js";
function useReviewHeading(digest: string) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [digest]);
  return heading;
}
export function ReviewPanel({
  review,
  bundle,
  onEdit,
  onSign,
  signing,
  confirmed,
  onConfirm,
  onRefresh,
  onNext,
  onPrevious,
}: {
  review: Review;
  bundle: DeploymentBundle;
  onEdit: () => void;
  onSign: () => void;
  signing: boolean;
  confirmed: boolean;
  onConfirm: () => void;
  onRefresh?: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  changed?: boolean;
}) {
  const heading = useReviewHeading(review.envelopeDigest);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stale = now / 1000 - Number(review.preparedTime) > 20;
  const token = bundle.tokens.find(
    (v) => v.address === bundle.profile.settlement,
  )!;
  const [shared, setShared] = useState(false);
  return (
    <section className="review-panel">
      <div className="panel-top">
        <span className="section-label">
          <ShieldCheck {...icon} />
          {t("review.exact")}
        </span>
        <span className="quote-age">
          <Clock {...icon} />
          {t("review.age", { ledger: review.preparedLedger })}
        </span>
      </div>
      <h2 ref={heading} tabIndex={-1}>
        {t("review.heading")}
      </h2>
      <RedemptionOutput bundle={bundle} />
      <p className="muted">{t("review.intro")}</p>
      <div className="review-amounts">
        <div>
          <span>{t("success.spent")}</span>
          <strong>
            {formatAmount(review.draft.intent.shares, bundle.shareDecimals)}
            <small>{t("app.shares_unit")}</small>
          </strong>
        </div>
        <div className="minimum-result">
          <span>{t("action.minimum")}</span>
          <strong>
            {formatAmount(review.draft.intent.min_receive, token.decimals)}
            <small>{token.symbol}</small>
          </strong>
        </div>
      </div>
      <dl className="review-facts">
        <div>
          <dt>{t("withdrawal.from")}</dt>
          <dd>{bundle.vaultName}</dd>
        </div>
        <div>
          <dt>{t("action.expected")}</dt>
          <dd>
            {formatAmount(review.expectedReceiveRaw, token.decimals)}{" "}
            {token.symbol}
          </dd>
        </div>
        <div>
          <dt>{t("fee.maximum")}</dt>
          <dd>{formatAmount(review.feeMaximumStroops, 7)} XLM</dd>
        </div>
        <div>
          <dt>{t("review.expiry")}</dt>
          <dd>
            {new Date(
              Number(review.draft.intent.valid_before_time) * 1000,
            ).toLocaleTimeString()}
            <br />
            {t("app.expiry_ledger", {
              ledger: review.draft.intent.valid_before_ledger,
            })}
          </dd>
        </div>
      </dl>
      <details className="review-details">
        <summary>{t("redemption.internal_details")}</summary>
        <p className="internal-route-note">
          {t("redemption.internal_note", { token: token.symbol })}
        </p>
        {bundle.profile.assets.map((a, n) => {
          const asset = bundle.tokens.find((t) => t.address === a.asset)!;
          return (
            <div className="internal-route-leg" key={a.asset}>
              <h3>
                {a.asset === token.address
                  ? t("redemption.direct_leg", { token: token.symbol })
                  : t("redemption.swap_leg", {
                      from: asset.symbol,
                      to: token.symbol,
                    })}
              </h3>
              <dl className="review-facts">
                <div>
                  <dt>{t("review.withdraw_minima")}</dt>
                  <dd>
                    {formatAmount(
                      review.draft.intent.min_withdraw[n]!,
                      asset.decimals,
                    )}{" "}
                    {asset.symbol}
                  </dd>
                </div>
                {a.asset !== token.address && (
                  <div>
                    <dt>
                      {t("redemption.swap_minimum", { token: token.symbol })}
                    </dt>
                    <dd>
                      {formatAmount(
                        review.draft.intent.min_swap[n]!,
                        token.decimals,
                      )}{" "}
                      {token.symbol}
                    </dd>
                  </div>
                )}
              </dl>
              {a.asset === token.address && <p>{t("review.no_swap")}</p>}
            </div>
          );
        })}
      </details>
      <Identity
        label={t("action.recipient")}
        value={review.draft.intent.recipient}
      />
      <details className="review-details">
        <summary>{t("details.raw")}</summary>
        <Identity label={t("contracts.guard")} value={bundle.guard} link />
        <Identity label={t("contracts.profile")} value={review.profileHash} />
        <Identity label={t("contracts.asset")} value={token.address} link />
      </details>
      <p className="fine-print">{t("review.failure_fee")}</p>
      {stale ? (
        <div className="notice" role="status">
          {t("review.stale")}
        </div>
      ) : !onNext ? (
        <label className="check-field">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={onConfirm}
            disabled={signing}
          />
          <span>{t("review.confirm")}</span>
        </label>
      ) : null}
      <div className="action-buttons">
        <button
          className="button"
          disabled={signing || (!onNext && !confirmed) || stale}
          onClick={onNext ?? onSign}
        >
          {signing ? <Busy /> : t(onNext ? "withdrawal.next" : "action.sign")}
          <ArrowUpRight {...icon} />
        </button>
        <button
          className="button secondary"
          disabled={signing}
          onClick={onPrevious ?? (stale && onRefresh ? onRefresh : onEdit)}
        >
          {t(
            onPrevious
              ? "withdrawal.previous"
              : stale
                ? "review.new"
                : "action.edit",
          )}
        </button>
        {stale && onPrevious && onRefresh && (
          <button
            className="button secondary"
            onClick={onRefresh}
            disabled={signing}
          >
            {t("review.new")}
          </button>
        )}
        {review.reviewId && (
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  location.origin + "/review/" + review.reviewId,
                );
                setShared(true);
              } catch {}
            }}
          >
            <Share2 {...icon} />
            {t(shared ? "common.copied" : "review.share")}
          </button>
        )}
      </div>
    </section>
  );
}
export function SetupPanel({
  review,
  bundle,
  onEdit,
  onSign,
  signing,
  confirmed,
  onConfirm,
}: {
  review: SetupReview;
  bundle: DeploymentBundle;
  onEdit: () => void;
  onSign: () => void;
  signing: boolean;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  const heading = useReviewHeading(review.envelopeDigest);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const stale = now / 1000 - Number(review.preparedTime) > 20,
    isDeposit = review.draft.kind === "deposit",
    isRestore = review.draft.kind === "restore";
  return (
    <section className="review-panel">
      <span className="section-label">
        <ShieldCheck {...icon} />
        {t("review.exact")}
      </span>
      <h2 ref={heading} tabIndex={-1}>
        {t(
          isRestore
            ? "restore.heading"
            : isDeposit
              ? "deposit.review"
              : "setup.trust_review",
        )}
      </h2>
      <p className="muted">
        {t(
          isRestore
            ? "restore.body"
            : isDeposit
              ? "deposit.note"
              : "setup.trust_body",
        )}
      </p>
      {isRestore ? (
        <>
          <p className="fine-print">{t("restore.scope")}</p>
          <details className="review-details">
            <summary>{t("route.contracts")}</summary>
            <Identity label={t("contracts.guard")} value={bundle.guard} link />
            <Identity
              label={t("contracts.vault")}
              value={bundle.profile.vault.address}
              link
            />
            <Identity
              label={t("contracts.router")}
              value={bundle.profile.router.address}
              link
            />
            <Identity
              label={t("contracts.profile")}
              value={bundle.profileHash}
            />
          </details>
        </>
      ) : isDeposit ? (
        <>
          <div className="review-amounts">
            <div>
              <span>{t("deposit.expected_shares")}</span>
              <strong>
                {formatAmount(review.expectedSharesRaw, bundle.shareDecimals)}
                <small>{t("app.shares_unit")}</small>
              </strong>
            </div>
          </div>
          {bundle.profile.assets.map((a, i) => {
            const asset = bundle.tokens.find((v) => v.address === a.asset)!;
            return (
              <dl className="review-facts" key={a.asset}>
                <div>
                  <dt>{t("deposit.accepted")}</dt>
                  <dd>
                    {formatAmount(
                      review.expectedDepositedRaw[i]!,
                      asset.decimals,
                    )}{" "}
                    {asset.symbol}
                  </dd>
                </div>
                <div>
                  <dt>{t("deposit.minimum", { token: asset.symbol })}</dt>
                  <dd>
                    {formatAmount(review.draft.minimumsRaw[i]!, asset.decimals)}
                  </dd>
                </div>
              </dl>
            );
          })}
          <p className="fine-print">{t("deposit.shares_note")}</p>
        </>
      ) : (
        bundle.tokens
          .filter((v) => review.draft.trustAssets.includes(v.address))
          .map((v) => (
            <Identity key={v.address} label={v.symbol} value={v.address} link />
          ))
      )}
      <dl className="review-facts">
        <div>
          <dt>{t("fee.maximum")}</dt>
          <dd>{formatAmount(review.feeMaximumStroops, 7)} XLM</dd>
        </div>
        <div>
          <dt>{t("review.expiry")}</dt>
          <dd>
            {new Date(
              (Number(review.preparedTime) + 180) * 1000,
            ).toLocaleTimeString()}
          </dd>
        </div>
      </dl>
      {stale ? (
        <p className="notice" role="status">
          {t("review.stale")}
        </p>
      ) : (
        <label className="check-field">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={onConfirm}
            disabled={signing}
          />
          <span>{t("review.confirm")}</span>
        </label>
      )}
      <div className="action-buttons">
        <button
          className="button"
          onClick={onSign}
          disabled={!confirmed || signing || stale}
        >
          {signing ? <Busy /> : t("common.approve")}
          <ArrowUpRight {...icon} />
        </button>
        <button
          className="button secondary"
          disabled={signing}
          onClick={onEdit}
        >
          {t(stale ? "review.new" : "action.edit")}
        </button>
      </div>
    </section>
  );
}
