import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  ChevronLeft,
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
import { WithdrawalReadiness } from "../components/WithdrawalReadiness.js";
import { WatchButton } from "../components/Watches.js";
import { RedemptionOutput } from "../components/RedemptionOutput.js";
import { WithdrawalProgress } from "../components/WithdrawalProgress.js";
import { WithdrawalConfirmation } from "../components/WithdrawalConfirmation.js";
import { sharePreset, remainingPosition } from "../withdrawal.js";
export interface WalletIdentity {
  address: string;
  networkPassphrase: string;
}
export function Workspace({
  bundle,
  identity,
  connect,
  disconnect,
  mode,
  onModeChange,
  selection,
  onLockChange,
  positionSelected = true,
}: {
  bundle: DeploymentBundle;
  identity?: WalletIdentity;
  connect: () => Promise<void>;
  disconnect: () => void;
  mode: "exit" | "deposit";
  onModeChange: (mode: "exit" | "deposit") => void;
  selection?: ReactNode;
  onLockChange?: (locked: boolean) => void;
  positionSelected?: boolean;
}) {
  const editorId = useId();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const screen = useRef<HTMLDivElement>(null);
  const focusScreen = useRef(false);
  function navigate(next: 0 | 1 | 2 | 3) {
    focusScreen.current = true;
    setStep(next);
  }
  useEffect(() => {
    if (!focusScreen.current) return;
    const heading = screen.current?.querySelector<HTMLHeadingElement>("h2");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "start", behavior: "instant" });
    focusScreen.current = false;
  }, [step]);
  const [account, setAccount] = useState<AccountState>(),
    [shares, setShares] = useState(""),
    [sizeMode, setSizeMode] = useState<"shares" | "target">("shares"),
    [target, setTarget] = useState(""),
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
    [errorFocusRequest, setErrorFocusRequest] = useState(0),
    [withdrawalStage, setWithdrawalStage] = useState<
      "refreshing" | "preparing"
    >("preparing"),
    [confirmed, setConfirmed] = useState(false),
    [unsent, setUnsent] = useState<{
      hash: string;
      send: () => Promise<unknown>;
      record: RecoveryRecord;
      saved: boolean;
    }>(),
    [balanceLoading, setBalanceLoading] = useState(false);
  const busyRef = useRef(false);
  const watched = useRef<{ sharesRaw: string; minimumRaw: string } | undefined>(
    undefined,
  );
  const generation = useRef(0),
    controller = useRef(new ExitController()),
    prompt = useRef(false);
  useEffect(() => {
    onLockChange?.(busy || signing || !!unsent);
  }, [busy, signing, unsent, onLockChange]);
  const owner = identity?.address,
    settlement = bundle.tokens.find(
      (t) => t.address === bundle.profile.settlement,
    )!;
  const refresh = useCallback(async () => {
    if (!owner) return;
    setBalanceLoading(true);
    try {
      const result = await api.account(owner, bundle.epoch);
      setAccount(result);
    } catch (e) {
      setError(e);
    } finally {
      setBalanceLoading(false);
    }
  }, [owner, bundle.epoch]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!busyRef.current && !prompt.current) void refresh();
    }, 15000);
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
  useEffect(() => {
    try {
      const d = JSON.parse(
        sessionStorage.getItem("mierkhat.watchReview") ?? "null",
      );
      if (
        d?.owner === owner &&
        d?.epoch === bundle.epoch &&
        d.kind === "exit"
      ) {
        setShares(formatAmount(d.shares_raw, bundle.shareDecimals));
        rawAmount(d.minimum_raw);
        watched.current = {
          sharesRaw: d.shares_raw,
          minimumRaw: d.minimum_raw,
        };
        setMinimum(formatAmount(d.minimum_raw, settlement.decimals));
        setStep(1);
        if ([10, 50, 100].includes(d.movement_bps))
          setMovement(String(d.movement_bps));
        sessionStorage.removeItem("mierkhat.watchReview");
      }
    } catch {}
  }, [owner, bundle.epoch]);
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
    onModeChange(v);
    setQuote(undefined);
    setStep(0);
  }
  async function work(fn: () => Promise<void>) {
    if (prompt.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e);
      setErrorFocusRequest((request) => request + 1);
    } finally {
      busyRef.current = false;
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
      const r = await api.setupPrepare(draft, bundle.epoch);
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
        r = await api.setupPrepare(draft, bundle.epoch);
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
        q = await api.quote(owner, raw, bundle.epoch);
      if (g !== generation.current) return;
      setQuote(q);
      setMinimum(
        formatAmount(
          watched.current?.sharesRaw === raw
            ? watched.current.minimumRaw
            : (BigInt(q.receiveRaw) * (10000n - BigInt(movement))) / 10000n +
                "",
          settlement.decimals,
        ),
      );
    });
  }
  async function getTargetPlan() {
    invalidate();
    setQuote(undefined);
    await work(async () => {
      const owner = assertAccount(),
        g = generation.current;
      const raw = parseAmount(target, settlement.decimals);
      const plan = await api.plan(owner, bundle.epoch, raw, Number(movement));
      if (g !== generation.current) return;
      setShares(formatAmount(plan.quote.sharesRaw, bundle.shareDecimals));
      setQuote(plan.quote);
      setMinimum(formatAmount(raw, settlement.decimals));
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
          r = await api.setupPrepare(d, bundle.epoch);
        verifySetup(r, d, bundle, await reviewLedger(reader, owner));
        if (g === generation.current) setSetup(r);
        return;
      }
      const rawShares = parseAmount(shares, bundle.shareDecimals),
        min = parseAmount(minimum, settlement.decimals);
      if (BigInt(rawShares) > BigInt(account?.sharesRaw ?? "0"))
        throw new MierkhatError("Balance", "exit.balance");
      if (!quote || quote.sharesRaw !== rawShares)
        throw new MierkhatError("QuoteRequired", "exit.empty");
      let currentQuote = quote;
      if (Date.now() / 1000 - Number(currentQuote.timestamp) > 20) {
        setWithdrawalStage("refreshing");
        currentQuote = await api.quote(owner, rawShares, bundle.epoch);
        if (g !== generation.current) return;
        if (currentQuote.sharesRaw !== rawShares)
          throw new MierkhatError("QuoteMismatch", "route.unsupported");
        // A fresh estimate must never lower the minimum the user chose.
        setQuote(currentQuote);
      }
      setWithdrawalStage("preparing");
      if (BigInt(min) > BigInt(currentQuote.receiveRaw))
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
          shares: rawShares,
          min_withdraw: currentQuote.withdrawnRaw.map(floor),
          min_swap: currentQuote.swappedRaw.map((v, i) =>
            bundle.profile.assets[i]!.asset === bundle.profile.settlement
              ? "0"
              : floor(v),
          ),
          min_receive: min,
          valid_before_time: (BigInt(l.timestamp) + 180n).toString(),
          valid_before_ledger: l.sequence + 36,
        },
      });
      if (g !== generation.current) return;
      controller.current.setDraft(d);
      const r = await controller.current.prepare(async (draft) =>
        verifyReview(
          await api.prepare(draft),
          draft,
          bundle,
          await reviewLedger(reader, owner),
        ),
      );
      if (r && g === generation.current) {
        setReview(r);
        navigate(2);
      }
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
      setErrorFocusRequest((request) => request + 1);
    } finally {
      prompt.current = false;
      setSigning(false);
    }
  }
  async function faucet() {
    await work(async () => {
      const owner = assertAccount(),
        r = await api.faucet(owner, bundle.epoch),
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
    ready = !!identity && trusted && (mode !== "exit" || positionSelected),
    displayReview = !!review || !!setup;
  return (
    <main id="main" className="workspace wrap">
      <div className="workspace-title">
        <div>
          <p className="kicker">{bundle.vaultName}</p>
          <h1>
            {t(
              identity && mode === "exit"
                ? "withdrawal.heading"
                : "workspace.heading",
            )}
          </h1>
          <p>
            {t(
              identity && mode === "exit"
                ? "withdrawal.intro"
                : "workspace.intro",
            )}
          </p>
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
              disabled={!owner || balanceLoading || busy || signing || !!unsent}
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
          <a
            className="text-link"
            href={"/contracts?epoch=" + encodeURIComponent(bundle.epoch)}
          >
            {t("route.contracts")}
            <ArrowUpRight {...icon} />
          </a>
        </aside>
        <div
          className={
            mode === "exit"
              ? "workspace-main withdrawal-workspace"
              : "workspace-main"
          }
        >
          {owner && mode === "exit" && (
            <WithdrawalProgress stage={unsent ? 3 : step} />
          )}
          {owner &&
            !displayReview &&
            !unsent &&
            (mode === "deposit" || step === 0) && (
              <div
                className="action-tabs"
                role="tablist"
                aria-label={t("workspace.heading")}
                onKeyDown={(event) => {
                  if (
                    busy ||
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  const tabs = [
                    ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      '[role="tab"]',
                    ),
                  ];
                  const current = tabs.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                  if (current < 0) return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : (current +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            tabs.length) %
                          tabs.length;
                  tabs[next]?.focus();
                  tabs[next]?.click();
                }}
              >
                <button
                  role="tab"
                  id={editorId + "-exit"}
                  aria-controls={editorId}
                  tabIndex={mode === "exit" ? 0 : -1}
                  aria-selected={mode === "exit"}
                  onClick={() => changeMode("exit")}
                  disabled={busy}
                >
                  {t("workspace.exit")}
                </button>
                <button
                  role="tab"
                  id={editorId + "-deposit"}
                  aria-controls={editorId}
                  tabIndex={mode === "deposit" ? 0 : -1}
                  aria-selected={mode === "deposit"}
                  onClick={() => changeMode("deposit")}
                  disabled={busy}
                >
                  {t("workspace.deposit")}
                </button>
              </div>
            )}
          <div
            ref={screen}
            className={
              owner && mode === "exit" ? "withdrawal-screen" : undefined
            }
            data-step={mode === "exit" ? step : undefined}
          >
            {(mode === "deposit" || step === 0) && !displayReview && !unsent
              ? selection
              : null}
            <ErrorNotice error={error} focusRequest={errorFocusRequest} />
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
                {review && mode === "exit" && step === 3 ? (
                  <WithdrawalConfirmation
                    review={review}
                    bundle={bundle}
                    confirmed={confirmed}
                    signing={signing}
                    onConfirm={() => setConfirmed(!confirmed)}
                    onSign={() => void sign()}
                    onPrevious={() => {
                      setConfirmed(false);
                      navigate(2);
                    }}
                    onRefresh={() => {
                      navigate(1);
                      void prepare();
                    }}
                  />
                ) : review ? (
                  <ReviewPanel
                    review={review}
                    bundle={bundle}
                    onEdit={invalidate}
                    onSign={() => void sign()}
                    signing={signing}
                    confirmed={confirmed}
                    onConfirm={() => setConfirmed(!confirmed)}
                    onRefresh={() => {
                      navigate(1);
                      void prepare();
                    }}
                    onNext={() => {
                      setConfirmed(false);
                      navigate(3);
                    }}
                    onPrevious={() => {
                      invalidate();
                      navigate(1);
                    }}
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
            ) : mode === "exit" && step === 0 ? (
              <>
                <section className="withdrawal-selection-next">
                  <p>{t("withdrawal.selection_intro")}</p>
                  {!trusted && (
                    <p className="notice">
                      <a href="#wallet-tools">{t("withdrawal.setup_needed")}</a>
                    </p>
                  )}
                  <div className="action-buttons">
                    <button
                      className="button"
                      disabled={!ready || busy}
                      onClick={() => navigate(1)}
                    >
                      {t("withdrawal.next")}
                      <ChevronRight {...icon} />
                    </button>
                  </div>
                </section>
                <details
                  className="workspace-extras"
                  id="wallet-tools"
                  open={!trusted}
                >
                  <summary>{t("withdrawal.tools")}</summary>
                  <p>{t("withdrawal.tools_note")}</p>
                  <div className="setup-actions">
                    <button
                      className="button secondary small"
                      disabled={busy || !account || account.funded}
                      onClick={() =>
                        void work(async () => {
                          await api.fund(assertAccount());
                          await refresh();
                        })
                      }
                    >
                      {t(account?.funded ? "setup.funded" : "setup.fund")}
                    </button>
                    <button
                      className="button secondary small"
                      disabled={busy || !account?.funded || !!trusted}
                      onClick={() => void prepareTrust()}
                    >
                      {t(trusted ? "setup.trusted" : "setup.trust")}
                    </button>
                    <button
                      className="button secondary small"
                      disabled={busy || !trusted}
                      onClick={() => void faucet()}
                    >
                      {t("setup.faucet")}
                    </button>
                  </div>
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
                </details>
              </>
            ) : (
              <>
                <section
                  key={mode}
                  className="action-editor"
                  id={editorId}
                  role={mode === "exit" ? "region" : "tabpanel"}
                  aria-labelledby={
                    mode === "exit"
                      ? editorId + "-heading"
                      : editorId + "-" + mode
                  }
                  tabIndex={0}
                >
                  <h2 id={editorId + "-heading"} tabIndex={-1}>
                    {t(mode === "exit" ? "exit.heading" : "deposit.heading")}
                  </h2>
                  <p className="muted">
                    {mode === "exit"
                      ? t("exit.intro", {
                          vault: bundle.vaultName,
                          token: settlement.symbol,
                        })
                      : t("deposit.intro")}
                  </p>
                  {!trusted && (
                    <p className="notice">
                      <a href="#wallet-tools">{t("withdrawal.setup_needed")}</a>
                    </p>
                  )}
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
                                ? formatAmount(
                                    balance.balanceRaw,
                                    token.decimals,
                                  )
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
                      <label className="movement-field">
                        <span>{t("plan.mode")}</span>
                        <select
                          value={sizeMode}
                          disabled={busy}
                          onChange={(e) => {
                            invalidate();
                            setQuote(undefined);
                            setSizeMode(e.target.value as "shares" | "target");
                          }}
                        >
                          <option value="shares">{t("plan.shares")}</option>
                          <option value="target">{t("plan.receive")}</option>
                        </select>
                      </label>
                      {sizeMode === "shares" ? (
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
                          <div
                            className="withdrawal-presets"
                            role="group"
                            aria-label={t("withdrawal.presets")}
                          >
                            {[25, 50, 75, 100].map((percent) => (
                              <button
                                key={percent}
                                className="text-button"
                                disabled={
                                  !ready ||
                                  busy ||
                                  !account?.sharesRaw ||
                                  account.sharesRaw === "0"
                                }
                                onClick={() => {
                                  invalidate();
                                  setQuote(undefined);
                                  setShares(
                                    sharePreset(
                                      account!.sharesRaw!,
                                      percent,
                                      bundle.shareDecimals,
                                    ),
                                  );
                                }}
                              >
                                {percent === 100
                                  ? t("withdrawal.all")
                                  : t("withdrawal.preset", { percent })}
                              </button>
                            ))}
                          </div>
                          {account?.sharesRaw &&
                            remainingPosition(
                              account.sharesRaw,
                              shares,
                              bundle.shareDecimals,
                            ) !== undefined && (
                              <p className="withdrawal-remaining">
                                {t("withdrawal.remaining", {
                                  amount: remainingPosition(
                                    account.sharesRaw,
                                    shares,
                                    bundle.shareDecimals,
                                  )!,
                                })}
                              </p>
                            )}
                        </>
                      ) : (
                        <>
                          <p>{t("plan.intro")}</p>
                          <label className="amount-field">
                            <span>{t("plan.target")}</span>
                            <div>
                              <input
                                inputMode="decimal"
                                aria-label={t("plan.target")}
                                value={target}
                                disabled={!ready || busy}
                                onChange={(e) => {
                                  invalidate();
                                  setQuote(undefined);
                                  setTarget(e.target.value);
                                }}
                              />
                              <b>{settlement.symbol}</b>
                            </div>
                          </label>
                        </>
                      )}
                      <details className="withdrawal-protection">
                        <summary>{t("withdrawal.protection")}</summary>
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
                        <p className="fine-print">{t("exit.slippage_note")}</p>
                      </details>
                      <button
                        className="button secondary"
                        disabled={
                          !ready ||
                          busy ||
                          !(sizeMode === "shares" ? shares : target)
                        }
                        onClick={() =>
                          void (sizeMode === "shares"
                            ? getQuote()
                            : getTargetPlan())
                        }
                      >
                        {busy ? (
                          <Busy />
                        ) : (
                          t(
                            sizeMode === "shares"
                              ? "exit.quote"
                              : "plan.action",
                          )
                        )}
                        <RefreshCw {...icon} />
                      </button>
                      {account?.sharesRaw === "0" && (
                        <p className="notice">{t("exit.no_shares")}</p>
                      )}
                      {quote && (
                        <div className="live-quote">
                          {sizeMode === "target" && (
                            <p>
                              {t("plan.result", {
                                amount: formatAmount(
                                  quote.sharesRaw,
                                  bundle.shareDecimals,
                                ),
                              })}{" "}
                              {t("plan.note")}
                            </p>
                          )}
                          <div className="quote-heading">
                            <ShieldCheck {...icon} />
                            <h3>{t("exit.route")}</h3>
                            <span>
                              {t("exit.quote_time", { ledger: quote.ledger })}
                            </span>
                          </div>
                          <RedemptionOutput bundle={bundle} />
                          <details className="internal-quote-details">
                            <summary>
                              {t("redemption.internal_details")}
                            </summary>
                            <p className="internal-route-note">
                              {t("redemption.internal_note", {
                                token: settlement.symbol,
                              })}
                            </p>
                            <div className="quote-columns">
                              <span>{t("redemption.from_vault")}</span>
                              <span>
                                {t("redemption.contribution", {
                                  token: settlement.symbol,
                                })}
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
                                    {a.asset === settlement.address ? (
                                      t("exit.direct_output", {
                                        token: settlement.symbol,
                                      })
                                    ) : (
                                      <>
                                        <b>
                                          {formatAmount(
                                            quote.swappedRaw[i]!,
                                            settlement.decimals,
                                          )}
                                        </b>{" "}
                                        {settlement.symbol}
                                      </>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </details>
                          <div className="quote-total">
                            <span>
                              {t("redemption.estimated_wallet", {
                                token: settlement.symbol,
                              })}
                            </span>
                            <strong>
                              {formatAmount(
                                quote.receiveRaw,
                                settlement.decimals,
                              )}{" "}
                              {settlement.symbol}
                            </strong>
                          </div>
                          <p className="fine-print">
                            {t("withdrawal.quote_note")}
                          </p>
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
                                disabled={busy || sizeMode === "target"}
                                aria-label={t("action.minimum")}
                              />
                              <b>{settlement.symbol}</b>
                            </div>
                            <small>{t("exit.minimum_note")}</small>
                          </label>
                          <WatchButton
                            owner={owner!}
                            bundle={bundle}
                            shares={quote.sharesRaw}
                            minimum={(() => {
                              try {
                                return parseAmount(
                                  minimum,
                                  settlement.decimals,
                                );
                              } catch {
                                return "";
                              }
                            })()}
                            movementBps={Number(movement)}
                            kind="exit"
                          />
                        </div>
                      )}
                      <div className="action-buttons withdrawal-navigation">
                        <button
                          className="button secondary"
                          disabled={busy}
                          onClick={() => {
                            invalidate();
                            navigate(0);
                          }}
                        >
                          <ChevronLeft {...icon} />
                          {t("withdrawal.previous")}
                        </button>
                        <button
                          className="button"
                          disabled={!ready || busy || !quote || !minimum}
                          onClick={() => void prepare()}
                        >
                          {busy ? (
                            <Busy
                              label={t(
                                withdrawalStage === "refreshing"
                                  ? "exit.refreshing_quote"
                                  : "exit.preparing_review",
                              )}
                            />
                          ) : (
                            t("withdrawal.next")
                          )}
                          <ChevronRight {...icon} />
                        </button>
                      </div>
                    </>
                  )}
                </section>
                {owner && mode === "exit" && !displayReview && !unsent && (
                  <details className="workspace-extras readiness-tools">
                    <summary>{t("withdrawal.availability")}</summary>
                    <WithdrawalReadiness
                      owner={owner}
                      bundle={bundle}
                      onUse={(raw) => {
                        invalidate();
                        setQuote(undefined);
                        setSizeMode("shares");
                        setShares(formatAmount(raw, bundle.shareDecimals));
                      }}
                    />
                  </details>
                )}
                <details
                  className="workspace-extras"
                  id="wallet-tools"
                  open={!trusted}
                >
                  <summary>{t("withdrawal.tools")}</summary>
                  <p>{t("withdrawal.tools_note")}</p>
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
                            await api.fund(assertAccount());
                            await refresh();
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
                </details>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
