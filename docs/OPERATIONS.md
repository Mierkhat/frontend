# Development and deployment

Use Node 24.22.1 and pnpm 12.15.0. Install the frozen lockfile, build, then run `pnpm dev`. Run the backend on `127.0.0.1:3001`; development and preview forward `/v1` there. No issuer or backend encryption key belongs in the frontend.

Use real Freighter on testnet. Funding, trustlines, issued test tokens and a deposit are prerequisites for redeeming shares. Missing services or unreadable balances produce an explicit unavailable state, not example amounts.

## Production hosting

Deploy `dist/` to a static host with SPA fallback to `index.html`. Proxy `/v1` to the backend on the same origin and keep API routes out of the fallback. Vite preview is a local verification server, not the production hosting layer.

Preserve the content security policy in `index.html`, including allowed Stellar connections. Only development permits Vite refresh/style injection. Apply TLS; cache HTML conservatively and hashed assets immutably. Do not expose secrets through `VITE_*` variables. Verify direct loads of workspace/help/activity/receipt routes, API health, a real ledger read and testnet wallet connection after hosting changes.

## Acceptance tooling

`pnpm test:e2e` needs a healthy API, public testnet and Playwright Chromium with OS libraries. It builds/serves on port 4173 and makes live requests. Unit/type checks do not require network access.

The retained genuine-Freighter helpers expect sibling directories named `frontend`, `backend` and `contracts`. From the frontend root:

```sh
pnpm exec playwright install --with-deps chromium
python3 scripts/setup-freighter.py
pnpm exec node scripts/freighter-onboard.mjs
pnpm exec node scripts/check-wallet-ux.mjs
```

The setup helper verifies the official Freighter 5.49.0 archive checksum. The isolated extension profile and generated unlock password stay in the parent directory's private `.tooling/freighter/`. It never opens a personal browser profile. The full `scripts/freighter-journey.mjs` additionally needs the dedicated fixture issuer, live API and sibling contract evidence. It submits actual testnet transactions. Its API-outage mode may stop only an explicitly identified test API process.

## Copy, assets and SDK

Edit `copy/src/en.json` and preserve interpolation names. `pnpm build` compiles the copy package and embed. Run `pnpm exec node scripts/assets.mjs` for metadata/brand changes, then inspect generated PNGs. Font license texts stay next to font files.

For an SDK update, build/pack from the backend, replace `.vendor/`'s archive and provenance, update app/embed `file:` references, regenerate the lockfile and repeat relevant acceptance checks. A fresh clone already includes the SDK archive; no npm publication is required.

`pnpm exec node scripts/check-wallet-identity.mjs` additionally verifies the actual connected tab keyboard/ARIA flow, opens a real restoration signing prompt, selects a different account through Freighter, and confirms that a late original approval produces no submission. It uses only the dedicated extension profile; public evidence goes into sibling `contracts/evidence/freighter-identity-change.json`. The helper restores the original selected test account and closes its browser in `finally`.

`pnpm exec node scripts/check-withdrawal-review.mjs --verify` exercises the original expired-quote withdrawal bug with that isolated Freighter profile and a running localhost app/API. It obtains a real quote, enters a custom minimum, waits beyond twenty seconds and checks that Review refreshes the estimate without changing the chosen minimum. It also checks visible keyboard focus for the review and an above-quote minimum error, and asserts zero withdrawal submissions. If the isolated wallet has no shares, it first makes and signs a real testnet deposit using a fraction of its actual token balances. Public output goes to the parent's ignored `.tooling/palette/` directory; the current review capture is under `artifacts/`.

`pnpm exec node scripts/check-position-routes.mjs` uses the same genuine isolated Freighter profile to open the second vault position and withdraw through all six pinned vault/output combinations. It submits real testnet transactions. Public evidence is written to sibling `contracts/evidence/freighter-position-routes.json`, including the planned transaction hash before requesting a signature. Reruns reconcile recorded hashes and reuse confirmed deposits; an uncertain signed attempt is never silently replaced. No personal browser profile or injected wallet is used.
