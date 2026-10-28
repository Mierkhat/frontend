# Withdrawal checks, receiving targets, migrations and alerts

All enabled routes use genuine Stellar testnet deployments. The current catalog covers two strategy-free DeFindex vaults, six withdrawal outputs and two migration directions. Other vaults, strategy positions and withdrawal queues are outside this catalog. Testnet assets have no monetary value. Mainnet remains disabled.

## Check a position

Open **Withdrawal check**, enter a Stellar account address and select a vault/output route. No signature is requested. The service receives the address and reads actual chain state. A successful result includes tested shares, selected-token proceeds, the maximum prepared network fee and the observed ledger. A failed read appears as unknown, not a zero balance.

Full means the entire current holding passed a complete guarded preflight. Partial means a smaller candidate passed; it is the largest tested candidate, not a mathematical maximum. The service does not reserve liquidity. Refresh and review again before signing.

The connected workspace also provides this check for the selected position. Use its tested quantity to populate the share editor, then request a fresh quote.

## Choose an amount to receive

In the workspace withdrawal editor, change the sizing selector to **Choose an amount to receive**. Enter the amount in the selected output token and choose **Find a withdrawal**. The planner tests a bounded share spend against the complete flow. The review preserves the requested token minimum. Changing the position, output, amount or movement allowance clears the old quote/review.

The current planner uses one selected position. It does not sum independent liquidity estimates across positions or promise the globally cheapest withdrawal. Rounding can produce slightly more than the minimum. It does not guarantee fiat value.

## Move between vaults

Open **Move vaults** and select a supported source/destination pair. Choose some or all source shares and check the move. Review estimated destination shares, the source remainder, deposit assets and refunds. Enter the minimum destination shares you accept, then request a fresh migration review and approve it in Freighter.

The guard withdraws and converts internally, deposits into the destination and returns destination shares plus residual tokens to the same owner. The intermediary token is not a separate wallet payout. A failed minimum reverts the whole action; network fees can still be charged. A successful receipt identifies the destination and records deposits, conversions and refunds in its download.

The original withdrawal contract remains deployed unchanged; migrations use separate immutable contracts. Account changes invalidate unsigned reviews. Late wallet approval after invalidation does not submit a transaction. Pending signed bytes use the existing durable recovery pipeline rather than constructing a replacement action.

## Watch conditions

From a withdrawal result, quote or migration quote, choose **Watch these conditions**. Watches are opt-in, expire after seven days and are scheduled for checking about once per minute, subject to provider availability and worker capacity. An in-app notification is created when a complete preflight meets the receiving threshold. Unknown observations do not create notifications or automatically rearm an already met condition.

Open **Alerts** to read observations, mark notifications read, explicitly rearm or remove a watch. Notifications survive reload and backend restart. Browser notifications are optional and only delivered by the open Alerts page after permission; no email or third-party messaging is sent. Opening an alert restores its conditions as form data; it still requires a fresh quote, review and signature.

Access uses a random browser capability, stored locally and sent only in a request header. The backend stores its digest, not the capability. Losing browser storage loses access; there is no public watch lookup by account address. Removing a watch deletes its server observations and notifications. Expired/unavailable watches can also be removed from this browser.

## Verification

`scripts/check-exit-tools.mjs` uses the isolated official Freighter profile and real API/RPC services. It verifies a target-token withdrawal, both migration directions, actual balance/receipt deltas, alert delivery, reload persistence and the single inset focus outline at mobile/tablet/desktop widths in both themes. Signed-operation checkpoints prevent reruns from duplicating a transaction. Public proof is maintained in the contracts repository under `evidence/freighter-exit-tools.json`; private extension credentials never belong in Git.
