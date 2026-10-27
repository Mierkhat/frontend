import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Clock,
  Download,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldCheck,
  Share2,
} from "lucide-react";
import {
  formatAmount,
  hashSchema,
  readPendingRecords,
  rememberPending,
  rememberObservation,
  watchExit,
  type DeploymentBundle,
  type Observation,
  type RecoveryRecord,
} from "@mierkhat/sdk";
import { api, knownDeployments } from "../api.js";
import { t, type CopyKey } from "../copy.js";
import {
  Busy,
  ErrorNotice,
  Identity,
  PageHeading,
  icon,
  shorten,
} from "../components/Shared.js";
function records(): RecoveryRecord[] {
  try {
    return readPendingRecords(localStorage);
  } catch {
    return [];
  }
}
export function Activity() {
  const [items, setItems] = useState(records),
    [filter, setFilter] = useState("all"),
    [hash, setHash] = useState(""),
    [invalid, setInvalid] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setItems(records()), 3000);
    return () => clearInterval(timer);
  }, []);
  const filtered = items.filter(
    (r) =>
      filter === "all" || (filter === "pending" ? !r.terminal : !!r.terminal),
  );
  return (
    <main id="main" className="wrap standard-page">
      <PageHeading title={t("activity.heading")} intro={t("activity.scope")} />
      <form
        className="hash-search"
        onSubmit={(e) => {
          e.preventDefault();
          const h = hash.trim().toLowerCase();
          if (!hashSchema.safeParse(h).success) {
            setInvalid(true);
            return;
          }
          location.assign("/receipt/" + h);
        }}
      >
        <div>
          <label htmlFor="lookup-hash">{t("activity.lookup")}</label>
          <p>{t("activity.lookup_note")}</p>
        </div>
        <div className="search-control">
          <Search {...icon} />
          <input
            id="lookup-hash"
            autoComplete="off"
            value={hash}
            onChange={(e) => {
              setHash(e.target.value);
              setInvalid(false);
            }}
            aria-label={t("activity.hash_label")}
            maxLength={64}
          />
          <button className="button" type="submit">
            {t("activity.track")}
            <ArrowUpRight {...icon} />
          </button>
        </div>
        {invalid && (
          <p role="alert" className="field-error">
            {t("input.hash_required")}
          </p>
        )}
      </form>
      <div className="activity-controls">
        <h2>{t("nav.activity")}</h2>
        <label>
          <span className="sr-only">{t("activity.filter")}</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t("activity.all")}</option>
            <option value="pending">{t("activity.unresolved")}</option>
            <option value="terminal">{t("activity.terminal")}</option>
          </select>
        </label>
      </div>
      <div className="activity-list">
        {filtered.length ? (
          filtered.map((r) => (
            <a
              href={"/receipt/" + r.hash}
              key={r.hash}
              className="activity-row"
            >
              <span
                className={"activity-icon " + (r.terminal ? "terminal" : "")}
              >
                {r.state === "succeeded" ? (
                  <Check {...icon} />
                ) : (
                  <Clock {...icon} />
                )}
              </span>
              <div>
                <strong>
                  {r.kind
                    ? t(("activity.kind_" + r.kind) as CopyKey)
                    : t("receipt.hash")}
                </strong>
                <code>{shorten(r.hash)}</code>
              </div>
              <div className="activity-state">
                <span>
                  {t(
                    ("activity." +
                      (r.state ?? "recorded") +
                      "_state") as CopyKey,
                  )}
                </span>
                <small>{new Date(r.createdAt).toLocaleString()}</small>
              </div>
              <ArrowUpRight {...icon} />
            </a>
          ))
        ) : (
          <div className="empty-state">
            <Clock size={32} strokeWidth={1.2} aria-hidden="true" />
            <h3>{t("activity.empty")}</h3>
            <a className="text-link" href="/app">
              {t("home.open")}
              <ArrowUpRight {...icon} />
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
export function ReceiptPage({
  hash,
  bundle: initialBundle,
}: {
  hash: string;
  bundle: DeploymentBundle;
}) {
  const [observation, setObservation] = useState<Observation>(),
    [checking, setChecking] = useState(true),
    [saved, setSaved] = useState(true),
    [copied, setCopied] = useState(false);
  const valid = hashSchema.safeParse(hash).success;
  const [record] = useState<RecoveryRecord>(
    () =>
      records().find((r) => r.hash === hash) ?? {
        environment: "testnet",
        epoch: initialBundle.epoch,
        hash,
        intentHash: "",
        createdAt: new Date().toISOString(),
      },
  );
  const bundle =
    knownDeployments.find(
      (b) => b.profileHash === observation?.receipt?.profileHash,
    ) ??
    knownDeployments.find(
      (b) => b.epoch === record.epoch && b.environment === record.environment,
    ) ??
    initialBundle;
  useEffect(() => {
    if (!valid) return;
    try {
      setSaved(rememberPending(record, localStorage));
    } catch {
      setSaved(false);
    }
    const abort = new AbortController();
    void (async () => {
      for await (const o of watchExit(
        hash,
        () => api.status(hash),
        abort.signal,
      )) {
        setChecking(false);
        setObservation((prior) =>
          prior && (prior.state === "succeeded" || prior.state === "failed")
            ? prior
            : o,
        );
        try {
          rememberObservation(record, o, localStorage);
        } catch {}
      }
    })();
    return () => abort.abort();
  }, [hash]);
  async function refresh() {
    setChecking(true);
    try {
      const o = await api.status(hash);
      setObservation((prior) =>
        prior && (prior.state === "succeeded" || prior.state === "failed")
          ? prior
          : o,
      );
      try {
        rememberObservation(record, o, localStorage);
      } catch {}
    } finally {
      setChecking(false);
    }
  }
  if (!valid)
    return (
      <main id="main" className="wrap standard-page">
        <h1>{t("app.invalid_hash")}</h1>
        <a className="button" href="/activity">
          {t("nav.activity")}
        </a>
      </main>
    );
  const success = observation?.state === "succeeded",
    failed = observation?.state === "failed",
    receipt =
      observation?.receipt?.profileHash === bundle.profileHash
        ? observation.receipt
        : undefined,
    token = bundle.tokens.find((t) => t.address === bundle.profile.settlement)!;
  function download() {
    const data = {
      network: bundle.networkPassphrase,
      guard: bundle.guard,
      profileHash: bundle.profileHash,
      transaction: hash,
      observation,
    };
    const u = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = u;
    a.download = "mierkhat-" + hash + ".json";
    a.click();
    URL.revokeObjectURL(u);
  }
  return (
    <main id="main" className="wrap receipt-page">
      <a className="text-link" href="/activity">
        {t("nav.activity")}
        <ArrowUpRight {...icon} />
      </a>
      <div
        className={
          "receipt-status " + (success ? "success" : failed ? "failed" : "")
        }
      >
        <span className="receipt-symbol">
          {success ? (
            <Check size={40} strokeWidth={1.3} aria-hidden="true" />
          ) : (
            <Clock size={40} strokeWidth={1.3} aria-hidden="true" />
          )}
        </span>
        <p className="kicker">{t("home.network")}</p>
        <h1>
          {t(
            success
              ? "receipt.setup_success"
              : failed
                ? "failure.heading"
                : "receipt.waiting",
          )}
        </h1>
        <p>
          {t(
            success
              ? receipt
                ? "success.heading"
                : "receipt.no_guard"
              : failed
                ? "failure.body"
                : observation?.rawStatus === "SUCCESS_AWAITING_RECEIPT"
                  ? "receipt.awaiting_metadata"
                  : observation?.state === "unknown"
                    ? "pending.unknown"
                    : "pending.body",
          )}
        </p>
      </div>
      {receipt && (
        <section className="receipt-outcome">
          <div>
            <span>{t("success.spent")}</span>
            <strong>
              {formatAmount(receipt.sharesSpent, bundle.shareDecimals)}
              <small>{t("app.shares_unit")}</small>
            </strong>
          </div>
          <span className="outcome-check">
            <ShieldCheck size={32} aria-hidden="true" />
          </span>
          <div>
            <span>{t("success.received")}</span>
            <strong>
              {formatAmount(receipt.received, token.decimals)}
              <small>{token.symbol}</small>
            </strong>
          </div>
        </section>
      )}
      <section className="receipt-paper">
        <Identity label={t("receipt.hash")} value={hash} />
        <dl className="review-facts">
          <div>
            <dt>{t("common.status")}</dt>
            <dd>
              {observation
                ? t(("activity." + observation.state + "_state") as CopyKey)
                : t("receipt.checking_service")}
            </dd>
          </div>
          {observation?.ledger && (
            <div>
              <dt>{t("receipt.ledger")}</dt>
              <dd>{observation.ledger}</dd>
            </div>
          )}
          {observation?.actualFee && (
            <div>
              <dt>{t("fee.actual")}</dt>
              <dd>{formatAmount(observation.actualFee, 7)} XLM</dd>
            </div>
          )}
          {observation?.observedAt && (
            <div>
              <dt>{t("app.last_observation")}</dt>
              <dd>{new Date(observation.observedAt).toLocaleString()}</dd>
            </div>
          )}
        </dl>
        {receipt && (
          <>
            <Identity label={t("action.recipient")} value={receipt.owner} />
            <Identity
              label={t("contracts.profile")}
              value={receipt.profileHash}
            />
          </>
        )}
        <p className="fine-print">
          {t(saved ? "receipt.saved" : "pending.storage_unavailable")}
        </p>
        <div className="action-buttons">
          <button
            className="button secondary"
            onClick={() => void refresh()}
            disabled={checking}
          >
            {checking ? (
              <Busy />
            ) : (
              <>
                <RefreshCw {...icon} />
                {t("pending.check")}
              </>
            )}
          </button>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(location.href);
                setCopied(true);
              } catch {}
            }}
          >
            <Share2 {...icon} />
            {t(copied ? "common.copied" : "receipt.share")}
          </button>
          <a
            className="text-button"
            href={"https://stellar.expert/explorer/testnet/tx/" + hash}
            target="_blank"
            rel="noreferrer"
          >
            {t("receipt.original")}
            <ExternalLink {...icon} />
          </a>
          {observation && (success || failed) && (
            <button className="text-button" onClick={download}>
              <Download {...icon} />
              {t("receipt.download")}
            </button>
          )}
        </div>
      </section>
      <div className="receipt-next">
        <p>{t("receipt.resume_note")}</p>
        {(success || failed) && (
          <a className="button" href="/app">
            {t("action.another")}
            <ArrowUpRight {...icon} />
          </a>
        )}
      </div>
    </main>
  );
}
