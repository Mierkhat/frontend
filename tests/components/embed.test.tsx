// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExitController, MierkhatError, inspectSigned, bundleSchema } from "@mierkhat/sdk";
import { MierkhatReview, type MierkhatReviewProps } from "../../embed/src/index.js";
import deployments from "../../src/deployments.json";
import historical from "../fixtures/chain-success.json";
import { t } from "@mierkhat/copy";
// These test callback orchestration; real SDK policy/XDR is covered by SDK tests.
vi.mock("@mierkhat/sdk", async importOriginal => {
  const real = await importOriginal<typeof import("@mierkhat/sdk")>();
  return { ...real, verifyReview: vi.fn(candidate => candidate) };
});
const bundle = bundleSchema.parse({...deployments[0],enabled:true,reviewed:true});
const attempt = inspectSigned(historical.envelopeXdr, bundle);
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
function properties(): MierkhatReviewProps {
  return { deployment:bundle, draft:attempt.review.draft,
    wallet:{identity:async()=>({address:attempt.review.draft.intent.owner,networkPassphrase:bundle.networkPassphrase}),sign:vi.fn()},
    prepare:vi.fn(async()=>attempt.review), ledger:async()=>({sequence:attempt.review.preparedLedger,timestamp:attempt.review.preparedTime,sourceSequence:"1"}),
    verifyDeployment:async()=>{},submit:vi.fn(async()=>{}),
    lookup:vi.fn(async (hash: string)=>({hash,state:"unknown" as const,observedAt:new Date().toISOString()})),onReceipt:vi.fn(),onStatus:vi.fn() };
}
function button(name: string) { return Array.from(host.querySelectorAll("button")).find(b=>b.textContent===name)!; }
async function prepared(p: MierkhatReviewProps) {
  await act(()=>root.render(createElement(MierkhatReview,p)));
  await act(async()=>button(t("review.refresh")).click());
  expect(button(t("action.sign")).disabled).toBe(true);
  await act(()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
}
it("retains the exact attempt after a lost response and blocks replacement signing across draft changes",async()=>{
  const p=properties(), sign=vi.spyOn(ExitController.prototype,"signExit").mockResolvedValue(attempt);
  vi.mocked(p.submit).mockRejectedValueOnce(Error("lost response")).mockResolvedValueOnce({});
  await prepared(p);
  await act(async()=>button(t("action.sign")).click());
  expect(button(t("embed.retry"))).toBeDefined();
  await act(()=>root.render(createElement(MierkhatReview,{...p,draft:{...p.draft,revision:p.draft.revision+1,intent:{...p.draft.intent,shares:"1"}}})));
  expect(button(t("review.refresh")).disabled).toBe(true);
  await act(async()=>button(t("embed.retry")).click());
  expect(sign).toHaveBeenCalledTimes(1);
  expect(p.submit).toHaveBeenCalledTimes(2);
  expect(vi.mocked(p.submit).mock.calls[0]![0]).toBe(vi.mocked(p.submit).mock.calls[1]![0]);
  expect(vi.mocked(p.submit).mock.calls[1]![0].signedXdr).toBe(attempt.signedXdr);
  expect(vi.mocked(p.submit).mock.calls[1]![0].txHash).toBe(attempt.txHash);
  expect(vi.mocked(p.submit).mock.calls[1]![0].signedEnvelopeDigest).toBe(attempt.signedEnvelopeDigest);
  expect(host.textContent).toContain("100"); // frozen signed shares, not the parent's new amount
});
it("refreshes a stale review and requires confirmation again",async()=>{
  const p=properties();vi.spyOn(ExitController.prototype,"signExit").mockRejectedValueOnce(new MierkhatError("StaleQuote","review.stale"));
  await prepared(p);
  await act(async()=>button(t("action.sign")).click());
  expect(host.textContent).toContain(t("review.stale"));
  await act(async()=>button(t("review.refresh")).click());
  expect(p.prepare).toHaveBeenCalledTimes(2);
  expect(button(t("action.sign")).disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false);
});
it("keeps a terminal receipt when the original submit callback later rejects",async()=>{
  const p=properties(); let reject!: (e: unknown)=>void;
  vi.spyOn(ExitController.prototype,"signExit").mockResolvedValue(attempt);
  vi.mocked(p.submit).mockImplementation(()=>new Promise((_,r)=>{reject=r;}));
  vi.mocked(p.lookup).mockResolvedValue({hash:attempt.txHash,state:"succeeded",observedAt:new Date().toISOString()});
  await prepared(p);
  await act(async()=>button(t("action.sign")).click());
  await act(async()=>{reject(Error("late rejection"));});
  expect(p.onReceipt).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain(t("success.heading"));
  expect(button(t("embed.retry"))).toBeUndefined();
});
