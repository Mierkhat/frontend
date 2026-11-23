# Changes since the rejected Drips submission

Verified locally on 24 November 2026. The maintainer confirmed the rejected
heads were frontend `e168d9f`, backend `b09a7aa`, contracts `6462182`.
Rejection feedback was not supplied; these changes address observed defects.

## Suggested resubmission account

Since the rejected version, Mierkhat has fixed missing migration restoration
coverage and destination-decimal verification, added transient provider failover
and environment-isolated setup lookup, and strengthened migration deadline tests.
The frontend now gives exact inline financial errors, clearer testnet onboarding,
a direct empty-position deposit action and protection against late balance reads.
Alert saves preserve concurrent capabilities and show loading/action recovery.
The optional embed retains exact signed retries after uncertain admission,
requires confirmation, refreshes stale reviews and preserves terminal outcomes.
Local database shutdown now waits for workers and the API to drain.

The application remains a Stellar testnet demonstration with six withdrawal
profiles across two strategy-free vaults and two separate migration profiles.
MKA/MKB/MKOUT have no monetary value. This update does not establish external
yield-strategy support, partner adoption, independent security audit or mainnet
readiness. The Vercel account remains paused.

## Completed implementation ledger

| Repository / commit | Concrete change and regression coverage |
| --- | --- |
| frontend `88475e7`; backend `70b2099`; contracts `86f3d89` | Committed review plans before implementation, anchored to the rejected heads; system inventory and further development gates. |
| backend `2ea3a52` | Restore-key footprint includes migration destination instance/pairs/code and deduplicates keys; verifies destination share decimals. SDK regressions inspect ledger-key XDR and reject decimal mismatch. |
| backend `f651c25` | Retryable read failures try the next verified provider; deterministic rejection remains terminal. API preserves retryable status and prevents mainnet lookup of stored testnet setup records. |
| frontend `abcd1d2` | Repacked reviewed SDK for app/embed, lockfile and checksum/source-tree provenance. |
| contracts `f9d86ef` | Compiled-WASM tests reject equality at either migration deadline with unchanged full ledger state, and succeed at the last valid boundaries for both destination layouts. |
| frontend `a873af0` | Shared exact amount validation for withdrawal/target/minimum/deposit/migration, accessible inline errors, address/hash feedback and receipt refresh recovery. Single-flight balance reads reject old-account/unmounted results. Disconnected onboarding and empty-position deposit action. |
| frontend `8778f55` | Serialized/merged/verified alert storage; duplicate-click and changed-condition guards; distinct 20-alert limit, initial loading, row busy states and failed action recovery; notification exceptions handled. |
| frontend `ad838ef` | Exact attempt/pointer retained on uncertain embed submission, same-byte retry, frozen signed details, blocked replacement prompt, explicit confirmation, stale refresh and terminal-result preservation. Callback regressions added and test types checked in CI. |
| frontend `440fae5` | Documented incumbent design conventions; standard notice outline, scope deep-link, accurate paused-service and alert-availability copy. |
| backend `11760c3` | Idempotent awaited worker/API/pool shutdown before local PostgreSQL stop; bounded idle-pool error logging. |

Final documentation and compatibility commits follow these implementation
commits. Sibling pins intentionally identify the complete reviewed code before
pin-only commits, avoiding self-referential hashes. The SDK source tree remains
`0a5cad9767d91f0e5aa9e8eed394fe348b09ef34`; its provenance source is backend
`f651c25`, also an ancestor of the release revision. No contract executable,
registry identity, ABI, fee cap or signing policy was changed.

## Verification and its limits

| Check | Actual local outcome |
| --- | --- |
| Frontend | Frozen install; production build; app/copy/embed/test types; 14 unit/component tests (rejected baseline: 4); 563-entry product copy check. |
| SDK / backend | Build/app/SDK/script/API types; 40 SDK tests (38), 9 backend unit tests (8), 19 tests against real PostgreSQL (18); eight deployment records verified. |
| Contracts | Pinned upstream/guard/migration builds; 20 compiled-WASM fixture tests (18); locked workspace tests, formatting and artifact verification; deployed WASM hashes match. |
| Browser | Six Chromium CI navigation/wallet-dialog/focus cases at 320/768/1440 in both themes. Twelve baseline captures and 36 final captures across home/workspace/alerts/check/migration/help; address/hash/deep-link interactions; no overflow/page errors. Representative final captures visually inspected. |
| Security / release | Redacted Git history scans, actionlint/action pins and production dependency audits passed in the applicable repos. Frontend/backend each passed 10 release-boundary tests using controlled deployment callbacks; these are not actual deployments. |
| Real local service | PostgreSQL/API health reports ready. Fresh `/v1/network` returned real balances/supply at testnet ledger 5890605, protocol 30. Direct SDK/provider reads also succeeded; 14/14 withdrawal restoration entries were present at ledger 5890497. Intermittent upstream failures were observed. |
| Recovery operation | Final local launcher reused persisted database, drained and stopped on signal without the previous idle-client exception. |
| Design | Impeccable/UI UX Pro Max guidance applied; source detector's one existing thick-side-border finding resolved. Fonts, mark, palette and incumbent layout identity preserved in DESIGN.md. |

Embed orchestration tests use the historical signed envelope and controlled
controller/callback results. They verify UI recovery, not fresh Freighter
approval. October public receipts, screenshots and integration evidence were
already present in the rejected version and are not new accomplishments.
Screenshots/logs from this review remain in ignored local tooling directories.
Web Locks serialize supported same-origin tabs; the fallback queue covers writes
within one document. Browsers without Web Locks do not have cross-tab atomicity.
The main JavaScript chunk is about 1,115 kB / 269 kB gzip; Vite's size warning
remains. This review did not establish a new Core Web Vitals score.

## Hosted demo and next developments

Vercel returns HTTP 402 DEPLOYMENT_DISABLED while the account is paused.
No production deployment or fresh signed-wallet end-to-end acceptance is claimed.
For a reproducible local check, use Node 24.22.1/pnpm 12.15.0, run `pnpm local`
in backend and `pnpm dev` in frontend; Vite forwards `/v1` to port 3001.
Dedicated issuer configuration is required for new test-token issuance.

The next substantive milestones are an externally useful-vault pilot, a
separately reviewed strategy-aware adapter, genuine cold-restoration acceptance,
restored hosting with measured unattended alert cadence, and independent
security review. Each prerequisite and deliverable is scoped in
[REVIEW_PLAN.md](REVIEW_PLAN.md). Those dependencies remain separate from this
completed code update.

Repository-specific evidence: [backend report](https://github.com/Mierkhat/backend/blob/main/docs/RESUBMISSION.md)
and [contracts report](https://github.com/Mierkhat/contracts/blob/main/docs/RESUBMISSION.md).
