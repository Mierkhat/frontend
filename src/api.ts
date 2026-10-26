import type {
  DeploymentBundle,
  ExitDraft,
  Observation,
  Review,
  SignedAttempt,
} from "@mierkhat/sdk";
import { MierkhatError, bundleSchema, decodeReceipt, rpc } from "@mierkhat/sdk";
// Versioned, bundled trust anchors. HTTP discovery alone cannot enable a deployment.
import pinned from "./deployments.json" with { type: "json" };
export const knownDeployments: DeploymentBundle[] = pinned.map((v) =>
  bundleSchema.parse(v),
);
export const bundles = knownDeployments.filter((b) => b.enabled);
const reader = new rpc.Server("https://soroban-testnet.stellar.org");
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch("/v1" + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let code = "Unavailable",
      copyKey = "service.unavailable";
    try {
      const err = await response.json();
      code = String(err.code);
      copyKey = String(err.copyKey);
    } catch {}
    throw new MierkhatError(code, copyKey, response.status >= 500);
  }
  return response.json() as Promise<T>;
}
export const api = {
  prepare: (d: ExitDraft) =>
    request<Review>("/exit/prepare", {
      method: "POST",
      body: JSON.stringify({
        environment: d.environment,
        epoch: d.epoch,
        revision: d.revision,
        intent: d.intent,
      }),
    }),
  review: (id: string, environment: string) =>
    request<Review>(
      `/reviews/${encodeURIComponent(id)}?environment=${encodeURIComponent(environment)}`,
    ),
  submit: (a: SignedAttempt) =>
    request<{ hash: string }>(`/exit/submit`, {
      method: "POST",
      headers: { "Idempotency-Key": a.signedEnvelopeDigest },
      body: JSON.stringify({
        environment: a.environment,
        epoch: a.epoch,
        signedXdr: a.signedXdr,
        claimedHash: a.txHash,
        reviewId: a.review.reviewId,
      }),
    }),
  status: async (hash: string, environment: string): Promise<Observation> => {
    const b = knownDeployments.find((b) => b.environment === environment);
    if (!b)
      return { hash, state: "unknown", observedAt: new Date().toISOString() };
    return decodeReceipt(reader, b, hash);
  },
};
