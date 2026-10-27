import {
  bundleSchema,
  decodeReceipt,
  MierkhatError,
  rpc,
  type DeploymentBundle,
  type ExitDraft,
  type Review,
  type SignedAttempt,
  type Observation,
  type NetworkState,
  type AccountState,
  type ExitQuote,
  type SetupDraft,
  type SetupReview,
} from "@mierkhat/sdk";
import pinned from "./deployments.json" with { type: "json" };
export const knownDeployments: DeploymentBundle[] = pinned.map((b) =>
  bundleSchema.parse(b),
);
export const bundles = knownDeployments.filter((b) => b.enabled);
export const reader = new rpc.Server("https://soroban-testnet.stellar.org", {
  timeout: 12000,
});
async function request<T>(
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const r = await fetch("/v1" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) {
    let e: { code?: string; copyKey?: string } = {};
    try {
      e = await r.json();
    } catch {}
    throw new MierkhatError(
      e.code ?? "Unavailable",
      e.copyKey ?? "service.unavailable",
      r.status >= 500,
    );
  }
  return r.json() as Promise<T>;
}
export const api = {
  network: () => request<NetworkState>("/network"),
  account: (owner: string) =>
    request<AccountState>("/accounts/" + encodeURIComponent(owner)),
  fund: (owner: string) => request<AccountState>("/testnet/fund", { owner }),
  faucet: (owner: string) =>
    request<{ hash: string; amounts: { symbol: string; amount: string }[] }>(
      "/testnet/faucet",
      { owner },
    ),
  quote: (owner: string, shares: string) =>
    request<ExitQuote>("/exit/quote", { owner, shares }),
  prepare: (d: ExitDraft) => request<Review>("/exit/prepare", d),
  review: (id: string, environment = "testnet") =>
    request<Review>(
      `/reviews/${encodeURIComponent(id)}?environment=${environment}`,
    ),
  submit: (a: SignedAttempt) =>
    request<{ hash: string }>(
      "/exit/submit",
      {
        environment: a.environment,
        epoch: a.epoch,
        signedXdr: a.signedXdr,
        claimedHash: a.txHash,
        reviewId: a.review.reviewId,
      },
      { "Idempotency-Key": a.signedEnvelopeDigest },
    ),
  setupPrepare: (d: SetupDraft) => request<SetupReview>("/setup/prepare", d),
  setupSubmit: (signedXdr: string, review: SetupReview) =>
    request<{ hash: string }>("/setup/submit", { signedXdr, review }),
  status: async (
    hash: string,
    environment = "testnet",
  ): Promise<Observation> => {
    try {
      return await request<Observation>(
        `/transactions/${hash}?environment=${environment}`,
      );
    } catch {
      const b = knownDeployments.find((b) => b.environment === environment);
      if (!b) throw new MierkhatError("Environment", "network.wrong");
      return decodeReceipt(reader, b, hash);
    }
  },
};
