import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Layers,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import {
  ExitController,
  createExitDraft,
  formatAmount,
  parseAmount,
  rawAmount,
  latestLedger,
  reviewLedger,
  loadDeployment,
  verifyReview,
  signSetup,
  verifySetup,
  verifySetupSigned,
  rememberPending,
  readPendingRecords,
  MierkhatError,
  type AccountState,
  type DeploymentBundle,
  type ExitQuote,
  type Review,
  type SetupDraft,
  type SetupReview,
  type RecoveryRecord,
} from "@mierkhat/sdk";
import { api, reader } from "../api.js";
import { wallet } from "../wallet.js";
import { t } from "../copy.js";
import {
  Busy,
  ErrorNotice,
  Identity,
  icon,
  shorten,
} from "../components/Shared.js";
import { SubmissionRecovery } from "../components/SubmissionRecovery.js";
import { ReviewPanel, SetupPanel } from "../components/Review.js";
export interface WalletIdentity {
  address: string;
  networkPassphrase: string;
}
export function Workspace({
  bundle,
  identity,
  connect,
  disconnect,
}: {
  bundle: DeploymentBundle;
  identity?: WalletIdentity;
  connect: () => Promise<void>;
  disconnect: () => void;
}) {
  const [account, setAccount] = useState<AccountState>(),
    [mode, setMode] = useState<"exit" | "deposit">("exit"),
    [shares, setShares] = useState(""),
    [amounts, setAmounts] = useState<string[]>(
      bundle.profile.assets.map(() => ""),
    ),
    [minimum, setMinimum] = useState(""),
    [movement, setMovement] = useState("50"),
    [quote, setQuote] = useState<ExitQuote>(),
    [review, setReview] = useState<Review>(),
    [setup, setSetup] = useState<SetupReview>(),
    [busy, setBusy] = useState(false),
    [signing, setSigning] = useState(false),
    [error, setError] = useState<unknown>(),
    [confirmed, setConfirmed] = useState(false),
    [unsent, setUnsent] = useState<{
      hash: string;
      send: () => Promise<unknown>;
      record: RecoveryRecord;
      saved: boolean;
    }>(),
    [balanceLoading, setBalanceLoading] = useState(false);
  const generation = useRef(0),
    controller = useRef(new ExitController()),
    prompt = useRef(false);
  const owner = identity?.address,
    settlement = bundle.tokens.find(
      (t) => t.address === bundle.profile.settlement,
    )!;
  const refresh = useCallback(async () => {
    if (!owner) return;
    setBalanceLoading(true);
    try {
      const result = await api.account(owner);
      setAccount(result);
    } catch (e) {
      setError(e);
    } finally {
      setBalanceLoading(false);
    }
  }, [owner]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      clearInterval(timer);
      generation.current++;
      controller.current.invalidate();
    };
  }, [refresh]);
  useEffect(() => {
    try {
      const records = readPendingRecords(localStorage);
      const pending = records.find(
        (r) => !r.terminal && !!r.kind && (!r.owner || r.owner === owner),
      );
      if (pending) location.replace("/receipt/" + pending.hash);
    } catch {}
  }, []);
  function invalidate() {
    generation.current++;
    controller.current.invalidate();
    setReview(undefined);
    setSetup(undefined);
    setConfirmed(false);
    setError(undefined);
  }
  function changeMode(v: "exit" | "deposit") {
    invalidate();
    setMode(v);
    setQuote(undefined);
  }
  async function work(fn: () => Promise<void>) {
    if (prompt.current) return;
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function assertAccount(): string {
    if (!identity || identity.networkPassphrase !== bundle.networkPassphrase)
      throw new MierkhatError("Identity", "network.wrong");
    return identity.address;
  }
  async function prepareTrust() {
    await work(async () => {
      const owner = assertAccount(),
        draft: SetupDraft = {
          kind: "trustlines",
          owner,
          amountsRaw: [],
          minimumsRaw: [],
          trustAssets: account!.tokens
            .filter((t) => !t.trusted)
            .map((t) => t.address),
        },
        g = ++generation.current;
      const r = await api.setupPrepare(draft);
      verifySetup(r, draft, bundle, await reviewLedger(reader, owner));
      if (g === generation.current) {
        setSetup(r);
        setConfirmed(false);
      }
    });
  }
  async function prepareRestore() {
    invalidate();
    await work(async () => {
      const owner = assertAccount(),
        g = ++generation.current,
        draft: SetupDraft = {
          kind: "restore",
          owner,
          amountsRaw: [],
          minimumsRaw: [],
          trustAssets: [],
        },
        r = await api.setupPrepare(draft);
      verifySetup(r, draft, bundle, await reviewLedger(reader, owner));
      if (g === generation.current) setSetup(r);
    });
  }
  async function getQuote() {
    invalidate();
    setQuote(undefined);
    await work(async () => {
      const owner = assertAccount(),
        raw = parseAmount(shares, bundle.shareDecimals);
      if (BigInt(raw) > BigInt(account?.sharesRaw ?? "0"))
        throw new MierkhatError("Balance", "exit.balance");
      const g = generation.current,
        q = await api.quote(owner, raw);
      if (g !== generation.current) return;
      setQuote(q);
      setMinimum(
        formatAmount(
          (BigInt(q.receiveRaw) * (10000n - BigInt(movement))) / 10000n + "",
          settlement.decimals,
        ),
      );
    });
  }
  async function prepare() {
    invalidate();
    await work(async () => {
      const owner = assertAccount(),
        g = generation.current;
      if (mode === "deposit") {
        const amountsRaw = amounts.map((v, i) => {
          const token = bundle.tokens.find(
            (t) => t.address === bundle.profile.assets[i]!.asset,
          )!;
          const raw = parseAmount(v, token.decimals),
            balance = account!.tokens.find(
              (t) => t.address === token.address,
            )!.balanceRaw;
          if (BigInt(raw) > BigInt(balance))
            throw new MierkhatError("Balance", "exit.balance");
          return raw;
        });
        const d: SetupDraft = {
            kind: "deposit",
            owner,
            amountsRaw,
            minimumsRaw: amountsRaw.map((v) =>
              ((BigInt(v) * 9950n) / 10000n).toString(),
            ),
            trustAssets: [],
          },
          r = await api.setupPrepare(d);
        verifySetup(r, d, bundle, await reviewLedger(reader, owner));
        if (g === generation.current) setSetup(r);
        return;
      }
      if (
        !quote ||
        quote.sharesRaw !== parseAmount(shares, bundle.shareDecimals) ||
        Date.now() / 1000 - Number(quote.timestamp) > 20
      )
        throw new MierkhatError("QuoteExpired", "exit.quote_expired");
      const min = parseAmount(minimum, settlement.decimals);
      if (BigInt(min) > BigInt(quote.receiveRaw))
        throw new MierkhatError("Minimum", "exit.high_minimum");
      const l = await latestLedger(reader),
        floor = (v: string) => {
          const n = (BigInt(v) * (10000n - BigInt(movement))) / 10000n;
          return (n > 0n ? n : 1n).toString();
        };
      const d = createExitDraft({
        environment: "testnet",
        epoch: bundle.epoch,
        intent: {
          schema: 1,
          network_id: bundle.profile.network_id,
          guard: bundle.guard,
          profile_hash: bundle.profileHash,
          owner,
          recipient: owner,
          shares: quote.sharesRaw,
          min_withdraw: quote.withdrawnRaw.map(floor),
          min_swap: quote.swappedRaw.map((v, i) =>
            bundle.profile.assets[i]!.asset === bundle.profile.settlement
              ? "0"
              : floor(v),
          ),
          min_receive: min,
          valid_before_time: (BigInt(l.timestamp) + 180n).toString(),
          valid_before_ledger: l.sequence + 36,
        },
      });
      controller.current.setDraft(d);
      const r = await controller.current.prepare(async (draft) =>
        verifyReview(
          await api.prepare(draft),
          draft,
          bundle,
          await reviewLedger(reader, owner),
        ),
      );
      if (r && g === generation.current) setReview(r);
    });
  }
  async function sendSaved(
    hash: string,
    send: () => Promise<unknown>,
    record: RecoveryRecord,
  ) {
    let saved = false;
    try {
      saved = rememberPending(record, localStorage);
    } catch {}
    if (!saved) {
      setUnsent({ hash, send, record, saved: false });
      return;
    }
    try {
      await send();
      location.assign("/receipt/" + hash);
    } catch {
      setUnsent({ hash, send, record, saved: true });
    }
  }
  async function sign() {
    if (prompt.current) return;
    prompt.current = true;
    setSigning(true);
    setError(undefined);
    const g = generation.current;
    try {
      const run = async () => {
        const owner = assertAccount();
        if (setup) {
          const bytes = await signSetup(setup, bundle, reader, wallet);
          if (g !== generation.current) return;
          const { hash } = verifySetupSigned(bytes, setup, bundle),
            record: RecoveryRecord = {
              environment: "testnet",
              epoch: bundle.epoch,
              hash,
              intentHash: "",
              kind: setup.draft.kind,
              owner,
              createdAt: new Date().toISOString(),
            };
          await sendSaved(hash, () => api.setupSubmit(bytes, setup), record);
        } else if (review) {
          const attempt = await controller.current.signExit(
            review,
            bundle,
            wallet,
            () => reviewLedger(reader, owner),
            () => loadDeployment(bundle, reader, owner),
          );
          if (!attempt || g !== generation.current) return;
          const record: RecoveryRecord = {
            environment: "testnet",
            epoch: bundle.epoch,
            hash: attempt.txHash,
            intentHash: review.intentHash,
            kind: "exit",
            owner,
            createdAt: new Date().toISOString(),
          };
          await sendSaved(attempt.txHash, () => api.submit(attempt), record);
        }
      };
      if (navigator.locks)
        await navigator.locks.request(
          "mierkhat-wallet-" + owner,
          { ifAvailable: true },
          async (lock) => {
            if (!lock) throw new MierkhatError("PromptOpen", "wallet.prompt");
            await run();
          },
        );
      else await run();
    } catch (e) {
      setError(e);
    } finally {
      prompt.current = false;
      setSigning(false);
    }
  }
  async function faucet() {
    await work(async () => {
      const owner = assertAccount(),
        r = await api.faucet(owner),
        record: RecoveryRecord = {
          environment: "testnet",
          epoch: bundle.epoch,
          hash: r.hash,
          intentHash: "",
          kind: "faucet",
          owner,
          createdAt: new Date().toISOString(),
        };
      try {
        rememberPending(record, localStorage);
      } catch {}
      location.assign("/receipt/" + r.hash);
    });
  }
  const trusted = account?.funded && account.tokens.every((t) => t.trusted),
    ready = !!identity && trusted,
    displayReview = !!review || !!setup;
  return (
    <main id="main" className="workspace wrap">
      <div className="workspace-title">
        <div>
          <p className="kicker">{bundle.vaultName}</p>
          <h1>{t("workspace.heading")}</h1>
          <p>{t("workspace.intro")}</p>
        </div>
        {identity ? (
          <button
            className="button secondary"
            disabled={busy || signing || !!unsent}
            onClick={disconnect}
          >
            <Wallet {...icon} />
            {shorten(identity.address)}
          </button>
        ) : (
          <button className="button" onClick={() => void connect()}>
            <Wallet {...icon} />
            {t("wallet.connect")}
          </button>
        )}
      </div>
      <div className="workspace-grid">
        <aside className="portfolio">
          <div className="portfolio-top">
            <h2>{t("workspace.portfolio")}</h2>
            <button
              className="text-button"
              disabled={!owner || balanceLoading}
              aria-label={t("workspace.refresh")}
              onClick={() => void refresh()}
            >
              <RefreshCw {...icon} />
            </button>
          </div>
          <span className="balance-label">{t("workspace.shares")}</span>
          <strong className="share-balance">
            {account?.sharesRaw !== undefined
              ? formatAmount(account.sharesRaw, bundle.shareDecimals)
              : t(owner ? "common.loading_balance" : "workspace.load")}
          </strong>
          <div className="portfolio-tokens">
            <h3>{t("workspace.tokens")}</h3>
            {bundle.tokens.map((token) => {
              const value = account?.tokens.find(
                (v) => v.address === token.address,
              );
              return (
                <div key={token.address}>
                  <span className="token-monogram">
                    {token.symbol.slice(-1)}
                  </span>
                  <b>{token.symbol}</b>
                  <span>
                    {value
                      ? formatAmount(value.balanceRaw, token.decimals)
                      : t("common.unknown")}
                  </span>
                </div>
              );
            })}
            {account?.nativeBalanceRaw && (
              <div>
                <span className="native-mark" aria-hidden="true" />
                <b>{t("wallet.native")}</b>
                <span>{formatAmount(account.nativeBalanceRaw, 7)}</span>
              </div>
            )}
          </div>
          {identity && (
            <>
              <p className="account-address">
                <span>{t("workspace.current_account")}</span>
                <code>{shorten(identity.address)}</code>
              </p>
              <button
                className="text-button"
                onClick={disconnect}
                disabled={signing}
              >
                {t("workspace.disconnect")}
              </button>
            </>
          )}
          <div className="portfolio-note">
            <ShieldCheck {...icon} />
            <p>{t("workspace.action_note")}</p>
          </div>
          <a className="text-link" href="/contracts">
            {t("route.contracts")}
            <ArrowUpRight {...icon} />
          </a>
        </aside>
        <div className="workspace-main">
          <ErrorNotice error={error} />
          {unsent && (
            <SubmissionRecovery
              hash={unsent.hash}
              saved={unsent.saved}
              retry={async () => {
                await unsent.send();
                location.assign("/receipt/" + unsent.hash);
              }}
            />
          )}
          {unsent ? null : !identity ? (
            <section className="connect-panel">
              <span className="connect-mark">
                <Wallet size={36} strokeWidth={1.2} aria-hidden="true" />
              </span>
              <h2>{t("workspace.ready")}</h2>
              <p>{t("workspace.connect_body")}</p>
              <button className="button" onClick={() => void connect()}>
                {t("wallet.connect")}
                <ArrowUpRight {...icon} />
              </button>
              <a
                className="text-link"
                href="https://www.freighter.app/"
                target="_blank"
                rel="noreferrer"
              >
                {t("workspace.install")}
                <ArrowUpRight {...icon} />
              </a>
              <div className="connect-route">
                <span>
                  <Layers {...icon} />
                  {t("home.flow_vault")}
                </span>
                <ChevronRight {...icon} />
                <span>
                  <ShieldCheck {...icon} />
                  {t("home.flow_guard")}
                </span>
              </div>
            </section>
          ) : displayReview ? (
            <>
              {review ? (
                <ReviewPanel
                  review={review}
                  bundle={bundle}
                  onEdit={invalidate}
                  onSign={() => void sign()}
                  signing={signing}
                  confirmed={confirmed}
                  onConfirm={() => setConfirmed(!confirmed)}
                />
              ) : (
                <SetupPanel
                  review={setup!}
                  bundle={bundle}
                  onEdit={invalidate}
                  onSign={() => void sign()}
                  signing={signing}
                  confirmed={confirmed}
                  onConfirm={() => setConfirmed(!confirmed)}
                />
              )}
            </>
          ) : (
            <>
              <section className="setup-strip">
                <div>
                  <h2>{t("setup.heading")}</h2>
                  <p>{t("setup.body")}</p>
                </div>
                <div className="setup-actions">
                  <button
                    className="button secondary small"
                    disabled={busy || !account || account.funded}
                    onClick={() =>
                      void work(async () => {
                        setAccount(await api.fund(assertAccount()));
                      })
                    }
                  >
                    {account?.funded ? (
                      <Check {...icon} />
                    ) : (
                      <Wallet {...icon} />
                    )}{" "}
                    {t(account?.funded ? "setup.funded" : "setup.fund")}
                  </button>
                  <button
                    className="button secondary small"
                    disabled={busy || !account?.funded || !!trusted}
                    onClick={() => void prepareTrust()}
                  >
                    {trusted && <Check {...icon} />}{" "}
                    {t(trusted ? "setup.trusted" : "setup.trust")}
                  </button>
                  <button
                    className="button secondary small"
                    disabled={busy || !trusted}
                    onClick={() => void faucet()}
                  >
                    {t("setup.faucet")}
                    <ArrowUpRight {...icon} />
                  </button>
                </div>
                <p className="fine-print">{t("setup.faucet_note")}</p>
              </section>
              <details className="maintenance">
                <summary>{t("restore.maintenance")}</summary>
                <p>{t("restore.body")}</p>
                <button
                  className="button secondary small"
                  disabled={busy || !account?.funded}
                  onClick={() => void prepareRestore()}
                >
                  {t("restore.action")}
                </button>
              </details>
              <div
                className="action-tabs"
                role="tablist"
                aria-label={t("workspace.heading")}
              >
                <button
                  role="tab"
                  aria-selected={mode === "exit"}
                  onClick={() => changeMode("exit")}
                  disabled={busy}
                >
                  {t("workspace.exit")}
                </button>
                <button
                  role="tab"
                  aria-selected={mode === "deposit"}
                  onClick={() => changeMode("deposit")}
                  disabled={busy}
                >
                  {t("workspace.deposit")}
                </button>
              </div>
              <section className="action-editor">
                <h2>
                  {t(mode === "exit" ? "exit.heading" : "deposit.heading")}
                </h2>
                <p className="muted">
                  {t(mode === "exit" ? "exit.intro" : "deposit.intro")}
                </p>
                {mode === "deposit" ? (
                  <>
                    {bundle.profile.assets.map((a, i) => {
                      const token = bundle.tokens.find(
                          (t) => t.address === a.asset,
                        )!,
                        balance = account?.tokens.find(
                          (t) => t.address === a.asset,
                        );
                      return (
                        <div className="amount-field" key={a.asset}>
                          <span>
                            {t("deposit.amount", { token: token.symbol })}
                            <button
                              type="button"
                              className="text-button"
                              disabled={!balance || busy}
                              onClick={(e) => {
                                e.preventDefault();
                                invalidate();
                                setAmounts((v) =>
                                  v.map((a, n) =>
                                    n === i
                                      ? formatAmount(
                                          balance!.balanceRaw,
                                          token.decimals,
                                        )
                                      : a,
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
                              autoComplete="off"
                              value={amounts[i]}
                              onChange={(e) => {
                                invalidate();
                                setAmounts((v) =>
                                  v.map((a, n) =>
                                    n === i ? e.target.value : a,
                                  ),
                                );
                              }}
                              disabled={!ready || busy}
                              aria-label={t("deposit.amount", {
                                token: token.symbol,
                              })}
                            />
                            <b>{token.symbol}</b>
                          </div>
                          <small>
                            {t("action.available")}{" "}
                            {balance
                              ? formatAmount(balance.balanceRaw, token.decimals)
                              : t("common.unknown")}
                          </small>
                        </div>
                      );
                    })}
                    <p className="fine-print">{t("deposit.note")}</p>
                    <button
                      className="button"
                      disabled={!ready || busy || amounts.some((v) => !v)}
                      onClick={() => void prepare()}
                    >
                      {busy ? <Busy /> : t("deposit.review")}
                      <ArrowUpRight {...icon} />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="amount-field">
                      <span>
                        {t("action.shares")}
                        <button
                          type="button"
                          className="text-button"
                          disabled={!account?.sharesRaw || busy}
                          onClick={(e) => {
                            e.preventDefault();
                            invalidate();
                            setQuote(undefined);
                            setShares(
                              formatAmount(
                                account!.sharesRaw!,
                                bundle.shareDecimals,
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
                          autoComplete="off"
                          value={shares}
                          disabled={!ready || busy}
                          onChange={(e) => {
                            invalidate();
                            setShares(e.target.value);
                            setQuote(undefined);
                          }}
                          aria-label={t("action.shares")}
                        />
                        <b>{t("app.shares_unit")}</b>
                      </div>
                      <small>
                        {t("action.available")}{" "}
                        {account?.sharesRaw
                          ? formatAmount(
                              account.sharesRaw,
                              bundle.shareDecimals,
                            )
                          : t("common.unknown")}
                      </small>
                    </div>
                    <label className="movement-field">
                      <span>{t("exit.slippage")}</span>
                      <select
                        value={movement}
                        disabled={busy}
                        onChange={(e) => {
                          invalidate();
                          setQuote(undefined);
                          setMovement(e.target.value);
                        }}
                      >
                        <option value="10">{t("movement.small")}</option>
                        <option value="50">{t("movement.medium")}</option>
                        <option value="100">{t("movement.large")}</option>
                      </select>
                    </label>
                    <button
                      className="button secondary"
                      disabled={!ready || busy || !shares}
                      onClick={() => void getQuote()}
                    >
                      {busy ? <Busy /> : t("exit.quote")}
                      <RefreshCw {...icon} />
                    </button>
                    {account?.sharesRaw === "0" && (
                      <p className="notice">{t("exit.no_shares")}</p>
                    )}
                    {quote && (
                      <div className="live-quote">
                        <div className="quote-heading">
                          <ShieldCheck {...icon} />
                          <h3>{t("exit.route")}</h3>
                          <span>
                            {t("exit.quote_time", { ledger: quote.ledger })}
                          </span>
                        </div>
                        {bundle.profile.assets.map((a, i) => {
                          const token = bundle.tokens.find(
                            (t) => t.address === a.asset,
                          )!;
                          return (
                            <div className="quote-route" key={a.asset}>
                              <span>
                                <b>
                                  {formatAmount(
                                    quote.withdrawnRaw[i]!,
                                    token.decimals,
                                  )}
                                </b>{" "}
                                {token.symbol}
                              </span>
                              <ChevronRight {...icon} />
                              <span>
                                <b>
                                  {formatAmount(
                                    quote.swappedRaw[i]!,
                                    settlement.decimals,
                                  )}
                                </b>{" "}
                                {settlement.symbol}
                              </span>
                            </div>
                          );
                        })}
                        <div className="quote-total">
                          <span>{t("exit.expected")}</span>
                          <strong>
                            {formatAmount(
                              quote.receiveRaw,
                              settlement.decimals,
                            )}{" "}
                            {settlement.symbol}
                          </strong>
                        </div>
                        <label className="amount-field minimum-field">
                          <span>{t("action.minimum")}</span>
                          <div>
                            <input
                              inputMode="decimal"
                              autoComplete="off"
                              value={minimum}
                              onChange={(e) => {
                                invalidate();
                                setMinimum(e.target.value);
                              }}
                              disabled={busy}
                              aria-label={t("action.minimum")}
                            />
                            <b>{settlement.symbol}</b>
                          </div>
                          <small>{t("exit.minimum_note")}</small>
                        </label>
                        <button
                          className="button"
                          onClick={() => void prepare()}
                          disabled={busy || !minimum}
                        >
                          {busy ? <Busy /> : t("action.review")}
                          <ArrowUpRight {...icon} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
