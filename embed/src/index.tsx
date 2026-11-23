import { useEffect, useRef, useState } from "react";
import { t, type CopyKey } from "@mierkhat/copy";
import {
  ExitController,
  MierkhatError,
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
    lastMinimum = useRef<bigint | undefined>(undefined),
    flight = useRef(false), sending = useRef(false), terminal = useRef(false);
  const [review, setReview] = useState<Review>(),
    [status, setStatus] = useState("editing"),
    [pending, setPending] = useState<PendingPointer>(),
    [unsent, setUnsent] = useState<{ attempt: SignedAttempt; pointer: PendingPointer }>(),
    [retry, setRetry] = useState<{ attempt: SignedAttempt; pointer: PendingPointer }>(),
    [error, setError] = useState<CopyKey>(),
    [confirmed, setConfirmed] = useState(false);
  const [signedContext, setSignedContext] = useState<{ bundle: DeploymentBundle; review: Review }>();
  const bundle = validateBundle(signedContext?.bundle ?? props.deployment);
  const shownDraft = signedContext?.review.draft ?? props.draft;
  const shownReview = signedContext?.review ?? review;
  validateIntent(shownDraft, bundle);
  const token = bundle.tokens.find(
    (t) => t.address === bundle.profile.settlement,
  )!;
  const migration = bundle.migration,
    bounds = shownDraft.intent.migration;
  const currentMinimum =
    bounds?.min_destination_shares ?? shownDraft.intent.min_receive;
  const lowered =
    lastMinimum.current !== undefined &&
    BigInt(currentMinimum) < lastMinimum.current;
  useEffect(() => {
    controller.current.setDraft(props.draft);
    setReview(undefined);
    setConfirmed(false);
    setError(undefined);
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
        if (!sending.current || value.state === "succeeded" || value.state === "failed") setStatus(value.state);
        if (value.state === "succeeded" || value.state === "failed") {
          terminal.current = true;
          setRetry(undefined);
          setUnsent(undefined);
          props.onReceipt(value);
          return;
        }
      }
    })();
    return () => abort.abort();
  }, [pending?.hash]);
  async function send(attempt: SignedAttempt, pointer: PendingPointer) {
    if (sending.current || terminal.current) return;
    sending.current = true;
    setUnsent(undefined);
    setRetry({ attempt, pointer });
    setPending(pointer);
    setStatus("pending");
    try {
      await props.submit(attempt);
      setRetry(undefined);
    } catch {
      if (!terminal.current) setStatus("unknown");
    } finally { sending.current = false; }
  }
  async function prepareReview() {
    const prompt = generation.current;
    setError(undefined); setConfirmed(false); setReview(undefined); setStatus("preparing");
    controller.current.setDraft(props.draft);
    const candidate = await controller.current.prepare(async draft => {
      await props.verifyDeployment();
      return verifyReview(await props.prepare(draft), draft, bundle, await props.ledger());
    });
    if (candidate && prompt === generation.current) {
      setReview(candidate); setStatus("review");
      lastMinimum.current = BigInt(candidate.draft.intent.migration?.min_destination_shares ?? candidate.draft.intent.min_receive);
    }
  }
  return (
    <section aria-label={t("action.review")}>
      <h2>{t("action.review")}</h2>
      <p>
        {migration
          ? t("migration.notices")
          : t("redemption.only_output", { token: token.symbol })}
      </p>
      <dl>
        <dt>{t(migration ? "migration.destination" : "redemption.output")}</dt>
        <dd>{migration ? migration.destinationName : token.symbol}</dd>
        <dt>{t("contracts.asset")}</dt>
        <dd>{migration ? migration.destination.address : token.address}</dd>
        <dt>{t("action.shares")}</dt>
        <dd>{formatAmount(shownDraft.intent.shares, bundle.shareDecimals)}</dd>
        <dt>{t(migration ? "migration.minimum" : "action.minimum")}</dt>
        <dd>
          {formatAmount(
            currentMinimum,
            migration ? migration.destinationShareDecimals : token.decimals,
          )}{" "}
          {migration ? t("app.shares_unit") : token.symbol}
        </dd>
        <dt>{t("action.recipient")}</dt>
        <dd>{shownDraft.intent.recipient}</dd>
        <dt>{t("route.contracts")}</dt>
        <dd>{bundle.guard}</dd>
        <dd>{bundle.profile.vault.address}</dd>
        <dd>{bundle.profile.router.address}</dd>
        {migration && (
          <>
            <dd>{migration.destination.address}</dd>
            <dt>{t("migration.guarantee")}</dt>
            <dd>{t("migration.refund_note")}</dd>
          </>
        )}
        <dt>{t("review.expiry")}</dt>
        <dd>
          {t("app.expiry_ledger", {
            ledger: shownDraft.intent.valid_before_ledger,
          })}
        </dd>
        <dd>
          {t("app.expiry_time", { time: new Date(Number(shownDraft.intent.valid_before_time) * 1000).toISOString() })}
        </dd>
        <dt>{t("redemption.internal_details")}</dt>
        <dd>
          {t(migration ? "migration.settlement" : "redemption.internal_note", {
            token: token.symbol,
          })}
        </dd>
        {bundle.profile.assets.map((asset, n) => {
          const underlying = bundle.tokens.find(
            (candidate) => candidate.address === asset.asset,
          )!;
          return (
            <div key={asset.asset}>
              <dt>
                {asset.asset === token.address
                  ? t("redemption.direct_leg", { token: token.symbol })
                  : t("redemption.swap_leg", {
                      from: underlying.symbol,
                      to: token.symbol,
                    })}
              </dt>
              <dd>
                <code>{asset.asset}</code>
              </dd>
              <dd>
                {t("review.withdraw_minima")}:{" "}
                {formatAmount(
                  shownDraft.intent.min_withdraw[n]!,
                  underlying.decimals,
                )}{" "}
                {underlying.symbol}
              </dd>
              <dd>
                {asset.asset === token.address ? (
                  t("review.no_swap")
                ) : (
                  <>
                    {t("redemption.swap_minimum", { token: token.symbol })}:{" "}
                    {formatAmount(
                      shownDraft.intent.min_swap[n]!,
                      token.decimals,
                    )}{" "}
                    {token.symbol}
                  </>
                )}
              </dd>
            </div>
          );
        })}
        {shownReview && (
          <>
            <dt>{t("action.expected")}</dt>
            <dd>
              {formatAmount(
                migration
                  ? shownReview.expectedDestinationSharesRaw!
                  : shownReview.expectedReceiveRaw,
                migration ? migration.destinationShareDecimals : token.decimals,
              )}{" "}
              {migration ? t("app.shares_unit") : token.symbol}
            </dd>
            <dt>{t("fee.maximum")}</dt>
            <dd>{formatAmount(shownReview.feeMaximumStroops, 7)} XLM</dd>
          </>
        )}
      </dl>
      <p>{t("review.failure_fee")}</p>
      {!pending && !unsent && <p>{t("embed.freshness")}</p>}
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
      {error && <p role="alert">{t(error)}</p>}
      {review && !pending && !unsent && (
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          {t(lowered ? "app.minimum_confirm" : "review.confirm")}
        </label>
      )}
      {unsent && (
        <div>
          <p>{t("app.storage_before_send")}</p>
          <a
            href={`/receipt/${unsent.attempt.txHash}?environment=${unsent.pointer.environment}`}
          >
            {t("pending.recovery_link")}
          </a>
          <button
            onClick={() =>
              send(unsent.attempt, unsent.pointer)
            }
          >
            {t("app.storage_continue")}
          </button>
        </div>
      )}
      {retry && !terminal.current && status === "unknown" && <button onClick={() => void send(retry.attempt, retry.pointer)}>
        {t("embed.retry")}</button>}
      {review && !pending && !unsent && <button disabled={status === "preparing" || status === "signing"}
        onClick={async () => {
          if (flight.current) return;
          flight.current = true;
          try { await prepareReview(); }
          catch (e) { setError(e instanceof MierkhatError ? e.copyKey as CopyKey : "service.unavailable"); setStatus("unavailable"); }
          finally { flight.current = false; }
        }}>{t("review.refresh")}</button>}
      <button
        disabled={
          status === "preparing" ||
          status === "signing" ||
          !!pending ||
          !!unsent ||
          (!!review && !confirmed)
        }
        onClick={async () => {
          if (flight.current || pending || unsent) return;
          flight.current = true;
          const prompt = generation.current;
          try {
            if (!review) await prepareReview();
            else {
              if (!confirmed) return;
              setError(undefined); setStatus("signing");
              const attempt = await controller.current.signExit(review, bundle, props.wallet, props.ledger, props.verifyDeployment);
              if (attempt && prompt === generation.current) {
                setSignedContext({ bundle, review: attempt.review });
                const pointer = { environment: bundle.environment, epoch: bundle.epoch, hash: attempt.txHash,
                  intentHash: review.intentHash, createdAt: new Date().toISOString() };
                let saved = false;
                try { saved = persistPending(pointer, localStorage); } catch {}
                if (!saved) { setUnsent({ attempt, pointer }); setStatus("review"); return; }
                await send(attempt, pointer);
              }
            }
          } catch (e) {
            if (prompt === generation.current) {
              setError(e instanceof MierkhatError ? e.copyKey as CopyKey : "service.unavailable");
              setConfirmed(false);
              if (e instanceof MierkhatError && ["review.stale", "review.expired"].includes(e.copyKey)) setReview(undefined);
              setStatus("unavailable");
            }
          } finally { flight.current = false; }
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
