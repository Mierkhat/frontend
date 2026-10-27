# Architecture

The home page explains shares, conversion and the signed minimum. `/app` is the transaction workspace. Activity, help, contract details, shared reviews, pending operations and receipts reuse the typed copy and SDK policies. Light, Dark and System appearances provide visible focus and reduced-motion support.

`src/api.ts` talks to the same-origin `/v1` API and the pinned testnet RPC. `src/deployments.json` contains trusted deployment pins; discovery cannot enable a different profile. `copy/src/en.json` owns interface copy and is consumed by the embed and browser checks.

## Wallet and transaction flow

Connect opens an accessible selector before calling Freighter, the implemented provider. Detection, installation guidance, approval progress and errors stay in the dialog. Cancellation invalidates late responses and restores focus.

The user enters shares, obtains a quote, chooses a minimum and reviews the exact transaction. The SDK verifies deployment pins, source, arguments, nested transfers, bounds, fees and wallet identity before signing. Setup has separate policies for trustlines, deposits and restoration. A restoration cannot be silently appended to an exit. `ExitController` invalidates stale work when account, network, epoch or review changes.

The guard redeems and swaps withdrawn assets in one invocation. The quote is an estimate; the signed minimum is an on-chain condition. A failed condition reverses contract changes but may consume network fees.

## Recovery and shared packages

Exact signed bytes stay in browser memory for retry and are encrypted in the backend after admission. Browser storage contains only validated public recovery pointers, never envelopes, private keys or seeds. Reload uses public hashes. An uncertain result is not called a failure. Historical transaction success alone does not establish a decoded guard receipt without committed metadata.

`copy/` owns typed interpolation; `embed/` provides the React review component. The standalone `.vendor/` SDK archive is shared by both app and embed. Update its provenance, both dependency references and lockfile together.

## Motion and keyboard behavior

Sections reveal once as they enter view, including newly mounted review panels. The Web Animations API affects surfaces rather than counting or replacing financial values. Content stays visible when animation/observer support is unavailable. Focusing a moving region cancels its reveal immediately; changing the OS reduced-motion preference cancels active motion. Reduced-motion CSS removes spinner, dialog, menu and feedback animation entirely. Menus/dialogs use short entrance transitions; receipt checks animate only when confirmed. Mobile navigation closes with Escape and restores toggle focus. Transaction tabs expose linked tab/panel roles, roving focus and Arrow/Home/End keyboard selection.
