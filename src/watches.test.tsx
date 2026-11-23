// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MierkhatError } from "@mierkhat/sdk";
import { WatchButton, readWatchAccess } from "./components/Watches.js";
import { Alerts } from "./pages/WithdrawalTools.js";
import { bundles, request } from "./api.js";
import { t } from "./copy.js";
vi.mock("./api.js", async importOriginal => {
  const real = await importOriginal<typeof import("./api.js")>();
  return { ...real, request: vi.fn() };
});
let host: HTMLDivElement, root: Root;
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
  localStorage.clear(); vi.resetAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
const props = { owner: "owner", bundle: bundles[0]!, shares: "100", minimum: "10", kind: "exit" as const };
it("serializes concurrent admissions, preserves both capabilities and ignores duplicate clicks", async () => {
  let resolve!: (v: unknown) => void;
  vi.mocked(request).mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce({ id: id(2) });
  await act(() => root.render(createElement("div", {}, createElement(WatchButton, props), createElement(WatchButton, props))));
  const buttons = host.querySelectorAll("button");
  await act(async () => { buttons[0]!.click(); buttons[0]!.click(); buttons[1]!.click(); });
  expect(request).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ id: id(1) }); });
  expect(request).toHaveBeenCalledTimes(2);
  expect(readWatchAccess().map(a => a.id)).toEqual([id(1), id(2)]);
  expect(new Set(readWatchAccess().map(a => a.key)).size).toBe(2);
});
it("keeps a delayed capability without marking changed conditions as saved", async () => {
  let resolve!: (v: unknown) => void;
  vi.mocked(request).mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await act(() => root.render(createElement(WatchButton, props)));
  await act(async () => host.querySelector("button")!.click());
  await act(() => root.render(createElement(WatchButton, { ...props, minimum: "20" })));
  await act(async () => { resolve({ id: id(1) }); });
  expect(readWatchAccess()).toHaveLength(1);
  expect(host.textContent).not.toContain(t("watch.created"));
  expect(host.querySelector("button")!.disabled).toBe(false);
});
it("explains the 20 alert limit before creating a remote alert", async () => {
  localStorage.setItem("mierkhat.watches.v1", JSON.stringify(Array.from({length:20}, (_,i) => ({id:id(i),key:"a".repeat(64)}))));
  await act(() => root.render(createElement(WatchButton, props)));
  await act(async () => host.querySelector("button")!.click());
  expect(request).not.toHaveBeenCalled();
  expect(host.textContent).toContain(t("watch.limit"));
});
it("shows initial alert loading and recovers a failed remove action", async () => {
  localStorage.setItem("mierkhat.watches.v1", JSON.stringify([{id:id(1),key:"a".repeat(64)}]));
  let resolve!: (v: unknown) => void;
  vi.mocked(request).mockImplementationOnce(() => new Promise(r => { resolve = r; }))
    .mockRejectedValueOnce(new MierkhatError("Unavailable", "service.unavailable", true));
  await act(() => root.render(createElement(Alerts)));
  expect(host.textContent).toContain(t("watch.loading"));
  await act(async () => { resolve({watch:{id:id(1),epoch:props.bundle.epoch,kind:"exit",minimum_raw:"10",expires_at:new Date().toISOString(),observation:null},notifications:[]}); });
  const remove = Array.from(host.querySelectorAll("button")).find(b => b.textContent === t("watch.remove"))!;
  await act(async () => remove.click());
  expect(remove.disabled).toBe(false);
  expect(host.textContent).toContain(t("service.unavailable"));
  expect(readWatchAccess()).toHaveLength(1);
});
