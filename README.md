# Mierkhat frontend

[![Verify](https://github.com/Mierkhat/frontend/actions/workflows/verify.yml/badge.svg)](https://github.com/Mierkhat/frontend/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Mierkhat lets you withdraw DeFindex vault shares and receive one settlement token. You review the shares to spend, the minimum to receive and the fee before signing in Freighter. A Soroban guard redeems the shares and converts the withdrawn assets in one transaction. If a signed condition fails, contract changes roll back; network fees may still be charged.

This repository contains the React application, shared interface copy and optional React review embed. It uses the actual pinned Stellar testnet deployment. Balances, quotes, submissions and receipts come from real services and ledger data. Mainnet is disabled. Testnet tokens have no monetary value.

## Stack

| Component          | Technology                                               |
| ------------------ | -------------------------------------------------------- |
| Application        | TypeScript 7.0.2, React 19.3.1, Vite 8.3.5               |
| Wallet             | Freighter API 6.0.1                                      |
| Transaction policy | `@mierkhat/sdk` 0.1.0, built from the backend repository |
| Interface          | CSS, Lucide, local Archivo and Bitter fonts              |
| Verification       | Vitest 5.0.5, Playwright 1.64.1                          |
| Toolchain          | Node.js 24.22.1, pnpm 12.15.0                            |

## Quick start

Install the pinned Node.js version, then:

```sh
git clone https://github.com/Mierkhat/frontend.git
cd frontend
npm install --global pnpm@12.15.0
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

Open http://localhost:5173. Run the [backend](https://github.com/Mierkhat/backend#quick-start) on `127.0.0.1:3001` in another terminal. Vite forwards `/v1` requests to it. Install and unlock Freighter, select Stellar testnet, then use **Connect wallet** to select it.

The workspace guides you through account funding, token trustlines, testnet token issuance, a vault deposit and a guarded withdrawal. Withdrawals show one position per supported vault and let you choose a pinned output token. Both actual testnet vaults support MKA, MKB and MKOUT outputs. The faucet needs the backend's dedicated issuer configuration; it never substitutes fabricated balances when that configuration is missing.

Withdrawals use four progressive screens: vault and token, amount, review, and wallet confirmation. Next and Previous move between them while preserving the selected route, entered shares and chosen minimum. Enter shares or a receiving target, preview the result, review it, then approve in Freighter from the final screen. Exact percentage presets and the remaining position help size share withdrawals. The review shows the source vault, minimum output and actual prepared network fee. Expired reviews can be refreshed without lowering the chosen minimum; each refreshed review requires confirmation again. Wallet setup and optional availability tools sit below the primary flow. A verified successful withdrawal opens **Withdrawal confirmed** with the actual amount received and transaction hash. Enabled testnet routes reject prepared fees above 5 XLM; the actual fee can be lower and is shown before approval.

Use **Withdrawal check** for an unsigned position check, choose a receiving target in the workspace, use **Move vaults** for a partial cross-asset migration, and save conditions in **Alerts**. Both migration directions use separate immutable contracts. See the [withdrawal tools guide](docs/WITHDRAWALS.md) for coverage, refunds, watch privacy and recovery.

The exact SDK tarball is committed under `.vendor/` so a fresh clone builds before the SDK has a registry release. `.vendor/manifest.json` records its provenance and checksum. Application and embed use the same archive. The `prebuild` script compiles the copy package and embed first.

## Commands

```sh
pnpm dev                 # Development server on port 5173
pnpm build               # Copy package, embed and production app
pnpm typecheck
pnpm --filter @mierkhat/copy typecheck
pnpm --filter @mierkhat/react typecheck
pnpm test
pnpm exec vite preview --host 127.0.0.1 --port 5173 --strictPort
```

Run browser checks with a healthy backend and public testnet access:

```sh
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

Playwright builds the app and serves it on port 4173. Its 14 scenarios cover both themes, mobile widths, live ledger reads, navigation, wallet selection, keyboard controls, recovery and receipts. It does not intercept the network. CI runs build, types and unit tests; live browser acceptance is a separate integration check.

## Repository layout

```text
src/          Pages, wallet adapter, API integration and transaction UI
copy/         Shared, typed English copy catalog
embed/        Optional @mierkhat/react review component
public/       Branding, licensed fonts and static assets
tests/        Browser checks and public transaction references
scripts/      Asset generation and genuine Freighter acceptance helpers
docs/         Architecture, deployment and integration instructions
.vendor/      Exact SDK archive and provenance
```

## Documentation

- [Withdrawal checks, targets, vault moves and alerts](docs/WITHDRAWALS.md)
- [Architecture and transaction flow](docs/ARCHITECTURE.md)
- [Development, deployment and wallet acceptance](docs/OPERATIONS.md)
- [Appearance and palette](docs/APPEARANCE.md)
- [Copy conventions](docs/COPY.md)
- [Backend and SDK](https://github.com/Mierkhat/backend)
- [Contracts and public evidence](https://github.com/Mierkhat/contracts)

The deployment's `reviewed` flag records source/integration verification, not an independent audit. Independent security review and extended restoration/race checks remain [release gates](https://github.com/Mierkhat/contracts/blob/main/docs/RELEASE_STATUS.md).

## Combined workspace

In the original combined workspace, use `./scripts/pnpm --filter @mierkhat/frontend <command>` from its root. Build the workspace before serving the frontend. The export adds the standalone lockfile and SDK archive; neither requires an npm publication.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Report sensitive issues through the [security policy](SECURITY.md).

## License

Mierkhat-authored code uses the [MIT license](LICENSE). Dependencies, upstream protocols, fonts where bundled and brand usage retain the terms described in [third-party notices](THIRD_PARTY_NOTICES.md).
