# Current live interface captures

The home, workspace and prepared deposit images show the current explanatory copy and black/red/grey palette.

- `home-*` and `workspace-*`: actual application and public Stellar testnet reads at 320, 768 and 1440 pixels in both themes.
- `review-*`: a real Freighter-connected account and an actual prepared vault deposit at all six width/theme combinations. The entered quantities are user input for that live preparation; these screenshot-only reviews were not submitted.
- `positions-*`: actual connected positions in both vaults, three pinned output choices and real balances at 320, 768 and 1440 pixels in both appearances. Selector contrast and overflow passed in all six combinations; actual Freighter transactions for all routes are recorded in `contracts/evidence/freighter-position-routes.json`.
- `withdrawal-review-red-grey.png` and `withdrawal-review-check.json`: real Freighter/testnet withdrawal preparation after a quote aged beyond twenty seconds. The custom minimum was preserved, the review and an above-quote minimum error received visible focus, and no withdrawal was submitted. The helper reused actual vault shares from the recorded prerequisite deposit.
- `exit-review-1440-light.png` and `receipt-1440-light.png`: historical captures of the genuine Freighter guarded exit and receipt, recorded in `contracts/evidence/freighter-journey.json`. Their wording and palette predate the current revisions.
- `wallet-picker-dark.png`, `appearance-menu-dark.png` and `wallet-connection-check.json`: actual Freighter detection/approval and the explicitly themed appearance menu.

No network responses or wallet adapter were replaced for these captures. Public account and contract identities are visible; no wallet secret or unlock credential is included.
