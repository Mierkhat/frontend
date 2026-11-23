import { useEffect, useRef, useState } from "react";
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
// Web Locks covers tabs on this origin; the queue also covers browsers without it.
let saveQueue: Promise<unknown> = Promise.resolve();
export function withWatchStorage<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks)
    return navigator.locks.request(storageKey, work);
  const next = saveQueue.then(work, work);
  saveQueue = next.catch(() => {});
  return next;
}
function storeAccess(access: WatchAccess[]) {
  const value = JSON.stringify(access);
  localStorage.setItem(storageKey, value);
  if (localStorage.getItem(storageKey) !== value)
    throw new MierkhatError("WatchStorage", "watch.storage");
}
export async function removeWatchAccess(id: string) {
  await withWatchStorage(async () => storeAccess(readWatchAccess().filter(a => a.id !== id)));
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
  const flight = useRef(false), generation = useRef(0), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    generation.current++;
    setSaved(false);
    setError(undefined);
    return () => { generation.current++; };
  }, [owner, bundle.epoch, kind, shares, minimum, movementBps]);
  async function create() {
    if (flight.current) return;
    flight.current = true;
    const g = generation.current;
    setBusy(true);
    setError(undefined);
    try {
      await withWatchStorage(async () => {
        let created: WatchAccess | undefined;
        try {
          let access: WatchAccess[];
          try { access = readWatchAccess(); storeAccess(access); }
          catch { throw new MierkhatError("WatchStorage", "watch.storage"); }
          if (access.length >= 20) throw new MierkhatError("WatchLimit", "watch.limit");
          const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, "0")).join("");
          const result = await request<{ id: string }>("/watches", {
            owner, epoch: bundle.epoch, kind, sharesRaw: shares, minimumRaw: minimum, movementBps,
          }, { "X-Watch-Key": key });
          created = { id: result.id, key };
          // Read again after admission, so another writer's capabilities survive.
          access = readWatchAccess();
          if (access.length >= 20) throw new MierkhatError("WatchLimit", "watch.limit");
          storeAccess([...access.filter(a => a.id !== created!.id), created]);
          if (g === generation.current) setSaved(true);
        } catch (e) {
          if (created) await request("/watches/" + created.id + "/remove", {}, { "X-Watch-Key": created.key }).catch(() => {});
          throw e;
        }
      });
    } catch (e) {
      if (g === generation.current) setError(e);
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="watch-action">
      <button
        className="button secondary small"
        disabled={busy || saved || !minimum || !shares}
        onClick={() => void create()}
      >
        {t(busy ? "watch.saving" : saved ? "watch.created" : "watch.action")}
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
