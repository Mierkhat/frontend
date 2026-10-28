import { useEffect, useRef, useState } from "react";
import {
  MierkhatError,
  accountSchema,
  formatAmount,
  type DeploymentBundle,
} from "@mierkhat/sdk";
import { bundles, knownDeployments, request } from "../api.js";
import { t } from "../copy.js";
import { ErrorNotice } from "../components/Shared.js";
import { WithdrawalReadiness } from "../components/WithdrawalReadiness.js";
import {
  readWatchAccess,
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
      <h1>{t("readiness.heading")}</h1>
      <p>{t("readiness.intro")}</p>
      <form
        className="tool-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = accountSchema.safeParse(address.trim());
          if (parsed.success) {
            setError(undefined);
            setOwner(parsed.data);
          } else setError(new MierkhatError("Address", "input.invalid"));
        }}
      >
        <label>
          {t("readiness.address")}
          <input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setOwner("");
            }}
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
        <ErrorNotice error={error} />
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
    [busy, setBusy] = useState(false),
    [permission, setPermission] = useState(false);
  const notified = useRef(new Set<string>()),
    mounted = useRef(true);
  async function refresh() {
    setBusy(true);
    try {
      const access = readWatchAccess();
      const loaded = await Promise.all(
        access.map(async (a) => {
          try {
            return { access: a, state: await readWatch(a) };
          } catch (error) {
            return { access: a, error };
          }
        }),
      );
      if (mounted.current) {
        setRows(loaded);
        setError(undefined);
      }
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      )
        for (const r of loaded)
          for (const n of r.state?.notifications ?? []) {
            if (!n.seen_at && !notified.current.has(n.id)) {
              notified.current.add(n.id);
              new Notification(t("watch.alert_title"), { tag: n.id });
            }
          }
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  async function action(a: WatchAccess, op: string, body: unknown = {}) {
    try {
      await request("/watches/" + a.id + "/" + op, body, {
        "X-Watch-Key": a.key,
      });
      if (op === "remove")
        localStorage.setItem(
          "mierkhat.watches.v1",
          JSON.stringify(readWatchAccess().filter((v) => v.id !== a.id)),
        );
      await refresh();
    } catch (e) {
      if (
        op === "remove" &&
        e instanceof MierkhatError &&
        e.code === "NotFound"
      ) {
        localStorage.setItem(
          "mierkhat.watches.v1",
          JSON.stringify(readWatchAccess().filter((v) => v.id !== a.id)),
        );
        await refresh();
      } else setError(e);
    }
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
      <h1>{t("watch.heading")}</h1>
      <p>{t("watch.intro")}</p>
      <p>{t("watch.note")}</p>
      <div className="tool-actions">
        <button
          className="button secondary small"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {t("watch.refresh")}
        </button>
        <button
          className="text-button"
          onClick={() => {
            if (typeof Notification === "undefined") setPermission(true);
            else
              void Notification.requestPermission().then((p) =>
                setPermission(p !== "granted"),
              );
          }}
        >
          {t("watch.permission")}
        </button>
      </div>
      <p className="fine-print">
        {t(permission ? "watch.permission_denied" : "watch.permission_note")}
      </p>
      <ErrorNotice error={error} />
      {!rows.length && !busy && <p>{t("watch.empty")}</p>}
      {rows.map(({ access, state, error }) => {
        const b = knownDeployments.find((b) => b.epoch === state?.watch.epoch),
          m = state?.watch.kind === "migration",
          decimals = m
            ? b?.migration?.destinationShareDecimals
            : b?.tokens.find((t) => t.address === b.profile.settlement)
                ?.decimals;
        return (
          <section className="tool-panel watch-card" key={access.id}>
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
                  onClick={() => review(state.watch)}
                >
                  {t("watch.open")}
                </button>
                <button
                  className="text-button"
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
