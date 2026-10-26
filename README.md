# Mierkhat frontend

Vite and React transaction workspace plus `copy/` and optional `embed/` packages. Supplied brand originals, color derivatives, Archivo/Bitter fonts and OFL licenses are included. Browser state retains public transaction pointers, never signed XDR.

From the combined root, run `./scripts/pnpm build`, then `./scripts/pnpm dev`. Vite serves port 5173 and proxies `/v1` to the backend on port 3001. The SDK and copy packages must be built first.

The bundled `src/deployments.json` contains a disabled testnet proof profile for read-only receipt verification, with no signing enabled. The example is visibly labeled and cannot sign. An API response cannot enable an unbundled profile. After review, bundle the exact verified deployment record here and in the service registry; mainnet remains disabled by the SDK. Freighter must be installed and on the supported testnet account model.

Verification from the combined root:

```sh
./scripts/pnpm typecheck
./scripts/pnpm build
./scripts/pnpm check:copy
./scripts/pnpm --filter @mierkhat/frontend exec playwright install chromium
./scripts/test-browser.sh
```

Playwright needs Chromium's system libraries. On this workstation, missing nspr/nss/alsa libraries were extracted into ignored `.tooling/browser-libs` without a system installation. A standard Linux CI image can use `playwright install --with-deps chromium`. Screenshots at 320, 768 and 1440 pixels are in `artifacts/`; both themes, example reviews, keyboard use, reduced motion, denied storage, shared review rejection and unknown status after reload are tested. Real extension UI signing and manual screen reader review remain release checks.

Generate icons and share image with `pnpm exec node scripts/assets.mjs` inside this facet. `copy/src/en.json` is the canonical implementation catalog. `assets/brand/manifest.json` retains original source attribution and checksums.

The embed renders bound amounts, recipient, contracts, per-asset minima, both validity limits and fee. Supply pinned deployment, wallet, preparation, fresh ledger plus source sequence, live deployment verification, submit, lookup and terminal callbacks. Hosts deduplicate receipt callbacks by hash. A compromised host shares the browser trust boundary.

For a standalone repository, use the root `scripts/export_facet.py frontend <empty-directory>`. It includes the exact packed SDK so no unpublished registry package is required, resolves the internal copy/embed workspace and creates a facet lockfile. After SDK publication, replace its file tarball dependency with the same exact SDK version. No remote or push is created by export.
