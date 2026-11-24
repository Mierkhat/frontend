// @vitest-environment happy-dom
import { StrictMode, act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NetworkState } from "@mierkhat/sdk";
import { App } from "./App.js";
import { api } from "./api.js";
import { t } from "./copy.js";
vi.mock("./api.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("./api.js")>();
  return { ...real, api: { ...real.api, network: vi.fn() } };
});
vi.mock("./motion.js", () => ({ usePageMotion: () => {} }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.resetAllMocks(); localStorage.clear();
  location.href = "http://localhost/";
  host = document.createElement("div"); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount()); host.remove(); vi.useRealTimers();
});
const snapshot = (ledger: number) => ({ ledger, totalSharesRaw: "1", assets: [] }) as unknown as NetworkState;
it("bounds timer and manual refreshes while a network read is pending", async () => {
  let resolve!: (n: NetworkState) => void;
  vi.mocked(api.network).mockImplementation(() => new Promise((r) => { resolve = r; }));
  await act(() => root.render(createElement(App)));
  await act(async () => {
    host.querySelector<HTMLButtonElement>(`button[aria-label="${t("workspace.refresh")}"]`)!.click();
    vi.advanceTimersByTime(45000);
  });
  expect(api.network).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(snapshot(12345)); });
  expect(host.textContent).toContain("12345");
  await act(async () => { vi.advanceTimersByTime(15000); });
  expect(api.network).toHaveBeenCalledTimes(2);
});
it("ignores an obsolete success or failure after effect teardown and restart", async () => {
  let resolveOld!: (n: NetworkState) => void, rejectOld!: (e: Error) => void;
  vi.mocked(api.network)
    .mockImplementationOnce(() => new Promise((resolve, reject) => { resolveOld = resolve; rejectOld = reject; }))
    .mockResolvedValueOnce(snapshot(54321));
  // StrictMode replays setup/cleanup while preserving the component refs.
  await act(() => root.render(createElement(StrictMode, {}, createElement(App))));
  expect(host.textContent).toContain("54321");
  await act(async () => { rejectOld(Error("obsolete provider failure")); });
  expect(host.textContent).toContain("54321");
  await act(() => root.unmount()); root = createRoot(host);
  vi.mocked(api.network)
    .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValueOnce(snapshot(65432));
  await act(() => root.render(createElement(StrictMode, {}, createElement(App))));
  await act(async () => { resolveOld(snapshot(11111)); });
  expect(host.textContent).toContain("65432");
  expect(host.textContent).not.toContain("11111");
});
