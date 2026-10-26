import { useEffect, useRef, useState } from "react";
import { t } from "@mierkhat/copy";
import {
  ExitController,
  formatAmount,
  intentHash,
  persistPending,
  validateBundle,
  validateIntent,
  verifyReview,
  watchExit,
  type DeploymentBundle,
  type ExitDraft,
  type Ledger,
  type Observation,
  type PendingPointer,
  type Review,
  type SignedAttempt,
  type WalletAdapter,
} from "@mierkhat/sdk";
export interface MierkhatReviewProps {
  deployment: DeploymentBundle;
  wallet: WalletAdapter;
  draft: ExitDraft;
  prepare: (draft: ExitDraft) => Promise<Review>;
  ledger: () => Promise<Ledger & { sourceSequence: string }>;
  verifyDeployment: () => Promise<unknown>;
  submit: (attempt: SignedAttempt) => Promise<unknown>;
  lookup: (hash: string) => Promise<Observation>;
  onReceipt: (observation: Observation) => void;
  onStatus: (status: string) => void;
}
export function MierkhatReview(props: MierkhatReviewProps) {
  const controller = useRef(new ExitController()),
    generation = useRef(0),
    lastMinimum = useRef<bigint | undefined>(undefined);
  const [review, setReview] = useState<Review>(),
    [status, setStatus] = useState("editing"),
    [pending, setPending] = useState<PendingPointer>(),
    [unsent, setUnsent] = useState<SignedAttempt>(),
    [confirmed, setConfirmed] = useState(false);
  const bundle = validateBundle(props.deployment);
  validateIntent(props.draft, bundle);
  const token = bundle.tokens.find(
    (t) => t.address === bundle.profile.settlement,
  )!;
  const lowered =
    lastMinimum.current !== undefined &&
    BigInt(props.draft.intent.min_receive) < lastMinimum.current;
  useEffect(() => {
    controller.current.setDraft(props.draft);
    setReview(undefined);
    setConfirmed(false);
    if (!pending) setStatus("editing");
    return () => {
      generation.current++;
      controller.current.invalidate();
    };
  }, [props.draft.revision, intentHash(props.draft.intent)]);
  useEffect(() => {
    props.onStatus(status);
  }, [status]);
  useEffect(() => {
    if (!pending) return;
    const abort = new AbortController();
    void (async () => {
      for await (const value of watchExit(
        pending.hash,
        () => props.lookup(pending.hash),
        abort.signal,
      )) {
        setStatus(value.state);
        if (value.state === "succeeded" || value.state === "failed") {
          props.onReceipt(value);
          return;
        }
      }
    })();
    return () => abort.abort();
  }, [pending?.hash]);
  async function send(attempt: SignedAttempt, pointer: PendingPointer) {
    setUnsent(undefined);
    setPending(pointer);
    setStatus("pending");
    try {
      await props.submit(attempt);
    } catch {
      setStatus("unknown");
    }
  }
  return (
    <section aria-label={t("action.review")}>
      <h2>{t("action.review")}</h2>
      <dl>
        <dt>{t("action.shares")}</dt>
        <dd>{formatAmount(props.draft.intent.shares, bundle.shareDecimals)}</dd>
        <dt>{t("action.minimum")}</dt>
        <dd>
          {formatAmount(props.draft.intent.min_receive, token.decimals)}{" "}
          {token.symbol}
        </dd>
        <dt>{t("action.recipient")}</dt>
        <dd>{props.draft.intent.recipient}</dd>
        <dt>{t("route.contracts")}</dt>
        <dd>{bundle.guard}</dd>
        <dd>{bundle.profile.vault.address}</dd>
        <dd>{bundle.profile.router.address}</dd>
        <dt>{t("review.expiry")}</dt>
        <dd>
          {t("app.expiry_ledger", {
            ledger: props.draft.intent.valid_before_ledger,
          })}
        </dd>
        <dd>
          {t("app.expiry_time", { time: props.draft.intent.valid_before_time })}
        </dd>
        {bundle.profile.assets.map((asset, n) => (
          <div key={asset.asset}>
            <dt>{asset.asset}</dt>
            <dd>
              {t("review.withdraw_minima")}:{" "}
              {props.draft.intent.min_withdraw[n]} {t("app.amount_raw")}
            </dd>
            <dd>
              {t("review.swap_minima")}: {props.draft.intent.min_swap[n]}{" "}
              {t("app.amount_raw")}
            </dd>
          </div>
        ))}
        {review && (
          <>
            <dt>{t("action.expected")}</dt>
            <dd>
              {formatAmount(review.expectedReceiveRaw, token.decimals)}{" "}
              {token.symbol}
            </dd>
            <dt>{t("fee.maximum")}</dt>
            <dd>{formatAmount(review.feeMaximumStroops, 7)} XLM</dd>
          </>
        )}
      </dl>
      <p>{t("review.failure_fee")}</p>
      {pending && (
        <p>
          {t("receipt.hash")}: <code>{pending.hash}</code>
        </p>
      )}
      <p role="status">
        {status === "pending"
          ? t("pending.heading")
          : status === "unknown"
            ? t("pending.unknown")
            : status === "signing"
              ? t("wallet.prompt")
              : status === "failed"
                ? t("failure.heading")
                : status === "succeeded"
                  ? t("success.heading")
                  : status === "unavailable"
                    ? t("service.unavailable")
                    : ""}
      </p>
      {lowered && (
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {t("app.minimum_confirm")}
        </label>
      )}
      {unsent && (
        <div>
          <p>{t("app.storage_before_send")}</p>
          <a
            href={`/receipt/${unsent.txHash}?environment=${bundle.environment}`}
          >
            {t("pending.recovery_link")}
          </a>
          <button
            onClick={() =>
              send(unsent, {
                environment: bundle.environment,
                epoch: bundle.epoch,
                hash: unsent.txHash,
                intentHash: review!.intentHash,
                createdAt: new Date().toISOString(),
              })
            }
          >
            {t("app.storage_continue")}
          </button>
        </div>
      )}
      <button
        disabled={
          status === "preparing" ||
          status === "signing" ||
          !!pending ||
          !!unsent ||
          (lowered && !confirmed)
        }
        onClick={async () => {
          const prompt = generation.current;
          try {
            if (!review) {
              setStatus("preparing");
              const candidate = await controller.current.prepare(
                async (draft) => {
                  await props.verifyDeployment();
                  return verifyReview(
                    await props.prepare(draft),
                    draft,
                    bundle,
                    await props.ledger(),
                  );
                },
              );
              if (candidate && prompt === generation.current) {
                setReview(candidate);
                setStatus("review");
                lastMinimum.current = BigInt(
                  candidate.draft.intent.min_receive,
                );
              }
            } else {
              setStatus("signing");
              const attempt = await controller.current.signExit(
                review,
                bundle,
                props.wallet,
                props.ledger,
                props.verifyDeployment,
              );
              if (attempt && prompt === generation.current) {
                const pointer = {
                  environment: bundle.environment,
                  epoch: bundle.epoch,
                  hash: attempt.txHash,
                  intentHash: review.intentHash,
                  createdAt: new Date().toISOString(),
                };
                let saved = false;
                try {
                  saved = persistPending(pointer, localStorage);
                } catch {}
                if (!saved) {
                  setUnsent(attempt);
                  setStatus("review");
                  return;
                }
                await send(attempt, pointer);
              }
            }
          } catch {
            if (prompt === generation.current) setStatus("unavailable");
          }
        }}
      >
        {review ? t("action.sign") : t("review.refresh")}
      </button>
      {status === "signing" && (
        <button
          onClick={() => {
            generation.current++;
            controller.current.invalidate();
            setStatus("review");
            controller.current.setDraft(props.draft);
          }}
        >
          {t("review.back")}
        </button>
      )}
    </section>
  );
}
