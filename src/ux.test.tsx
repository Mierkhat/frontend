// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AccountState } from "@mierkhat/sdk";
import { AmountField } from "./components/AmountField.js";
import { validateAmount } from "./validation.js";
import { Workspace } from "./pages/Workspace.js";
import { api, bundles } from "./api.js";
import { t } from "./copy.js";
vi.mock("./api.js", async importOriginal => {
  const real = await importOriginal<typeof import("./api.js")>();
  return { ...real, api: { ...real.api, account: vi.fn() } };
});
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); });
it("gives precise errors without rounding financial inputs", () => {
  expect(validateAmount("1.0000001", 7).raw).toBe("10000001");
  expect(validateAmount("1.00000001", 7).issue).toBe("input.precision");
  expect(validateAmount("0", 7).issue).toBe("input.positive");
  expect(validateAmount("1e2", 7).issue).toBe("input.invalid");
  expect(validateAmount("170141183460469231731687303715884105728", 0).issue).toBe("input.too_large");
  expect(validateAmount("2", 7, { balanceRaw: "19999999" }).issue).toBe("exit.balance");
  expect(validateAmount("2", 7, { maximumRaw: "10000000" }).issue).toBe("exit.high_minimum");
});
it("associates the visible label and inline precision error with the input after blur", async () => {
  await act(() => root.render(createElement(AmountField, { label: "Amount", value: "1.00000001", decimals: 7, unit: "MKA", onChange: () => {} })));
  const input = host.querySelector("input")!;
  expect(host.querySelector("label")!.htmlFor).toBe(input.id);
  expect(input.hasAttribute("aria-invalid")).toBe(false);
  await act(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(input.getAttribute("aria-invalid")).toBe("true");
  const error = document.getElementById(input.getAttribute("aria-describedby")!)!;
  expect(error.textContent).toBe(t("input.precision", { decimals: 7 }));
});
it("ignores an old owner's delayed balance and never calls the parent after unmount", async () => {
  const b = bundles[0]!;
  let oldResolve!: (a: AccountState) => void, newResolve!: (a: AccountState) => void;
  vi.mocked(api.account).mockImplementationOnce(() => new Promise(resolve => { oldResolve = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { newResolve = resolve; }));
  const changed = vi.fn();
  const props = { bundle: b, connect: async () => {}, disconnect: () => {}, mode: "deposit" as const, onModeChange: () => {}, onAccountChange: changed };
  await act(() => root.render(createElement(Workspace, { ...props, identity: { address: "old", networkPassphrase: b.networkPassphrase } })));
  await act(() => root.render(createElement(Workspace, { ...props, identity: { address: "new", networkPassphrase: b.networkPassphrase } })));
  await act(async () => { oldResolve({ owner: "old", funded: true, tokens: [], sharesRaw: "100" } as unknown as AccountState); });
  expect(changed).not.toHaveBeenCalled();
  expect(api.account).toHaveBeenCalledTimes(2);
  await act(() => root.unmount());
  await act(async () => { newResolve({ owner: "new", funded: true, tokens: [], sharesRaw: "200" } as unknown as AccountState); });
  expect(changed).not.toHaveBeenCalled();
  // Replace the unmounted root for shared cleanup.
  root = createRoot(host);
});
