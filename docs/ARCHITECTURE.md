# Architecture

The home page explains shares, conversion and the signed minimum. `/app` is the transaction workspace. Activity, help, contract details, shared reviews, pending operations and receipts reuse the typed copy and SDK policies. Light, Dark and System appearances provide visible focus and reduced-motion support.

`src/api.ts` talks to the same-origin `/v1` API and the pinned testnet RPC. `src/deployments.json` contains trusted deployment pins; discovery cannot enable a different profile. `copy/src/en.json` owns interface copy and is consumed by the embed and browser checks.

## Wallet and transaction flow

Connect opens an accessible selector before calling Freighter, the implemented provider. Detection, installation guidance, approval progress and errors stay in the dialog. Cancellation invalidates late responses and restores focus.

The workspace groups actual wallet holdings once per supported vault. Users select a vault position and one of its pinned output tokens, enter shares, obtain a quote, choose a minimum and review the exact transaction. Multiple deposits and output routes do not create extra positions. Choosing a different vault or output destroys the old editor/review controller and restores focus to the changed selector; both selectors lock during preparation, signing and unsent recovery. Deposit mode lists supported vaults even before the wallet owns their shares. Periodic balance and position reads pause during preparation/signing so they do not compete with those requests. The SDK verifies deployment pins, source, arguments, nested transfers, bounds, fees and wallet identity before signing. Setup has separate policies for trustlines, deposits and restoration. A restoration cannot be silently appended to an exit. `ExitController` invalidates stale work when account, network, epoch or review changes.

Reviewing refreshes a quote older than twenty seconds while preserving the exact share quantity and the minimum the user entered. If the new estimate cannot meet that minimum, a focused, visible error explains the issue; it never lowers the minimum automatically. A completed review receives keyboard focus and scrolls into view. Action errors receive the same treatment, while background balance checks do not move focus.

The guard redeems and swaps withdrawn assets in one invocation. The quote is an estimate; the signed minimum is an on-chain condition. A failed condition reverses contract changes but may consume network fees.

## Recovery and shared packages

Exact signed bytes stay in browser memory for retry and are encrypted in the backend after admission. Browser storage contains only validated public recovery pointers, never envelopes, private keys or seeds. Reload uses public hashes. An uncertain result is not called a failure. Historical transaction success alone does not establish a decoded guard receipt without committed metadata.

`copy/` owns typed interpolation; `embed/` provides the React review component. The standalone `.vendor/` SDK archive is shared by both app and embed. Update its provenance, both dependency references and lockfile together.

## Motion and keyboard behavior

Sections reveal once as they enter view, including newly mounted review panels. The Web Animations API affects surfaces rather than counting or replacing financial values. Content stays visible when animation/observer support is unavailable. Focusing a moving region cancels its reveal immediately; changing the OS reduced-motion preference cancels active motion. Reduced-motion CSS removes spinner, dialog, menu and feedback animation entirely. Menus/dialogs use short entrance transitions; receipt checks animate only when confirmed. Mobile navigation closes with Escape and restores toggle focus. Transaction tabs expose linked tab/panel roles, roving focus and Arrow/Home/End keyboard selection.

## Multiple routes and receipts

`PositionsWorkspace` owns the vault/output choice and live position reads. `Workspace` owns one route's editor, keyed by deployment epoch; account reads, setup and quote construction include that epoch. The SDK verifies the corresponding immutable profile before approval. A route is selected from locally pinned enabled bundles; server discovery cannot authorize arbitrary contracts.

Receipt token labels, decimals and downloads resolve the bundle by the verified receipt's profile hash. Shared reviews select their bundle from the actual review epoch/profile. For hashes without a local or backend record, direct lookup uses the actual guard invocation to choose among trusted profiles, then verifies the full receipt. Historical confirmation without return metadata still cannot invent a guard receipt.
