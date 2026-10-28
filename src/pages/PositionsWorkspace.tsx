import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatAmount,
  type DeploymentBundle,
  type PositionsState,
} from "@mierkhat/sdk";
import { api, bundles } from "../api.js";
import { t } from "../copy.js";
import { Busy, ErrorNotice, Identity } from "../components/Shared.js";
import { Workspace, type WalletIdentity } from "./Workspace.js";
export function PositionsWorkspace({
  bundle: initial,
  identity,
  connect,
  disconnect,
}: {
  bundle: DeploymentBundle;
  identity?: WalletIdentity;
  connect: () => Promise<void>;
  disconnect: () => void;
}) {
  const routes = bundles.filter(
    (b) => b.networkPassphrase === initial.networkPassphrase,
  );
  const [epoch, setEpoch] = useState(
      routes.find(
        (b) => b.epoch === new URLSearchParams(location.search).get("epoch"),
      )?.epoch ?? initial.epoch,
    ),
    [mode, setMode] = useState<"exit" | "deposit">("exit"),
    [positions, setPositions] = useState<PositionsState>(),
    [error, setError] = useState<unknown>(),
    [loading, setLoading] = useState(false),
    [locked, setLocked] = useState(false);
  const focusAfterChange = useRef<string | undefined>(undefined);
  const lockedRef = useRef(false);
  const onLockChange = useCallback((value: boolean) => {
    lockedRef.current = value;
    setLocked(value);
  }, []);
  const bundle = routes.find((b) => b.epoch === epoch) ?? initial;
  const vaults = [
    ...new Map(routes.map((b) => [b.profile.vault.address, b])).values(),
  ];
  const outputRoutes = routes.filter(
    (b) => b.profile.vault.address === bundle.profile.vault.address,
  );
  const refresh = useCallback(async () => {
    if (!identity) return;
    setLoading(true);
    try {
      setPositions(await api.positions(identity.address));
      setError(undefined);
    } catch (error) {
      setError(error);
      setPositions(undefined);
    } finally {
      setLoading(false);
    }
  }, [identity?.address]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!lockedRef.current) void refresh();
    }, 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (focusAfterChange.current)
      document
        .getElementById(focusAfterChange.current)
        ?.focus({ preventScroll: true });
    focusAfterChange.current = undefined;
  }, [epoch]);
  const held = positions?.positions.find(
    (p) => p.vault === bundle.profile.vault.address,
  );
  function select(next: DeploymentBundle, focus: string) {
    if (locked) return;
    focusAfterChange.current = focus;
    setEpoch(next.epoch);
  }
  const selection = identity ? (
    <section className="vault-selection" aria-label={t("positions.heading")}>
      <div className="selection-heading">
        <div>
          <h2>
            {t(
              mode === "exit"
                ? "positions.heading"
                : "positions.deposit_heading",
            )}
          </h2>
          <p>{t("positions.note")}</p>
        </div>
        <button
          className="text-button"
          disabled={locked || loading}
          onClick={() => void refresh()}
        >
          {t("positions.refresh")}
        </button>
      </div>
      <ErrorNotice error={error} />
      {loading && !positions && <Busy label={t("positions.loading")} />}
      <div className="vault-selectors">
        <label>
          <span>
            {t(mode === "exit" ? "positions.vault" : "positions.deposit_vault")}
          </span>
          <select
            id="vault-choice"
            aria-label={t("positions.vault")}
            value={mode === "exit" && !held ? "" : bundle.profile.vault.address}
            disabled={locked || (mode === "exit" && !positions)}
            onChange={(event) => {
              const selected =
                routes.find(
                  (b) =>
                    b.profile.vault.address === event.target.value &&
                    b.profile.settlement === bundle.profile.settlement,
                ) ??
                routes.find(
                  (b) => b.profile.vault.address === event.target.value,
                );
              if (selected) select(selected, "vault-choice");
            }}
          >
            {mode === "exit" && (
              <option value="" disabled>
                {t("positions.choose")}
              </option>
            )}
            {vaults
              .filter(
                (b) =>
                  mode === "deposit" ||
                  positions?.positions.some(
                    (p) => p.vault === b.profile.vault.address,
                  ),
              )
              .map((b) => {
                const position = positions?.positions.find(
                  (p) => p.vault === b.profile.vault.address,
                );
                return (
                  <option
                    key={b.profile.vault.address}
                    value={b.profile.vault.address}
                  >
                    {b.vaultName}
                    {mode === "exit" && position
                      ? " · " +
                        t("positions.balance", {
                          amount: formatAmount(
                            position.sharesRaw,
                            position.shareDecimals,
                          ),
                        })
                      : ""}
                  </option>
                );
              })}
          </select>
        </label>
        <label>
          <span>{t("positions.output")}</span>
          <select
            id="output-choice"
            aria-label={t("positions.output")}
            value={bundle.epoch}
            disabled={locked || (mode === "exit" && !held)}
            onChange={(event) => {
              const next = outputRoutes.find(
                (b) => b.epoch === event.target.value,
              );
              if (next) select(next, "output-choice");
            }}
          >
            {outputRoutes.map((b) => (
              <option value={b.epoch} key={b.epoch}>
                {
                  b.tokens.find(
                    (token) => token.address === b.profile.settlement,
                  )!.symbol
                }
              </option>
            ))}
          </select>
          <small>{t("positions.output_note")}</small>
        </label>
      </div>
      {positions && !positions.positions.length && mode === "exit" && (
        <p>{t("positions.empty")}</p>
      )}
      <Identity
        label={t("contracts.vault")}
        value={bundle.profile.vault.address}
        link
      />
    </section>
  ) : undefined;
  return (
    <Workspace
      key={bundle.epoch}
      bundle={bundle}
      identity={identity}
      connect={connect}
      disconnect={disconnect}
      mode={mode}
      onModeChange={setMode}
      selection={selection}
      onLockChange={onLockChange}
    />
  );
}
