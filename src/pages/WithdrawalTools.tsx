import { useEffect, useRef, useState } from "react";
import {
  MierkhatError,
  accountSchema,
  formatAmount,
  type DeploymentBundle,
} from "@mierkhat/sdk";
import { bundles, knownDeployments, request } from "../api.js";
import { t } from "../copy.js";
import { Busy, ErrorNotice, PageHeading } from "../components/Shared.js";
import { WithdrawalReadiness } from "../components/WithdrawalReadiness.js";
import {
  readWatchAccess,
  removeWatchAccess,
  readWatch,
  type WatchAccess,
  type WatchState,
} from "../components/Watches.js";
export function WithdrawalTools({
  connectedOwner,
}: {
  connectedOwner?: string;
}) {
  const [address, setAddress] = useState(connectedOwner ?? ""),
    [owner, setOwner] = useState(""),
    [epoch, setEpoch] = useState(bundles[0]!.epoch),
    [error, setError] = useState<unknown>();
  const bundle = bundles.find((b) => b.epoch === epoch)!;
  return (
    <main id="main" className="wrap standard-page tools-page">
      <PageHeading
        title={t("readiness.heading")}
        intro={t("readiness.intro")}
      />
      <form
        className="tool-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = accountSchema.safeParse(address.trim());
          if (parsed.success) {
            setError(undefined);
            setOwner(parsed.data);
          } else setError(new MierkhatError("Address", "input.address"));
        }}
      >
        <label>
          {t("readiness.address")}
          <input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setOwner("");
              setError(undefined);
            }}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? "address-error" : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label>
          {t("readiness.route")}
          <select value={epoch} onChange={(e) => setEpoch(e.target.value)}>
            {bundles.map((b) => (
              <option key={b.epoch} value={b.epoch}>
                {b.vaultName} ·{" "}
                {
                  b.tokens.find((t) => t.address === b.profile.settlement)!
                    .symbol
                }
              </option>
            ))}
          </select>
        </label>
        <p className="fine-print">{t("readiness.privacy")}</p>
        <button className="button" type="submit">
          {t("readiness.check")}
        </button>
        {!!error && <p id="address-error" className="field-error" role="alert">{t("input.address")}</p>}
      </form>
      {owner && (
        <WithdrawalReadiness
          key={owner + epoch}
          owner={owner}
          bundle={bundle}
          autoCheck
        />
      )}
    </main>
  );
}
export function Alerts() {
  const [rows, setRows] = useState<
      { access: WatchAccess; state?: WatchState; error?: unknown }[]
    >([]),
    [error, setError] = useState<unknown>(),
    [busy, setBusy] = useState(true),
    [permission, setPermission] = useState(false),
    [permissionBusy, setPermissionBusy] = useState(false),
    [actions, setActions] = useState<Set<string>>(new Set());
  const notified = useRef(new Set<string>()), mounted = useRef(true),
    generation = useRef(0), readFlight = useRef(false), queuedRefresh = useRef(false), actionFlight = useRef(new Set<string>());
  async function refresh() {
    if (readFlight.current || actionFlight.current.size) return;
    readFlight.current = true;
    const g = ++generation.current;
    setBusy(true);
    try {
      const loaded = await Promise.all(readWatchAccess().map(async a => {
        try { return { access: a, state: await readWatch(a) }; }
        catch (error) { return { access: a, error }; }
      }));
      if (!mounted.current || g !== generation.current) return;
      setRows(loaded); setError(undefined);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const r of loaded) for (const n of r.state?.notifications ?? []) {
          if (!n.seen_at && !notified.current.has(n.id)) {
            try { new Notification(t("watch.alert_title"), { tag: n.id }); notified.current.add(n.id); }
            catch { setPermission(true); }
          }
        }
      }
    } catch (e) { if (mounted.current && g === generation.current) setError(e); }
    finally {
      readFlight.current = false;
      if (mounted.current && g === generation.current) setBusy(false);
      if (mounted.current && queuedRefresh.current && !actionFlight.current.size) { queuedRefresh.current = false; void refresh(); }
    }
  }
  useEffect(() => {
    mounted.current = true; void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => { mounted.current = false; generation.current++; clearInterval(timer); };
  }, []);
  async function action(a: WatchAccess, op: string, body: unknown = {}) {
    if (actionFlight.current.has(a.id)) return;
    actionFlight.current.add(a.id); generation.current++;
    setActions(new Set(actionFlight.current)); setError(undefined);
    let completed = false;
    try {
      try { await request("/watches/" + a.id + "/" + op, body, { "X-Watch-Key": a.key }); }
      catch (e) { if (!(op === "remove" && e instanceof MierkhatError && e.code === "NotFound")) throw e; }
      if (op === "remove") await removeWatchAccess(a.id);
      completed = true;
    } catch (e) { if (mounted.current) setError(e); }
    finally {
      actionFlight.current.delete(a.id);
      if (mounted.current) {
        setActions(new Set(actionFlight.current)); setBusy(false);
        // Wait for any invalidated read before publishing a refreshed list.
        if (completed) {
          if (readFlight.current) queuedRefresh.current = true;
          else await refresh();
        }
      }
    }
  }
  async function enableNotifications() {
    if (permissionBusy) return;
    setPermissionBusy(true);
    try { setPermission(typeof Notification === "undefined" || await Notification.requestPermission() !== "granted"); }
    catch { setPermission(true); }
    finally { if (mounted.current) setPermissionBusy(false); }
  }
  function review(row: WatchState["watch"]) {
    try {
      sessionStorage.setItem("mierkhat.watchReview", JSON.stringify(row));
    } catch {}
    location.assign(
      (row.kind === "migration" ? "/migrate" : "/app") +
        "?epoch=" +
        encodeURIComponent(row.epoch),
    );
  }
  return (
    <main id="main" className="wrap standard-page tools-page">
      <PageHeading title={t("watch.heading")} intro={t("watch.intro")} />
      <p>{t("watch.note")}</p>
      <div className="tool-actions">
        <button
          className="button secondary small"
          disabled={busy || actions.size > 0}
          onClick={() => void refresh()}
        >
          {t("watch.refresh")}
        </button>
        <button
          className="text-button"
          disabled={permissionBusy}
          onClick={() => void enableNotifications()}
        >
          {t("watch.permission")}
        </button>
      </div>
      <p className="fine-print">
        {t(permission ? "watch.notification_failed" : "watch.permission_note")}
      </p>
      <ErrorNotice error={error} />
      {busy && !rows.length && <Busy label={t("watch.loading")} />}
      {!rows.length && !busy && !error && <div className="empty-state"><p>{t("watch.empty")}</p>
        <a className="button secondary" href="/withdrawals">{t("readiness.check")}</a></div>}
      {rows.map(({ access, state, error }) => {
        const b = knownDeployments.find((b) => b.epoch === state?.watch.epoch),
          m = state?.watch.kind === "migration",
          decimals = m
            ? b?.migration?.destinationShareDecimals
            : b?.tokens.find((t) => t.address === b.profile.settlement)
                ?.decimals;
        return (
          <section className="tool-panel watch-card" key={access.id} aria-busy={actions.has(access.id)}>
            {actions.has(access.id) && <Busy label={t("watch.updating")} />}
            <h2>{b ? b.vaultName : t("watch.load_failed")}</h2>
            <ErrorNotice error={error} />
            {state && (
              <>
                <h3>
                  {t(
                    ("watch." +
                      (state.watch.observation?.state ??
                        "pending")) as "watch.met",
                  )}
                </h3>
                <p>{t(m ? "watch.migration" : "watch.exit")}</p>
                <p>
                  {t("watch.threshold")}:{" "}
                  {decimals !== undefined
                    ? formatAmount(state.watch.minimum_raw, decimals)
                    : t("common.unknown")}{" "}
                  {m
                    ? t("app.shares_unit")
                    : b?.tokens.find(
                        (token) => token.address === b.profile.settlement,
                      )?.symbol}
                </p>
                <p className="fine-print">
                  {t("watch.expires", {
                    date: new Date(state.watch.expires_at).toLocaleString(),
                  })}
                </p>
                {state.watch.observation && (
                  <p className="fine-print">
                    {t("watch.checked", {
                      date: new Date(
                        state.watch.observation.checkedAt,
                      ).toLocaleString(),
                    })}
                  </p>
                )}
                <button
                  className="button small"
                  disabled={actions.has(access.id)}
                  onClick={() => review(state.watch)}
                >
                  {t("watch.open")}
                </button>
                <button
                  className="text-button"
                  disabled={actions.has(access.id)}
                  onClick={() => void action(access, "rearm")}
                >
                  {t("watch.rearm")}
                </button>
                <h3>{t("watch.notifications")}</h3>
                {state.notifications.map((n) => (
                  <div className="watch-update" key={n.id}>
                    <p>
                      {t("watch.met")} {new Date(n.created_at).toLocaleString()}
                    </p>
                    {!n.seen_at && (
                      <button
                        className="text-button"
                        disabled={actions.has(access.id)}
                        onClick={() =>
                          void action(access, "seen", { notification: n.id })
                        }
                      >
                        {t("watch.seen")}
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
            <button
              className="text-button"
              disabled={actions.has(access.id)}
              onClick={() => void action(access, "remove")}
            >
              {t("watch.remove")}
            </button>
          </section>
        );
      })}
    </main>
  );
}
