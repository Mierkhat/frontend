import { expect, type Page } from "@playwright/test";
import {
  Account, Address, Contract, Keypair, Operation, SorobanDataBuilder,
  Transaction, TransactionBuilder, nativeToScVal, StrKey, xdr,
} from "@stellar/stellar-sdk";
import { authDigest, digest, intentHash, intentScVal, profileScVal, type DeploymentBundle, type ExitDraft, type Review } from "@mierkhat/sdk";
import deployments from "../src/deployments.json" with { type: "json" };
import { t } from "@mierkhat/copy";

// Ephemeral test signers and a simulated RPC exercise the shipped SDK and app.
// No private key is serialized, persisted, or passed into the browser.
export async function secureFlow(page: Page, options: { holdSignature?: boolean; mutateSignature?: boolean; tamperReview?: boolean; loseSubmission?: boolean } = {}) {
  const bundle = deployments.find(b => b.enabled && !b.migration)! as DeploymentBundle;
  const key = Keypair.random(), other = Keypair.random().publicKey();
  let ledger = 100, timestamp = 1000;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));

  const submitted: { body: unknown; idempotency: string | undefined }[] = [];
  const drafts: ExitDraft[] = [];
  let signatureCount = 0, quoteCount = 0;
  let pendingSignature: (() => void) | undefined;
  let signedHash = "", afterSignatureIdentityReads = 0;
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.exposeBinding("__ciIdentity", () => { if (signedHash) afterSignatureIdentityReads++; });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:4179") await route.continue();
    else { errors.push("Unexpected external request: " + url.origin + url.pathname); await route.abort(); }
  });
  await page.clock.install({ time: new Date(timestamp * 1000) });
  await page.exposeBinding("__ciSign", async (_source, encoded: string) => {
    signatureCount++;
    if (options.holdSignature) await new Promise<void>(resolve => { pendingSignature = resolve; });
    let tx = TransactionBuilder.fromXDR(encoded, bundle.networkPassphrase) as Transaction;
    if (options.mutateSignature) {
      const envelope = tx.toEnvelope();
      if (envelope.type !== "envelopeTypeTx") throw Error("Fixture envelope");
      const body = envelope.v1.tx;
      tx = new Transaction(xdr.TransactionEnvelope.envelopeTypeTx(new xdr.TransactionV1Envelope({
        tx: new xdr.Transaction({ ...body, memo: xdr.Memo.memoText("unauthorized change") }), signatures: [],
      })), bundle.networkPassphrase);
    }
    tx.sign(key);
    signedHash = Buffer.from(tx.hash()).toString("hex");
    return tx.toXDR();
  });
  await page.addInitScript(({ owner, passphrase }) => {
    const state = window as unknown as { __ciOwner: string; __ciSign: (value: string) => Promise<string>; __ciIdentity: () => Promise<void> };
    state.__ciOwner = owner;
    window.addEventListener("message", async event => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== "FREIGHTER_EXTERNAL_MSG_REQUEST") return;
      const request = event.data;
      let value: Record<string, unknown> = {};
      if (request.type === "REQUEST_CONNECTION_STATUS") value = { isConnected: true };
      else if (["REQUEST_ACCESS", "REQUEST_PUBLIC_KEY"].includes(request.type)) { void state.__ciIdentity(); value = { publicKey: state.__ciOwner }; }
      else if (request.type === "REQUEST_NETWORK_DETAILS") value = { networkDetails: { network: "TESTNET", networkPassphrase: passphrase, networkUrl: "https://horizon-testnet.stellar.org" } };
      else if (request.type === "SUBMIT_TRANSACTION") value = { signedTransaction: await state.__ciSign(request.transactionXdr), signerAddress: request.accountToSign };
      else throw new Error("Unexpected Freighter request: " + request.type);
      window.postMessage({ source: "FREIGHTER_EXTERNAL_MSG_RESPONSE", messagedId: request.messageId, ...value }, location.origin);
    });
  }, { owner: key.publicKey(), passphrase: bundle.networkPassphrase });

  function account(owner: string) {
    return { owner, funded: true, sharesRaw: "1000000000", nativeBalanceRaw: "1000000000", tokens: bundle.tokens.map(token => ({ ...token, trusted: true, balanceRaw: "1000000000" })) };
  }
  function review(draft: ExitDraft): Review {
    drafts.push(structuredClone(draft));
    const raw = new Contract(bundle.guard).call("execute_exit", intentScVal(draft.intent));
    if (raw.body.type !== "invokeHostFunction" || raw.body.invokeHostFunctionOp.hostFunction.type !== "hostFunctionTypeInvokeContract") throw Error("Fixture ABI");
    const auth = new xdr.SorobanAuthorizationEntry({
      credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
      rootInvocation: new xdr.SorobanAuthorizedInvocation({
        function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(raw.body.invokeHostFunctionOp.hostFunction.invokeContract),
        subInvocations: [new xdr.SorobanAuthorizedInvocation({
          function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(new xdr.InvokeContractArgs({
            contractAddress: Address.fromString(bundle.profile.vault.address).toScAddress(), functionName: "transfer",
            args: [Address.fromString(draft.intent.owner).toScVal(), Address.fromString(bundle.guard).toScVal(), nativeToScVal(BigInt(draft.intent.shares), { type: "i128" })],
          })), subInvocations: [],
        })],
      }),
    });
    const tx = new TransactionBuilder(new Account(draft.intent.owner, "1"), { networkPassphrase: bundle.networkPassphrase, fee: "1000" })
      .addOperation(Operation.invokeHostFunction({ func: raw.body.invokeHostFunctionOp.hostFunction, auth: [auth] }))
      .setTimebounds(0, Number(draft.intent.valid_before_time) - 1).setLedgerbounds(0, draft.intent.valid_before_ledger)
      .setSorobanData(new SorobanDataBuilder().build()).build();
    const result: Review = { reviewId: null, draft, profile: bundle.profile, transactionXdr: tx.toXDR(), envelopeDigest: digest(tx.toEnvelope().toXDR()), intentHash: intentHash(draft.intent), profileHash: bundle.profileHash, observedAuthDigest: authDigest(tx), preparedLedger: ledger, preparedTime: String(timestamp), expectedReceiveRaw: "100000000", feeMaximumStroops: tx.fee };
    if (options.tamperReview) result.draft = { ...draft, intent: { ...draft.intent, min_receive: "1" } };
    return result;
  }
  await page.route("**/v1/**", async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    const body = route.request().postDataJSON();
    let value: unknown;
    if (path.endsWith("/positions")) value = { owner: key.publicKey(), positions: [{ vault: bundle.profile.vault.address, vaultName: bundle.vaultName, sharesRaw: "1000000000", shareDecimals: 7 }] };
    else if (path.startsWith("/v1/accounts/")) value = account(decodeURIComponent(path.split("/")[3]!));
    else if (path === "/v1/exit/quote") {
      quoteCount++;
      value = { sharesRaw: body.shares, receiveRaw: "100000000", withdrawnRaw: bundle.profile.assets.map(() => "50000000"), swappedRaw: bundle.profile.assets.map(() => "50000000"), timestamp: String(timestamp), ledger };
    } else if (path === "/v1/exit/prepare") value = review(body);
    else if (path === "/v1/exit/submit") {
      submitted.push({ body, idempotency: route.request().headers()["idempotency-key"] });
      if (options.loseSubmission && submitted.length === 1) { await route.fulfill({ status: 503, json: { code: "Unavailable", copyKey: "service.unavailable" } }); return; }
      value = { hash: signedHash };
    } else if (path.startsWith("/v1/transactions/")) value = { state: "unknown", rawStatus: "NOT_FOUND" };
    else if (path === "/v1/withdrawals/readiness") value = { state: "ready", eligible: true, blockers: [] };
    else throw new Error("Unexpected API request: " + path);
    await route.fulfill({ json: value });
  });
  await page.route("https://soroban-testnet.stellar.org/**", async route => {
    const request = route.request().postDataJSON();
    let result: unknown;
    if (request.method === "getLatestLedger") {
      const zero = Buffer.alloc(32);
      const header = new xdr.LedgerHeader({ ledgerVersion: 29, previousLedgerHash: zero,
        scpValue: new xdr.StellarValue({ txSetHash: zero, closeTime: BigInt(timestamp), upgrades: [], ext: xdr.StellarValueExt.stellarValueBasic() }),
        txSetResultHash: zero, bucketListHash: zero, ledgerSeq: ledger, totalCoins: 0n, feePool: 0n, inflationSeq: 0, idPool: 0n,
        baseFee: 100, baseReserve: 5000000, maxTxSetSize: 100, skipList: [zero, zero, zero, zero], ext: xdr.LedgerHeaderExt.v0() });
      const metadata = xdr.LedgerCloseMeta.v0(new xdr.LedgerCloseMetaV0({
        ledgerHeader: new xdr.LedgerHeaderHistoryEntry({ hash: zero, header, ext: xdr.LedgerHeaderHistoryEntryExt.v0() }),
        txSet: new xdr.TransactionSet({ previousLedgerHash: zero, txs: [] }), txProcessing: [], upgradesProcessing: [], scpInfo: [],
      }));
      result = { id: "01".repeat(32), sequence: ledger, closeTime: String(timestamp), protocolVersion: 29, headerXdr: header.toXDR("base64"), metadataXdr: metadata.toXDR("base64") };
    }
    else if (request.method === "getNetwork") result = { passphrase: bundle.networkPassphrase, protocolVersion: 29 };
    else if (request.method === "getLedgerEntries") {
      const pins = [{ address: bundle.guard, wasm_hash: bundle.guardWasmHash }, bundle.profile.vault, bundle.profile.router, bundle.profile.factory, ...bundle.profile.assets.flatMap(a => a.pair ? [a.pair] : [])];
      const entries = request.params.keys.map((encoded: string) => {
        const entryKey = xdr.LedgerKey.fromXDR(encoded, "base64");
        let value: xdr.LedgerEntryData;
        if (entryKey.type === "account") value = xdr.LedgerEntryData.account(new xdr.AccountEntry({
          accountId: entryKey.account.accountId, balance: 1000000000n, seqNum: 1n, numSubEntries: 0, inflationDest: null,
          flags: 0, homeDomain: "", thresholds: Buffer.from([1, 0, 0, 0]), signers: [], ext: xdr.AccountEntryExt.v0(),
        }));
        else if (entryKey.type === "contractData") {
          const address = Address.fromScAddress(entryKey.contractData.contract).toString();
          const pin = pins.find(p => p.address === address);
          value = xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry({ ...entryKey.contractData, ext: xdr.ExtensionPoint.v0(),
            val: xdr.ScVal.scvContractInstance(new xdr.ScContractInstance({ storage: [], executable: pin ? xdr.ContractExecutable.contractExecutableWasm(Buffer.from(pin.wasm_hash, "hex")) : xdr.ContractExecutable.contractExecutableStellarAsset() })),
          }));
        } else throw Error("Unexpected ledger entry");
        return { key: encoded, xdr: value.toXDR("base64"), lastModifiedLedgerSeq: ledger, liveUntilLedgerSeq: ledger + 10000 };
      });
      result = { entries, latestLedger: ledger };
    } else if (request.method === "simulateTransaction") {
      const tx = TransactionBuilder.fromXDR(request.params.transaction, bundle.networkPassphrase) as Transaction;
      const operation = tx.operations[0]!;
      if (operation.type !== "invokeHostFunction" || operation.func.type !== "hostFunctionTypeInvokeContract") throw Error("Unexpected read transaction");
      const read = operation.func.invokeContract, method = read.functionName.toString();
      const address = Address.fromScAddress(read.contractAddress).toString();
      const token = bundle.tokens.find(t => t.address === address);
      const value = method === "profile" ? profileScVal(bundle.profile) : nativeToScVal(method === "decimals" ? (token?.decimals ?? bundle.shareDecimals) : token?.symbol, { type: method === "decimals" ? "u32" : "string" });
      result = { latestLedger: ledger, minResourceFee: "0", transactionData: new SorobanDataBuilder().build().toXDR("base64"), results: [{ auth: [], xdr: value.toXDR("base64") }] };
    } else throw Error("Unexpected RPC: " + request.method);
    await route.fulfill({ json: { jsonrpc: "2.0", id: request.id, result } });
  });
  return {
    errors, bundle, owner: key.publicKey(), other, submitted, drafts,
    changeAccount: async () => { await page.evaluate(address => { (window as unknown as { __ciOwner: string }).__ciOwner = address; }, other); },
    afterSignatureIdentityReads: () => afterSignatureIdentityReads,
    signatures: () => signatureCount, quotes: () => quoteCount, hash: () => signedHash,
    releaseSignature: () => { expect(pendingSignature).toBeDefined(); pendingSignature!(); },
    advance: async (seconds: number) => { timestamp += seconds; ledger += Math.floor(seconds / 5); await page.clock.runFor(seconds * 1000); },
    connect: async () => {
      await page.goto("/app?epoch=" + bundle.epoch);
      await page.getByRole("button", { name: t("wallet.connect"), exact: true }).first().click();
      await page.getByRole("dialog").getByRole("button", { name: /Freighter/ }).click();
      await expect(page.getByRole("button", { name: t("withdrawal.next"), exact: true })).toBeEnabled();
    },
    prepare: async (settings: { minimum?: string; quoteAge?: number } = {}) => {
      await page.getByRole("button", { name: t("withdrawal.next"), exact: true }).click();
      await page.getByRole("textbox", { name: t("action.shares"), exact: true }).fill("1");
      await page.getByRole("button", { name: t("exit.quote"), exact: true }).click();
      const minimum = page.getByRole("textbox", { name: t("action.minimum"), exact: true });
      await expect(minimum).not.toHaveValue("");
      if (settings.minimum) await minimum.fill(settings.minimum);
      if (settings.quoteAge) {
        timestamp += settings.quoteAge; ledger += Math.floor(settings.quoteAge / 5);
        await page.clock.runFor(settings.quoteAge * 1000);
      }
      await page.getByRole("button", { name: t("withdrawal.next"), exact: true }).click();
    },
    confirm: async () => {
      await page.getByRole("button", { name: t("withdrawal.next"), exact: true }).click();
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: t("action.sign"), exact: true }).click();
    },
  };
}
