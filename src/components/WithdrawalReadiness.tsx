import { useEffect, useRef, useState } from "react";
import {
  formatAmount,
  type DeploymentBundle,
  type WithdrawalReadiness as Result,
} from "@mierkhat/sdk";
import { api } from "../api.js";
import { t } from "../copy.js";
import { Busy, ErrorNotice } from "./Shared.js";
import { WatchButton } from "./Watches.js";
export function WithdrawalReadiness({
  owner,
  bundle,
  onUse,
  autoCheck = false,
}: {
  owner: string;
  bundle: DeploymentBundle;
  onUse?: (shares: string) => void;
  autoCheck?: boolean;
}) {
  const [result, setResult] = useState<Result>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setResult(undefined);
    setError(undefined);
    setBusy(false);
    if (autoCheck) void check();
    return () => {
      generation.current++;
    };
  }, [owner, bundle.epoch]);
  async function check() {
    const g = ++generation.current;
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.readiness(owner, bundle.epoch);
      if (g === generation.current) setResult(r);
    } catch (e) {
      if (g === generation.current) {
        setError(e);
        setResult(undefined);
      }
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  const token = bundle.tokens.find(
    (t) => t.address === bundle.profile.settlement,
  )!;
  return (
    <section className="withdrawal-readiness tool-panel">
      <h2>{t("readiness.heading")}</h2>
      <p>{t("readiness.coverage")}</p>
      <button
        className="button secondary small"
        disabled={busy}
        onClick={() => void check()}
      >
        {t(result ? "readiness.refresh" : "readiness.check")}
      </button>
      {busy && <Busy label={t("readiness.check")} />}
      <ErrorNotice error={error} />
      {result && (
        <div className="readiness-result" aria-live="polite">
          <h3>{t(("readiness." + result.status) as "readiness.full")}</h3>
          {result.observedLedger > 0 && (
            <small>
              {t("readiness.checked", { ledger: result.observedLedger })}
            </small>
          )}
          {result.holdingsRaw !== undefined && (
            <p>
              {t("readiness.holding")}:{" "}
              {formatAmount(result.holdingsRaw, bundle.shareDecimals)}
            </p>
          )}
          {result.testedSharesRaw && (
            <>
              <dl className="tool-facts">
                <div>
                  <dt>{t("readiness.tested")}</dt>
                  <dd>
                    {formatAmount(result.testedSharesRaw, bundle.shareDecimals)}
                  </dd>
                </div>
                <div>
                  <dt>{t("readiness.estimate")}</dt>
                  <dd>
                    {formatAmount(result.estimatedReceiveRaw!, token.decimals)}{" "}
                    {token.symbol}
                  </dd>
                </div>
                <div>
                  <dt>{t("readiness.fee")}</dt>
                  <dd>{formatAmount(result.feeMaximumStroops!, 7)} XLM</dd>
                </div>
              </dl>
              {onUse ? (
                <button
                  className="text-button"
                  onClick={() => onUse(result.testedSharesRaw!)}
                >
                  {t("readiness.open")}
                </button>
              ) : (
                <a
                  className="text-link"
                  href={"/app?epoch=" + encodeURIComponent(bundle.epoch)}
                >
                  {t("readiness.open")}
                </a>
              )}
              <WatchButton
                owner={owner}
                bundle={bundle}
                shares={result.testedSharesRaw}
                minimum={result.minimumReceiveRaw!}
                kind="exit"
              />
            </>
          )}
          {result.status === "setup" && (
            <p>
              {t(
                result.reason === "AccountUnfunded"
                  ? "readiness.unfunded"
                  : "readiness.trust",
              )}
            </p>
          )}
          {result.status === "blocked" && <p>{t("readiness.no_candidate")}</p>}
          {result.status === "unknown" && <p>{t("readiness.unavailable")}</p>}
          <p className="fine-print">{t("readiness.note")}</p>
        </div>
      )}
    </section>
  );
}
