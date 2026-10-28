import { useEffect, useState } from "react";
import { MierkhatError, type DeploymentBundle } from "@mierkhat/sdk";
import { request } from "../api.js";
import { t } from "../copy.js";
import { ErrorNotice } from "./Shared.js";
export interface WatchAccess {
  id: string;
  key: string;
}
const storageKey = "mierkhat.watches.v1";
export function readWatchAccess(): WatchAccess[] {
  const data = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
  if (!Array.isArray(data)) throw Error("WatchStorage");
  return data
    .filter(
      (v): v is WatchAccess =>
        !!v &&
        typeof v.id === "string" &&
        /^[a-f0-9-]{36}$/.test(v.id) &&
        typeof v.key === "string" &&
        /^[a-f0-9]{64}$/.test(v.key),
    )
    .slice(0, 20);
}
export function WatchButton({
  owner,
  bundle,
  shares,
  minimum,
  kind,
  movementBps = 50,
}: {
  owner: string;
  bundle: DeploymentBundle;
  shares: string;
  minimum: string;
  kind: "exit" | "migration";
  movementBps?: number;
}) {
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState<unknown>();
  useEffect(() => {
    setSaved(false);
    setError(undefined);
  }, [owner, bundle.epoch, shares, minimum, movementBps]);
  async function create() {
    setBusy(true);
    setError(undefined);
    let created: WatchAccess | undefined;
    try {
      let access: WatchAccess[];
      try {
        access = readWatchAccess();
        localStorage.setItem(storageKey, JSON.stringify(access));
        if (access.length >= 20) throw Error("WatchLimit");
      } catch {
        throw new MierkhatError("WatchStorage", "watch.storage");
      }
      const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
        n.toString(16).padStart(2, "0"),
      ).join("");
      const result = await request<{ id: string }>(
        "/watches",
        {
          owner,
          epoch: bundle.epoch,
          kind,
          sharesRaw: shares,
          minimumRaw: minimum,
          movementBps,
        },
        { "X-Watch-Key": key },
      );
      created = { id: result.id, key };
      localStorage.setItem(storageKey, JSON.stringify([...access, created]));
      setSaved(true);
    } catch (e) {
      if (created)
        await request(
          "/watches/" + created.id + "/remove",
          {},
          { "X-Watch-Key": created.key },
        ).catch(() => {});
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="watch-action">
      <button
        className="button secondary small"
        disabled={busy || saved || !minimum || !shares}
        onClick={() => void create()}
      >
        {t(saved ? "watch.created" : "watch.action")}
      </button>
      {saved && (
        <a className="text-link" href="/alerts">
          {t("nav.alerts")}
        </a>
      )}
      <ErrorNotice error={error} />
    </div>
  );
}
export interface WatchState {
  watch: {
    id: string;
    owner: string;
    epoch: string;
    kind: "exit" | "migration";
    shares_raw: string;
    minimum_raw: string;
    movement_bps: number;
    expires_at: string;
    observation: WatchObservation | null;
  };
  notifications: {
    id: string;
    observation: WatchObservation;
    created_at: string;
    seen_at: string | null;
  }[];
}
interface WatchObservation {
  state: "met" | "unmet" | "unknown";
  checkedAt: string;
  reason: string;
  ledger?: number;
  estimatedRaw?: string;
}
export async function readWatch(a: WatchAccess): Promise<WatchState> {
  return request<WatchState>("/watches/" + a.id, undefined, {
    "X-Watch-Key": a.key,
  });
}
