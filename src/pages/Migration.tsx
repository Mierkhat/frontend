import { useEffect, useRef, useState } from "react";
import {
  formatAmount,
  parseAmount,
  latestLedger,
  reviewLedger,
  verifyReview,
  signExit,
  rememberPending,
  MierkhatError,
  type AccountState,
  type MigrationQuote,
  type Review,
  type RecoveryRecord,
} from "@mierkhat/sdk";
import { api, migrationBundles, reader } from "../api.js";
import { wallet } from "../wallet.js";
import { t } from "../copy.js";
import { Busy, ErrorNotice, Identity } from "../components/Shared.js";
import { SubmissionRecovery } from "../components/SubmissionRecovery.js";
import { MigrationReviewPanel } from "../components/MigrationReview.js";
import { WatchButton } from "../components/Watches.js";
import type { WalletIdentity } from "./Workspace.js";
function validAmount(value: string, decimals: number) {
  try {
    return parseAmount(value, decimals);
  } catch {
    return "";
  }
}
export function Migration({
  identity,
  connect,
}: {
  identity?: WalletIdentity;
  connect: () => Promise<void>;
}) {
  const initial = new URLSearchParams(location.search).get("epoch");
  const [epoch, setEpoch] = useState(
      migrationBundles.find((b) => b.epoch === initial)?.epoch ??
        migrationBundles[0]?.epoch ??
        "",
    ),
    [shares, setShares] = useState(""),
    [minimum, setMinimum] = useState(""),
    [account, setAccount] = useState<AccountState>(),
    [quote, setQuote] = useState<MigrationQuote>(),
    [review, setReview] = useState<Review>(),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [signing, setSigning] = useState(false),
    [error, setError] = useState<unknown>(),
    [unsent, setUnsent] = useState<{
      hash: string;
      send: () => Promise<unknown>;
      saved: boolean;
    }>();
  const generation = useRef(0),
    abort = useRef(new AbortController()),
    prompt = useRef(false);
  const b = migrationBundles.find((b) => b.epoch === epoch),
    owner = identity?.address;
  const locked = busy || signing || !!unsent;
  function invalidate() {
    generation.current++;
    setReview(undefined);
    setConfirmed(false);
    setError(undefined);
  }
  useEffect(() => {
    generation.current++;
    abort.current.abort();
    abort.current = new AbortController();
    setQuote(undefined);
    setReview(undefined);
    setAccount(undefined);
    setConfirmed(false);
    setBusy(false);
    setShares("");
    setMinimum("");
    const g = generation.current;
    if (owner && b)
      void api
        .account(owner, b.epoch)
        .then((a) => {
          if (g === generation.current) setAccount(a);
        })
        .catch((e) => {
          if (g === generation.current) setError(e);
        });
    try {
      const d = JSON.parse(
        sessionStorage.getItem("mierkhat.watchReview") ?? "null",
      );
      if (
        d?.owner === owner &&
        d?.epoch === epoch &&
        d.kind === "migration" &&
        b
      ) {
        setShares(formatAmount(d.shares_raw, b.shareDecimals));
        setMinimum(
          formatAmount(d.minimum_raw, b.migration!.destinationShareDecimals),
        );
        sessionStorage.removeItem("mierkhat.watchReview");
      }
    } catch {}
    return () => {
      generation.current++;
      abort.current.abort();
    };
  }, [owner, identity?.networkPassphrase, epoch]);
  async function work(fn: () => Promise<void>) {
    if (prompt.current) return;
    const g = generation.current;
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      if (g === generation.current) setError(e);
    } finally {
      if (g === generation.current) setBusy(false);
    }
  }
  function assertOwner() {
    if (!identity || !b || identity.networkPassphrase !== b.networkPassphrase)
      throw new MierkhatError("Identity", "network.wrong");
    return identity.address;
  }
  async function getQuote() {
    invalidate();
    setQuote(undefined);
    await work(async () => {
      const owner = assertOwner(),
        g = generation.current,
        raw = parseAmount(shares, b!.shareDecimals);
      const q = await api.migrationQuote(owner, b!.epoch, raw, 50);
      if (g !== generation.current) return;
      setQuote(q);
      if (!minimum)
        setMinimum(
          formatAmount(
            q.draft.intent.migration!.min_destination_shares,
            b!.migration!.destinationShareDecimals,
          ),
        );
    });
  }
  async function prepare() {
    invalidate();
    await work(async () => {
      const owner = assertOwner(),
        g = generation.current;
      if (!quote) throw new MierkhatError("QuoteRequired", "exit.empty");
      // The fresh full-flow preflight is authoritative. Retain every reviewed
      // bound and conversion budget; changed conditions require a new quote.
      const q = quote;
      const draft = structuredClone(q.draft);
      draft.intent.migration!.min_destination_shares = parseAmount(
        minimum,
        b!.migration!.destinationShareDecimals,
      );
      const l = await latestLedger(reader);
      draft.intent.valid_before_time = (BigInt(l.timestamp) + 180n).toString();
      draft.intent.valid_before_ledger = l.sequence + 36;
      const r = await api.prepare(draft);
      verifyReview(r, draft, b!, await reviewLedger(reader, owner));
      if (g === generation.current) {
        setQuote(q);
        setReview(r);
      }
    });
  }
  async function sign() {
    if (prompt.current || !review || !b) return;
    prompt.current = true;
    setSigning(true);
    setError(undefined);
    const g = generation.current;
    try {
      const owner = assertOwner(),
        attempt = await signExit(
          review,
          b,
          wallet,
          reader,
          abort.current.signal,
        );
      if (!attempt || g !== generation.current) return;
      const record: RecoveryRecord = {
        environment: "testnet",
        epoch: b.epoch,
        hash: attempt.txHash,
        intentHash: review.intentHash,
        kind: "exit",
        owner,
        createdAt: new Date().toISOString(),
      };
      const send = () => api.submit(attempt);
      let saved = false;
      try {
        saved = rememberPending(record, localStorage);
      } catch {}
      if (!saved) {
        setUnsent({ hash: attempt.txHash, send, saved: false });
        return;
      }
      try {
        await send();
        location.assign("/receipt/" + attempt.txHash);
      } catch {
        setUnsent({ hash: attempt.txHash, send, saved: true });
      }
    } catch (e) {
      setError(e);
    } finally {
      prompt.current = false;
      setSigning(false);
    }
  }
  const m = b?.migration;
  return (
    <main id="main" className="wrap standard-page tools-page migration-page">
      <h1>{t("migration.heading")}</h1>
      <p>{t("migration.intro")}</p>
      {!b || !m ? (
        <p>{t("migration.empty")}</p>
      ) : (
        <>
          <p className="fine-print">{t("migration.scope")}</p>
          <ErrorNotice error={error} />
          <label className="tool-route">
            {t("migration.route")}
            <select
              disabled={locked}
              value={epoch}
              onChange={(e) => {
                invalidate();
                setEpoch(e.target.value);
              }}
            >
              {migrationBundles.map((b) => (
                <option key={b.epoch} value={b.epoch}>
                  {b.vaultName} → {b.migration!.destinationName}
                </option>
              ))}
            </select>
          </label>
          {!identity ? (
            <section className="tool-panel">
              <p>{t("migration.connect")}</p>
              <button className="button" onClick={() => void connect()}>
                {t("wallet.connect")}
              </button>
            </section>
          ) : (
            <>
              <section className="tool-panel">
                <Identity
                  label={t("migration.source")}
                  value={b.profile.vault.address}
                  link
                />
                <Identity
                  label={t("migration.destination")}
                  value={m.destination.address}
                  link
                />
                <p>
                  {t("migration.balance")}:{" "}
                  {account?.sharesRaw !== undefined
                    ? formatAmount(account.sharesRaw, b.shareDecimals)
                    : t("common.loading_balance")}
                </p>
                {account?.tokens.some((t) => !t.trusted) && (
                  <a className="text-link" href="/app">
                    {t("plan.setup")}
                  </a>
                )}
                {unsent ? (
                  <SubmissionRecovery
                    hash={unsent.hash}
                    saved={unsent.saved}
                    retry={async () => {
                      await unsent.send();
                      location.assign("/receipt/" + unsent.hash);
                    }}
                  />
                ) : review ? (
                  <MigrationReviewPanel review={review} bundle={b} onEdit={invalidate} onSign={()=>void sign()} signing={signing} confirmed={confirmed} onConfirm={()=>setConfirmed(!confirmed)}/>
                ) : (
                  <>
                    <label className="amount-field">
                      <span>
                        {t("migration.shares")}
                        <button
                          className="text-button"
                          disabled={locked || !account?.sharesRaw}
                          onClick={() => {
                            invalidate();
                            setQuote(undefined);
                            setShares(
                              formatAmount(
                                account!.sharesRaw!,
                                b.shareDecimals,
                              ),
                            );
                          }}
                        >
                          {t("action.max")}
                        </button>
                      </span>
                      <div>
                        <input
                          inputMode="decimal"
                          aria-label={t("migration.shares")}
                          value={shares}
                          disabled={locked}
                          onChange={(e) => {
                            invalidate();
                            setQuote(undefined);
                            setShares(e.target.value);
                            setMinimum("");
                          }}
                        />
                        <b>{t("app.shares_unit")}</b>
                      </div>
                    </label>
                    <button
                      className="button secondary"
                      disabled={
                        locked ||
                        !shares ||
                        !account?.funded ||
                        account.tokens.some((t) => !t.trusted)
                      }
                      onClick={() => void getQuote()}
                    >
                      {t("migration.quote")}
                    </button>
                    {quote && (
                      <div className="migration-quote">
                        <dl className="tool-facts">
                          <div>
                            <dt>{t("migration.expected")}</dt>
                            <dd>
                              {formatAmount(
                                quote.destinationSharesRaw,
                                m.destinationShareDecimals,
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt>{t("migration.remainder")}</dt>
                            <dd>
                              {account?.sharesRaw &&
                              BigInt(account.sharesRaw) >=
                                BigInt(quote.draft.intent.shares)
                                ? formatAmount(
                                    (
                                      BigInt(account.sharesRaw) -
                                      BigInt(quote.draft.intent.shares)
                                    ).toString(),
                                    b.shareDecimals,
                                  )
                                : t("common.unknown")}
                            </dd>
                          </div>
                        </dl>
                        <label className="amount-field minimum-field">
                          <span>{t("migration.minimum")}</span>
                          <div>
                            <input
                              inputMode="decimal"
                              aria-label={t("migration.minimum")}
                              value={minimum}
                              disabled={locked}
                              onChange={(e) => {
                                invalidate();
                                setMinimum(e.target.value);
                              }}
                            />
                            <b>{t("app.shares_unit")}</b>
                          </div>
                        </label>
                        <p>{t("migration.refund_note")}</p>
                        <details>
                          <summary>{t("migration.deposit")}</summary>
                          {quote.depositedRaw.map((v, i) => {
                            const token = b.tokens.find(
                              (t) =>
                                t.address === m.destination_assets[i]!.asset,
                            )!;
                            return (
                              <p key={token.address}>
                                {formatAmount(v, token.decimals)} {token.symbol}
                              </p>
                            );
                          })}
                          <h3>{t("migration.refund")}</h3>
                          {quote.refundsRaw.map((v, i) => {
                            const token = b.tokens.find(
                              (t) => t.address === quote.refundAssets[i],
                            )!;
                            return (
                              <p key={token.address}>
                                {formatAmount(v, token.decimals)} {token.symbol}
                              </p>
                            );
                          })}
                        </details>
                        <div className="tool-actions">
                          <button
                            className="button"
                            disabled={locked || !minimum}
                            onClick={() => void prepare()}
                          >
                            {t("migration.review")}
                          </button>
                          <WatchButton
                            owner={identity.address}
                            bundle={b}
                            shares={quote.draft.intent.shares}
                            minimum={validAmount(
                              minimum,
                              m.destinationShareDecimals,
                            )}
                            kind="migration"
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
                {busy && <Busy label={t("migration.quote")} />}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
