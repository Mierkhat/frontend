# Mierkhat frontend

React/Vite application, shared copy package and optional review embed. The editorial home, dedicated `/app` workspace, activity, hash recovery, receipts, shared reviews, contracts and help all use live Stellar testnet services. There is no example mode, fabricated balance, mock wallet or intercepted RPC in the acceptance journey.

From the combined root:

```sh
./scripts/pnpm install --frozen-lockfile
./scripts/pnpm build
./scripts/pnpm --filter @mierkhat/backend local
# In another terminal, serve the tested production frontend:
./scripts/pnpm --filter @mierkhat/frontend exec vite preview --host 127.0.0.1 --port 5173 --strictPort
```

Open `http://localhost:5173`. Install/unlock Freighter and select Stellar testnet. Connect, fund the account using Friendbot, approve the exact token trustlines, receive issued testnet tokens, deposit both vault assets, then redeem shares through the guarded exit. All displayed amounts come from the ledger, a current RPC quote or user input. Fixed faucet allocations are actual issued balances. Testnet assets have no monetary value.

For development use `./scripts/pnpm dev`; Vite proxies `/v1` to `127.0.0.1:3001`. Production uses a strict CSP. Only the development transform permits Vite's inline refresh/style injection.

Bundled `src/deployments.json` enables the verified pinned testnet profile explicitly authorized by the user. HTTP discovery cannot enable another profile. Source/profile integration verification does not mean an independent audit is complete. Mainnet remains disabled.

`copy/src/en.json` owns authored interface copy. Supplied SVG branding and local licensed Archivo/Bitter fonts remain intact. Light, Dark and System themes, mobile navigation, reduced motion and visible keyboard focus are supported. Public recovery pointers contain hashes, public account identity and action metadata; signed envelopes and wallet secrets never enter browser storage.

Verification:

```sh
./scripts/pnpm typecheck
./scripts/pnpm build
./scripts/pnpm check:copy
./scripts/test-browser.sh
```

The live browser suite requires the API and public testnet. It checks 320/768/1440 widths in both themes, actual ledger values, keyboard/metadata, hash validation, confirmed receipt lookup, JSON download, filtering and reload. Screenshots go to ignored `test-results/`. It does not intercept network calls.

Prepare the pinned isolated extension with `python3 frontend/scripts/setup-freighter.py` from the root. Then run `scripts/freighter-onboard.mjs` from the frontend directory using Node24. The helper verifies the official release checksum and creates the isolated test unlock credentials without printing them.

The genuine extension journey is `frontend/scripts/freighter-journey.mjs`, run from the frontend directory with Node 24. It uses the official pinned Freighter release in ignored `.tooling/freighter/unpacked` and a dedicated isolated Chromium profile, never a user browser profile. The ignored credentials file contains only that test wallet's unlock password and must remain mode 0600. `freighter-onboard.mjs` creates that isolated test wallet. Browser libraries must be installed; the root browser wrapper also supports the workstation's ignored extracted libraries. Public approval/receipt evidence is in `contracts/evidence/freighter-journey.json` and screenshots remain local. No private wallet material belongs in source, logs or evidence.

The embed displays the exact signed bounds and delegates to the shared SDK controller. Provide a pinned deployment, real wallet adapter, fresh ledger/source sequence, on-chain deployment verification, durable submit, lookup and terminal callbacks. Hosts deduplicate receipt callbacks by hash.

For an independent repository use `scripts/export_facet.py frontend <empty-directory>` from the root. It packs the exact SDK and generates a facet lockfile; no unpublished registry package or remote push is required.
