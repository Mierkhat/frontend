import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Info,
  Layers,
  Menu,
  Monitor,
  Moon,
  Sun,
  Wallet,
  X,
} from "lucide-react";
import {
  ExitController,
  MierkhatError,
  formatAmount,
  hashSchema,
  intentHash,
  latestLedger,
  loadDeployment,
  newIntentId,
  parseAmount,
  persistPending,
  reviewLedger,
  rpc,
  shareBalance,
  verifyReview,
  watchExit,
  type DeploymentBundle,
  type ExitDraft,
  type Observation,
  type PendingPointer,
  type Review,
  type SignedAttempt,
} from "@mierkhat/sdk";
import { api, bundles, knownDeployments } from "./api.js";
import { connectWallet, wallet } from "./wallet.js";
import { t, type CopyKey } from "./copy.js";
const iconProps = { "aria-hidden": true as const, strokeWidth: 1.75, size: 20 };
function Icon({ kind }: { kind: "clock" | "check" | "info" | "error" }) {
  const Component = {
    clock: Clock,
    check: Check,
    info: Info,
    error: CircleAlert,
  }[kind];
  return <Component {...iconProps} />;
}
function errorCopy(error: unknown): CopyKey {
  const key =
    error instanceof MierkhatError ? error.copyKey : "service.unavailable";
  try {
    t(key as CopyKey);
    return key as CopyKey;
  } catch {
    return "service.unavailable";
  }
}
function Identity({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  return (
    <div className="identity">
      <span>{label}</span>
      <code>{value}</code>
      <button
        className="quiet copy"
        aria-label={t("app.copy_identity")}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setCopyFailed(false);
          } catch {
            setCopied(false);
            setCopyFailed(true);
          }
        }}
      >
        <Copy {...iconProps} />
        {copied ? t("details.copied") : t("details.copy")}
      </button>
      <span role="status" className="sr-only">
        {copied
          ? t("details.copied")
          : copyFailed
            ? t("details.copy_failed")
            : ""}
      </span>
      {copyFailed && <p>{t("details.copy_failed")}</p>}
    </div>
  );
}
export function ThemeMenu() {
  const [choice, setChoice] = useState(() => {
    try {
      const v = localStorage.getItem("mierkhat.theme");
      return v === "light" || v === "dark" ? v : "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const theme =
        choice === "system" ? (media.matches ? "dark" : "light") : choice;
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", theme === "dark" ? "#101C17" : "#F5F2E8");
    };
    update();
    media.addEventListener("change", update);
    try {
      localStorage.setItem("mierkhat.theme", choice);
    } catch {}
    return () => media.removeEventListener("change", update);
  }, [choice]);
  const Component =
    choice === "light" ? Sun : choice === "dark" ? Moon : Monitor;
  return (
    <label className="theme-control">
      <Component {...iconProps} />
      <span className="sr-only">{t("theme.label")}</span>
      <select
        aria-label={t("theme.label")}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="light">{t("theme.light")}</option>
        <option value="dark">{t("theme.dark")}</option>
        <option value="system">{t("theme.system")}</option>
      </select>
    </label>
  );
}
export function TransactionBoundary({
  children,
  complete = false,
}: {
  children: ReactNode;
  complete?: boolean;
}) {
  return (
    <section
      className={`boundary${complete ? " complete" : ""}`}
      aria-label={t("action.boundary")}
    >
      <div className="boundary-label">
        {complete ? <Check {...iconProps} /> : <Layers {...iconProps} />}
        <span>{t("action.boundary")}</span>
      </div>
      {children}
    </section>
  );
}
function AmountField({
  label,
  value,
  onChange,
  disabled,
  unit,
  note,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  unit: string;
  note?: string;
  error?: string;
}) {
  const id = label.replaceAll(" ", "").toLowerCase();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="amount-control">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!error}
          aria-describedby={note || error ? id + "-note" : undefined}
        />
        <span>{unit}</span>
      </div>
      {(note || error) && (
        <p id={id + "-note"} className={error ? "error-text" : "field-note"}>
          {error ?? note}
        </p>
      )}
    </div>
  );
}
function PendingAction({
  pointer,
  observation,
  storageSaved,
  onCheck,
  onAnother,
  bundle,
}: {
  pointer: PendingPointer;
  observation?: Observation;
  storageSaved: boolean;
  onCheck: () => void;
  onAnother?: () => void;
  bundle?: DeploymentBundle;
}) {
  const terminal =
    observation?.state === "succeeded" || observation?.state === "failed";
  return (
    <div className="status-panel">
      <Icon
        kind={
          observation?.state === "succeeded"
            ? "check"
            : observation?.state === "failed"
              ? "error"
              : "clock"
        }
      />
      <h1>
        {t(
          observation?.state === "succeeded"
            ? "success.heading"
            : observation?.state === "failed"
              ? "failure.heading"
              : "pending.heading",
        )}
      </h1>
      <p role="status">
        {t(
          observation?.state === "succeeded"
            ? observation.receipt
              ? "help.guarantee"
              : "success.receipt_unavailable"
            : observation?.state === "failed"
              ? "failure.body"
              : observation?.state === "pending"
                ? "pending.body"
                : "pending.unknown",
        )}
      </p>
      <Identity label={t("receipt.hash")} value={pointer.hash} />
      {observation?.receipt && (
        <dl className="review-numbers">
          <div>
            <dt>{t("success.spent")}</dt>
            <dd>
              {bundle
                ? formatAmount(
                    observation.receipt.sharesSpent,
                    bundle.shareDecimals,
                  )
                : observation.receipt.sharesSpent}
            </dd>
          </div>
          <div>
            <dt>{t("success.received")}</dt>
            <dd>
              {bundle
                ? formatAmount(
                    observation.receipt.received,
                    bundle.tokens.find(
                      (t) => t.address === bundle.profile.settlement,
                    )!.decimals,
                  )
                : observation.receipt.received}
            </dd>
          </div>
        </dl>
      )}
      {observation?.receipt && bundle && (
        <Identity
          label={t("route.identity")}
          value={bundle.profile.settlement}
        />
      )}
      {observation && (
        <p className="muted">
          {t("pending.last_checked", {
            time: new Date(observation.observedAt).toLocaleTimeString(),
          })}
        </p>
      )}
      {observation?.receipt && (
        <button
          className="secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      environment: pointer.environment,
                      ...observation,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json" },
              ),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = t("app.download_name") + ".json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          {t("receipt.download")}
        </button>
      )}
      {observation?.ledger && (
        <p>
          {t("receipt.ledger")} <strong>{observation.ledger}</strong>
        </p>
      )}
      {observation?.actualFee && (
        <p>
          {t("fee.actual")}{" "}
          <strong>{formatAmount(observation.actualFee, 7)} XLM</strong>
        </p>
      )}
      {!terminal && (
        <>
          <p className="muted">
            {t(storageSaved ? "pending.leave" : "pending.storage_unavailable")}
          </p>
          <button className="primary" onClick={onCheck}>
            {t("pending.check")}
          </button>
        </>
      )}
      {terminal && onAnother && (
        <button className="secondary" onClick={onAnother}>
          {t("action.another")}
        </button>
      )}
      <a
        className="text-link"
        href={`/receipt/${pointer.hash}?environment=${pointer.environment}`}
      >
        {t("success.receipt")}
        <ExternalLink {...iconProps} />
      </a>
    </div>
  );
}
export function ReviewPanel({
  review,
  bundle,
  example,
  exampleShares = "100",
  exampleMinimum = "99",
  onEdit,
  onSign,
  signing,
  changed,
  confirmed,
  onConfirm,
}: {
  review: Review | null;
  bundle?: DeploymentBundle;
  example: boolean;
  exampleShares?: string;
  exampleMinimum?: string;
  onEdit: () => void;
  onSign: () => void;
  signing: boolean;
  changed: boolean;
  confirmed: boolean;
  onConfirm: (v: boolean) => void;
}) {
  return (
    <section className="review-panel" aria-label={t("review.heading")}>
      <div className="section-heading">
        <h2>{t(example ? "app.example_review" : "review.heading")}</h2>
        <FileText {...iconProps} />
      </div>
      <p className="serif">{t("review.intro")}</p>
      <dl className="review-numbers">
        <div>
          <dt>{t("success.spent")}</dt>
          <dd>
            {example
              ? exampleShares
              : review && bundle
                ? formatAmount(review.draft.intent.shares, bundle.shareDecimals)
                : ""}
          </dd>
        </div>
        <div>
          <dt>{t("action.minimum")}</dt>
          <dd>
            {example
              ? exampleMinimum
              : review && bundle
                ? formatAmount(
                    review.draft.intent.min_receive,
                    bundle.tokens.find(
                      (t) => t.address === bundle.profile.settlement,
                    )!.decimals,
                  )
                : ""}
          </dd>
        </div>
        <div>
          <dt>{t(example ? "app.example_expected" : "action.expected")}</dt>
          <dd>
            {example
              ? "99.5 OUT"
              : review && bundle
                ? formatAmount(
                    review.expectedReceiveRaw,
                    bundle.tokens.find(
                      (t) => t.address === bundle.profile.settlement,
                    )!.decimals,
                  )
                : ""}
          </dd>
        </div>
        <div>
          <dt>{t("fee.maximum")}</dt>
          <dd>
            {example
              ? "0.01 XLM"
              : review
                ? formatAmount(review.feeMaximumStroops, 7) + " XLM"
                : ""}
          </dd>
        </div>
      </dl>
      {review && (
        <>
          <Identity
            label={t("action.recipient")}
            value={review.draft.intent.recipient}
          />
          <details>
            <summary>{t("app.required_minima")}</summary>
            <dl>
              {review.draft.intent.min_withdraw.map((v, n) => (
                <div key={n}>
                  <dt>{review.profile.assets[n]!.asset}</dt>
                  <dd>
                    {t("review.withdraw_minima")}:{" "}
                    {formatAmount(
                      v,
                      bundle?.tokens.find(
                        (t) => t.address === review.profile.assets[n]!.asset,
                      )?.decimals ?? 0,
                    )}
                  </dd>
                  <dd>
                    {t("review.swap_minima")}:{" "}
                    {formatAmount(
                      review.draft.intent.min_swap[n]!,
                      bundle?.tokens.find(
                        (t) => t.address === review.profile.settlement,
                      )?.decimals ?? 0,
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
          <p>
            {t("app.expiry_ledger", {
              ledger: review.draft.intent.valid_before_ledger,
            })}
          </p>
          <p>
            {t("app.expiry_time", {
              time: new Date(
                Number(review.draft.intent.valid_before_time) * 1000,
              ).toLocaleString(),
            })}
          </p>
          <p className="muted">{t("review.expiry_note")}</p>
        </>
      )}
      {changed && (
        <label className="confirmation">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => onConfirm(e.target.checked)}
          />
          <span>
            {t("review.minimum_changed")} {t("app.minimum_confirm")}
          </span>
        </label>
      )}
      <p className="fee-note">
        <Info {...iconProps} />
        {t(example ? "app.example_details" : "review.failure_fee")}
      </p>
      <div className="actions">
        <button
          className="primary"
          disabled={example || signing || (changed && !confirmed)}
          onClick={onSign}
        >
          <Wallet {...iconProps} />
          {t("action.sign")}
        </button>
        <button className="secondary" onClick={onEdit}>
          {t(signing ? "review.back" : "action.edit")}
        </button>
      </div>
      {example && <p className="muted">{t("app.no_signing")}</p>}
      {signing && <p role="status">{t("wallet.prompt")}</p>}
    </section>
  );
}
function Help() {
  return (
    <article className="help">
      <h1>{t("app.help_heading")}</h1>
      <p className="serif">{t("app.help_intro")}</p>
      {(["supported", "fee", "wallet"] as const).map((key) => (
        <section key={key}>
          <h2>
            {t(
              key === "supported"
                ? "app.help_supported"
                : key === "fee"
                  ? "app.help_fee"
                  : "app.help_wallet",
            )}
          </h2>
          <p>
            {t(
              key === "supported"
                ? "help.guarantee"
                : key === "fee"
                  ? "app.help_fee_body"
                  : "app.help_wallet_body",
            )}
          </p>
        </section>
      ))}
      <p className="notice">
        <Info {...iconProps} />
        {t("help.limits")}
      </p>
      <a href="/">{t("app.return_home")}</a>
    </article>
  );
}
function Activity({ records }: { records: PendingPointer[] }) {
  return (
    <section className="page-section">
      <h1>{t("activity.heading")}</h1>
      <p className="muted">{t("activity.scope")}</p>
      {records.length ? (
        records.map((p) => (
          <a
            className="activity-row"
            href={`/receipt/${p.hash}?environment=${p.environment}`}
            key={p.hash}
          >
            <Clock {...iconProps} />
            <div>
              <span>
                {t(
                  (p as PendingPointer & { state?: string }).state ===
                    "succeeded"
                    ? "activity.complete"
                    : (p as PendingPointer & { state?: string }).state ===
                        "failed"
                      ? "activity.failed"
                      : "activity.pending",
                )}
              </span>
              <code>{p.hash}</code>
            </div>
            <ChevronRight {...iconProps} />
          </a>
        ))
      ) : (
        <div className="empty-state">
          <FileText {...iconProps} />
          <p className="serif">{t("activity.empty")}</p>
        </div>
      )}
    </section>
  );
}
function pointers(): PendingPointer[] {
  try {
    const values: PendingPointer[] = [];
    for (let n = 0; n < localStorage.length; n++) {
      const key = localStorage.key(n);
      if (key?.startsWith("mierkhat.pending.")) {
        try {
          const p = JSON.parse(localStorage.getItem(key)!);
          if (
            hashSchema.safeParse(p.hash).success &&
            ["local", "testnet"].includes(p.environment)
          )
            values.push(p);
        } catch {}
      }
    }
    return values.sort(
      (a, b) =>
        Number(!!(a as PendingPointer & { terminal?: boolean }).terminal) -
          Number(!!(b as PendingPointer & { terminal?: boolean }).terminal) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  } catch {
    return [];
  }
}
export function App() {
  const [path, setPath] = useState(location.pathname),
    [menu, setMenu] = useState(false),
    [example, setExample] = useState(false),
    [account, setAccount] = useState<string | null>(null),
    [bundle, setBundle] = useState<DeploymentBundle | undefined>(bundles[0]),
    [shares, setShares] = useState(""),
    [minimum, setMinimum] = useState(""),
    [balance, setBalance] = useState<string | null>(null),
    [review, setReview] = useState<Review | null>(null),
    [stage, setStage] = useState<
      "editing" | "preparing" | "review" | "signing" | "pending"
    >("editing"),
    [error, setError] = useState<CopyKey | null>(null),
    [amountErrors, setAmountErrors] = useState<{
      shares?: string;
      minimum?: string;
    }>({}),
    [observation, setObservation] = useState<Observation>(),
    [pending, setPending] = useState<PendingPointer | null>(null),
    [storageSaved, setStorageSaved] = useState(true),
    [unsent, setUnsent] = useState<SignedAttempt | null>(null),
    [records, setRecords] = useState<PendingPointer[]>(pointers),
    [lowered, setLowered] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const controller = useRef(new ExitController()),
    revision = useRef(0),
    intentId = useRef(newIntentId()),
    lastMinimum = useRef<bigint | undefined>(undefined),
    watchAbort = useRef<AbortController | undefined>(undefined);
  const server = useRef(new rpc.Server("https://soroban-testnet.stellar.org"));
  useEffect(() => {
    const pop = () => setPath(location.pathname);
    window.addEventListener("popstate", pop);
    return () => {
      window.removeEventListener("popstate", pop);
      controller.current.invalidate();
      watchAbort.current?.abort();
    };
  }, []);
  useEffect(() => {
    document.title = t(
      path.startsWith("/review/")
        ? "title.review"
        : path.startsWith("/receipt/")
          ? "title.receipt"
          : path === "/activity"
            ? "title.activity"
            : path === "/help"
              ? "title.help"
              : "title.home",
    );
  }, [path]);
  const check = useCallback(async (pointer: PendingPointer) => {
    try {
      const value = await api.status(pointer.hash, pointer.environment);
      setObservation((old) =>
        old?.state === "succeeded" || old?.state === "failed" ? old : value,
      );
    } catch {
      setObservation(
        (old) =>
          old ?? {
            state: "unknown",
            hash: pointer.hash,
            observedAt: new Date().toISOString(),
          },
      );
    }
  }, []);
  useEffect(() => {
    if (!pending) return;
    const abort = new AbortController();
    watchAbort.current = abort;
    void (async () => {
      for await (const value of watchExit(
        pending.hash,
        () => api.status(pending.hash, pending.environment),
        abort.signal,
      ))
        setObservation((old) =>
          old?.state === "succeeded" || old?.state === "failed" ? old : value,
        );
    })();
    return () => abort.abort();
  }, [pending]);
  useEffect(() => {
    if (path.startsWith("/receipt/")) {
      const hash = path.slice(9),
        environment = new URLSearchParams(location.search).get("environment");
      if (
        !hashSchema.safeParse(hash).success ||
        !["testnet", "local"].includes(environment ?? "")
      ) {
        setError("app.invalid_hash");
        return;
      }
      setPending({
        hash,
        environment: environment!,
        epoch: "",
        intentHash: "",
        createdAt: new Date().toISOString(),
      });
      setStage("pending");
    } else if (
      path === "/" &&
      records.some(
        (p) => !(p as PendingPointer & { terminal?: boolean }).terminal,
      )
    ) {
      setPending(
        records.find(
          (p) => !(p as PendingPointer & { terminal?: boolean }).terminal,
        )!,
      );
      setStage("pending");
    }
  }, []);
  useEffect(() => {
    if (
      !pending ||
      !observation ||
      !["succeeded", "failed"].includes(observation.state)
    )
      return;
    try {
      localStorage.setItem(
        `mierkhat.pending.${pending.environment}.${pending.hash}`,
        JSON.stringify({
          ...pending,
          terminal: true,
          state: observation.state,
        }),
      );
      setRecords(pointers());
    } catch {}
  }, [pending, observation]);
  useEffect(() => {
    if (!account) return;
    const timer = setInterval(() => {
      void wallet
        .identity()
        .then((identity) => {
          if (
            identity.address !== account ||
            identity.networkPassphrase !==
              (bundle?.networkPassphrase ??
                knownDeployments.find((b) => b.environment === "testnet")
                  ?.networkPassphrase)
          ) {
            controller.current.invalidate();
            setReview(null);
            setStage(pending ? "pending" : "editing");
            setError("wallet.changed");
            setAccount(identity.address);
            setBalance(null);
          }
        })
        .catch(() => {});
    }, 2000);
    return () => clearInterval(timer);
  }, [account, bundle, pending]);
  async function connect() {
    setError(null);
    try {
      const identity = await connectWallet();
      if (
        identity.networkPassphrase !==
        (bundle?.networkPassphrase ??
          knownDeployments.find((b) => b.environment === "testnet")
            ?.networkPassphrase)
      )
        throw new MierkhatError("Network", "network.wrong");
      setAccount(identity.address);
      if (bundle) {
        await loadDeployment(bundle, server.current, identity.address);
        setBalance(
          await shareBalance(bundle, server.current, identity.address),
        );
      }
    } catch (e) {
      setError(errorCopy(e));
    }
  }
  useEffect(() => {
    if (!path.startsWith("/review/")) return;
    let active = true;
    setStage("preparing");
    void (async () => {
      try {
        const candidate = await api.review(path.slice(8), "testnet");
        const b = bundles.find(
          (v) =>
            v.environment === candidate.draft.environment &&
            v.epoch === candidate.draft.epoch,
        );
        if (!b) throw new MierkhatError("Deployment", "route.unsupported");
        const identity = await wallet.identity();
        if (identity.address !== candidate.draft.intent.owner)
          throw new MierkhatError("Owner", "app.review_other_owner");
        await loadDeployment(b, server.current, identity.address);
        const checked = verifyReview(
          candidate,
          candidate.draft,
          b,
          await reviewLedger(server.current, identity.address),
        );
        if (!active) return;
        setAccount(identity.address);
        setBundle(b);
        setReview(checked);
        controller.current.setDraft(candidate.draft);
        setStage("review");
      } catch (e) {
        if (active) {
          setError(errorCopy(e));
          setStage("editing");
        }
      }
    })();
    return () => {
      active = false;
      controller.current.invalidate();
    };
  }, [path]);
  function another() {
    setPending(null);
    setObservation(undefined);
    intentId.current = newIntentId();
    setShares("");
    setMinimum("");
    edit();
  }
  function edit() {
    setError(null);
    setAmountErrors({});
    controller.current.invalidate();
    setReview(null);
    setStage("editing");
    setConfirmed(false);
  }
  function demo() {
    edit();
    setExample((v) => !v);
    setShares(example ? "" : "100");
    setMinimum(example ? "" : "99");
    setError(null);
  }
  async function prepare() {
    setError(null);
    setAmountErrors({});
    const shareDecimals = bundle?.shareDecimals ?? 7;
    const outDecimals =
      bundle?.tokens.find((t) => t.address === bundle.profile.settlement)
        ?.decimals ?? 7;
    let sharesRaw: string, minRaw: string;
    try {
      sharesRaw = parseAmount(shares, shareDecimals);
    } catch (e) {
      setAmountErrors({ shares: t(errorCopy(e), { decimals: shareDecimals }) });
      setError("input.invalid");
      return;
    }
    try {
      minRaw = parseAmount(minimum, outDecimals);
    } catch (e) {
      setAmountErrors({ minimum: t(errorCopy(e), { decimals: outDecimals }) });
      setError("input.invalid");
      return;
    }
    if (example) {
      setStage("review");
      return;
    }
    if (!bundle || !account) return;
    try {
      setLowered(
        lastMinimum.current !== undefined &&
          BigInt(minRaw) < lastMinimum.current,
      );
      setConfirmed(false);
      setStage("preparing");
      const ledger = await latestLedger(server.current);
      const draft: ExitDraft = {
        environment: bundle.environment,
        epoch: bundle.epoch,
        revision: ++revision.current,
        intent: {
          schema: 1,
          network_id: bundle.profile.network_id,
          guard: bundle.guard,
          profile_hash: bundle.profileHash,
          intent_id: intentId.current,
          owner: account,
          recipient: account,
          shares: sharesRaw,
          min_withdraw: bundle.profile.assets.map(() => "1"),
          min_swap: bundle.profile.assets.map((a) =>
            a.asset === bundle.profile.settlement ? "0" : "1",
          ),
          min_receive: minRaw,
          valid_before_time: (BigInt(ledger.timestamp) + 120n).toString(),
          valid_before_ledger: ledger.sequence + 24,
        },
      };
      controller.current.setDraft(draft);
      const candidate = await controller.current.prepare(async (d) => {
        const proposed = await api.prepare(d);
        await loadDeployment(bundle, server.current, account);
        return verifyReview(
          proposed,
          d,
          bundle,
          await reviewLedger(server.current, account),
        );
      });
      if (!candidate) return;
      setReview(candidate);
      lastMinimum.current = BigInt(minRaw);
      setStage("review");
    } catch (e) {
      setStage("editing");
      setError(errorCopy(e));
    }
  }
  async function submit(attempt: SignedAttempt, pointer: PendingPointer) {
    setUnsent(null);
    setPending(pointer);
    setStage("pending");
    try {
      await api.submit(attempt);
      await check(pointer);
    } catch {
      setObservation({
        state: "unknown",
        hash: pointer.hash,
        observedAt: new Date().toISOString(),
      });
    }
  }
  async function sign() {
    if (!review || !bundle || !account) return;
    setError(null);
    setStage("signing");
    try {
      const work = async () => {
        const attempt = await controller.current.signExit(
          review,
          bundle,
          wallet,
          () => reviewLedger(server.current, account),
          () => loadDeployment(bundle, server.current, account),
        );
        if (!attempt) return;
        const pointer: PendingPointer = {
          environment: attempt.environment,
          epoch: attempt.epoch,
          hash: attempt.txHash,
          intentHash: review.intentHash,
          createdAt: new Date().toISOString(),
        };
        let saved = false;
        try {
          saved = persistPending(pointer, localStorage);
        } catch {
          saved = false;
        }
        setStorageSaved(saved);
        setRecords(pointers());
        if (!saved) {
          setUnsent(attempt);
          setPending(pointer);
          setStage("review");
          return;
        }
        await submit(attempt, pointer);
      };
      if (navigator.locks)
        await navigator.locks.request(
          "mierkhat.sign." + account,
          { ifAvailable: true },
          async (lock) => {
            if (!lock) throw new MierkhatError("PromptOpen", "wallet.prompt");
            await work();
          },
        );
      else await work();
    } catch (e) {
      setStage("review");
      setError(errorCopy(e));
    }
  }
  const settlement = bundle?.tokens.find(
      (t) => t.address === bundle.profile.settlement,
    ),
    unit = example ? "OUT" : (settlement?.symbol ?? t("app.token"));
  const reviewVisible = stage === "review" || stage === "signing";
  const receiptPage = path.startsWith("/receipt/");
  return (
    <>
      <a className="skip-link" href="#main">
        {t("nav.skip")}
      </a>
      <header className="header">
        <a href="/" className="brand" aria-label={t("nav.home")}>
          <img
            className="logo-light"
            src="/brand/mierkhat-logo-light.svg"
            alt={t("brand.alt")}
          />
          <img
            className="logo-dark"
            src="/brand/mierkhat-logo-dark.svg"
            alt={t("brand.alt")}
          />
        </a>
        <button
          className="mobile-menu quiet"
          aria-label={t("app.window_menu")}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          <Menu {...iconProps} />
        </button>
        <nav className={menu ? "open" : ""} aria-label={t("app.window_menu")}>
          <a
            href="/activity"
            aria-current={path === "/activity" ? "page" : undefined}
          >
            {t("nav.activity")}
          </a>
          <a href="/help" aria-current={path === "/help" ? "page" : undefined}>
            {t("nav.help")}
          </a>
        </nav>
        <div className="header-controls">
          <span className="network">
            <span className="network-dot" />
            {t(example ? "network.local" : "network.testnet")}
          </span>
          <ThemeMenu />
          <button
            className="wallet-button"
            aria-label={t(account ? "wallet.disconnect" : "wallet.connect")}
            onClick={
              account
                ? () => {
                    controller.current.invalidate();
                    setAccount(null);
                    setBalance(null);
                    setReview(null);
                    setStage(pending ? "pending" : "editing");
                  }
                : connect
            }
          >
            <Wallet {...iconProps} />
            <span>
              {account
                ? account.slice(0, 5) + "…" + account.slice(-4)
                : t("wallet.connect")}
            </span>
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {error && (
          <div className="notice error-text" role="alert">
            <CircleAlert {...iconProps} />
            <div>
              <strong>{t("error.summary")}</strong>
              {amountErrors.shares ? (
                <a href="#sharestowithdraw">
                  {t("action.shares")}: {amountErrors.shares}
                </a>
              ) : amountErrors.minimum ? (
                <a href="#minimumtoreceive">
                  {t("action.minimum")}: {amountErrors.minimum}
                </a>
              ) : (
                <p>{t(error, { decimals: settlement?.decimals ?? 7 })}</p>
              )}
            </div>
            <button
              className="quiet"
              aria-label={t("app.closed")}
              onClick={() => setError(null)}
            >
              <X {...iconProps} />
            </button>
          </div>
        )}
        {path === "/help" ? (
          <Help />
        ) : path === "/activity" ? (
          <Activity records={records} />
        ) : receiptPage && pending ? (
          <TransactionBoundary complete={observation?.state === "succeeded"}>
            <PendingAction
              pointer={pending}
              observation={observation}
              storageSaved={storageSaved}
              bundle={
                bundle ??
                knownDeployments.find(
                  (b) => b.profileHash === observation?.receipt?.profileHash,
                )
              }
              onAnother={another}
              onCheck={() => check(pending)}
            />
          </TransactionBoundary>
        ) : path !== "/" && !path.startsWith("/review/") ? (
          <p>{t("app.not_found")}</p>
        ) : (
          <div className="workspace">
            <div className="primary-column">
              <div className="intro-row">
                <span className="muted">{t("app.tagline")}</span>
                <span className="scope-label">
                  <Layers {...iconProps} />
                  {t("app.supported")}
                </span>
              </div>
              <TransactionBoundary
                complete={observation?.state === "succeeded"}
              >
                {pending && stage === "pending" ? (
                  <PendingAction
                    pointer={pending}
                    observation={observation}
                    storageSaved={storageSaved}
                    bundle={
                      bundle ??
                      knownDeployments.find(
                        (b) =>
                          b.profileHash === observation?.receipt?.profileHash,
                      )
                    }
                    onAnother={another}
                    onCheck={() => check(pending)}
                  />
                ) : (
                  <>
                    <div className="outcome">
                      <p>{t("app.receive_prefix")}</p>
                      <h1>
                        {minimum || t("app.output_empty")}
                        <span>{minimum ? unit : ""}</span>
                      </h1>
                      <p className="serif">{t("action.intro")}</p>
                    </div>
                    {example && (
                      <div className="notice demo">
                        <Info {...iconProps} />
                        <div>
                          <strong>{t("demo.label")}</strong>
                          <p>{t("demo.note")}</p>
                        </div>
                      </div>
                    )}
                    {reviewVisible ? (
                      <ReviewPanel
                        exampleShares={shares.trim()}
                        exampleMinimum={minimum.trim()}
                        review={review}
                        bundle={
                          bundle ??
                          knownDeployments.find(
                            (b) =>
                              b.profileHash ===
                              observation?.receipt?.profileHash,
                          )
                        }
                        example={example}
                        onEdit={edit}
                        onSign={sign}
                        signing={stage === "signing"}
                        changed={lowered}
                        confirmed={confirmed}
                        onConfirm={setConfirmed}
                      />
                    ) : (
                      <div className="editor">
                        <div className="field vault-field">
                          <label htmlFor="vault">{t("action.vault")}</label>
                          <div className="select-wrap">
                            <Layers {...iconProps} />
                            <select
                              id="vault"
                              value={bundle?.profileHash ?? "none"}
                              onChange={(e) => {
                                edit();
                                setBundle(
                                  bundles.find(
                                    (b) => b.profileHash === e.target.value,
                                  ),
                                );
                              }}
                              disabled={example || !bundles.length}
                            >
                              {example ? (
                                <option value={bundle?.profileHash ?? "none"}>
                                  {t("app.example_vault")}
                                </option>
                              ) : bundles.length ? (
                                bundles.map((b) => (
                                  <option
                                    value={b.profileHash}
                                    key={b.profileHash}
                                  >
                                    {b.vaultName}
                                  </option>
                                ))
                              ) : (
                                <option value="none">
                                  {t("app.vault_empty")}
                                </option>
                              )}
                            </select>
                            <ChevronDown {...iconProps} />
                          </div>
                        </div>
                        {balance && bundle && (
                          <button
                            className="text-button"
                            onClick={() => {
                              edit();
                              setShares(
                                formatAmount(balance, bundle.shareDecimals),
                              );
                            }}
                          >
                            {t("action.max")}
                          </button>
                        )}
                        <div className="input-grid">
                          <AmountField
                            label={t("action.shares")}
                            error={amountErrors.shares}
                            value={shares}
                            onChange={(v) => {
                              edit();
                              setShares(v);
                            }}
                            disabled={!example && !bundle}
                            unit={example ? "MVT" : t("app.shares_unit")}
                            note={
                              example
                                ? t("app.example_balance") + ": 1000"
                                : balance && bundle
                                  ? t("action.available") +
                                    ": " +
                                    formatAmount(balance, bundle.shareDecimals)
                                  : t("app.not_connected")
                            }
                          />
                          <AmountField
                            label={t("action.minimum")}
                            error={amountErrors.minimum}
                            value={minimum}
                            onChange={(v) => {
                              edit();
                              setMinimum(v);
                            }}
                            disabled={!example && !bundle}
                            unit={unit}
                            note={t("app.minimum_note")}
                          />
                        </div>
                        <div className="flow">
                          <div>
                            <Layers {...iconProps} />
                            <span>{t("app.withdraw")}</span>
                          </div>
                          <div>
                            <CheckCheck {...iconProps} />
                            <span>{t("app.convert")}</span>
                          </div>
                          <div>
                            <Wallet {...iconProps} />
                            <span>{t("app.deliver")}</span>
                          </div>
                        </div>
                        <div className="conditions">
                          <Check {...iconProps} />
                          <p>
                            {t("app.shares_note")} {t("app.outcome_note")}
                          </p>
                        </div>
                        <div className="actions">
                          <button
                            className="primary"
                            disabled={
                              stage === "preparing" ||
                              (!example && (!account || !bundle)) ||
                              !shares ||
                              !minimum
                            }
                            onClick={prepare}
                          >
                            {stage === "preparing" ? (
                              <Clock {...iconProps} />
                            ) : (
                              <FileText {...iconProps} />
                            )}
                            <span>
                              {t(
                                stage === "preparing"
                                  ? "action.prepare"
                                  : example
                                    ? "app.example_preview"
                                    : "action.review",
                              )}
                            </span>
                          </button>
                          {(!bundles.length || example) && (
                            <button className="text-button" onClick={demo}>
                              {t(example ? "app.leave_example" : "app.example")}
                            </button>
                          )}
                        </div>
                        {!example && !bundle && (
                          <p className="availability">
                            {t("app.fixture_note")}
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
                {unsent && pending && (
                  <div className="notice">
                    <Info {...iconProps} />
                    <div>
                      <p>{t("app.storage_before_send")}</p>
                      <Identity
                        label={t("pending.recovery_link")}
                        value={
                          location.origin +
                          `/receipt/${pending.hash}?environment=${pending.environment}`
                        }
                      />
                      <button
                        className="primary"
                        onClick={() => submit(unsent, pending)}
                      >
                        {t("app.storage_continue")}
                      </button>
                    </div>
                  </div>
                )}
              </TransactionBoundary>
              <p className="workspace-footnote">
                <Info {...iconProps} />
                {t("help.limits")}
              </p>
            </div>
            <aside className="evidence-rail">
              <section>
                <div className="section-heading">
                  <h2>{t("route.heading")}</h2>
                  <Layers {...iconProps} />
                </div>
                <p className="serif rail-intro">{t("app.supported_body")}</p>
                <div className="route-line">
                  <span className="route-node" />
                  <div>
                    <strong>DeFindex</strong>
                    <p>{t(example ? "app.example_vault" : "app.withdraw")}</p>
                  </div>
                </div>
                <div className="route-line">
                  <span className="route-node" />
                  <div>
                    <strong>Soroswap</strong>
                    <p>{t("app.route_note")}</p>
                  </div>
                </div>
                <div className="route-line final">
                  <Check {...iconProps} />
                  <div>
                    <strong>{t("app.deliver")}</strong>
                    <p>{t("action.minimum")}</p>
                  </div>
                </div>
                <details>
                  <summary>{t("route.contracts")}</summary>
                  {bundle ? (
                    <>
                      <Identity
                        label="DeFindex"
                        value={bundle.profile.vault.address}
                      />
                      <Identity
                        label="Soroswap"
                        value={bundle.profile.router.address}
                      />
                      <Identity label={t("brand.name")} value={bundle.guard} />
                      {bundle.tokens.map((token) => (
                        <Identity
                          key={token.address}
                          label={token.symbol}
                          value={token.address}
                        />
                      ))}
                    </>
                  ) : (
                    <p>{t("app.details_empty")}</p>
                  )}
                </details>
              </section>
              <section>
                <div className="section-heading">
                  <h2>{t("app.freshness")}</h2>
                  <Clock {...iconProps} />
                </div>
                <p className="muted">
                  {review
                    ? t("app.observed_ledger") + " " + review.preparedLedger
                    : t("app.freshness_empty")}
                </p>
                {review && (
                  <p>
                    {t("fee.maximum")}
                    <br />
                    <strong>
                      {formatAmount(review.feeMaximumStroops, 7)} XLM
                    </strong>
                  </p>
                )}
              </section>
              <section>
                <div className="section-heading">
                  <h2>{t("activity.heading")}</h2>
                  <FileText {...iconProps} />
                </div>
                <p className="serif">
                  {t(
                    example
                      ? "app.example_activity"
                      : records.length
                        ? "app.pending_hold"
                        : "app.activity_note",
                  )}
                </p>
                <a className="text-link" href="/activity">
                  {t("app.activity_link")}
                  <ChevronRight {...iconProps} />
                </a>
              </section>
            </aside>
          </div>
        )}
      </main>
      <footer>
        <div className="footer-brand">
          <img
            className="logo-light"
            src="/brand/mierkhat-mark-light.svg"
            alt=""
          />
          <img
            className="logo-dark"
            src="/brand/mierkhat-mark-dark.svg"
            alt=""
          />
          <span>{t("app.brand_footer")}</span>
        </div>
        <details className="deployment-details">
          <summary>{t("details.deployment")}</summary>
          <p>{t("app.details_empty")}</p>
          {bundle && (
            <Identity
              label={t("details.deployment")}
              value={bundle.profileHash}
            />
          )}
        </details>
      </footer>
    </>
  );
}
