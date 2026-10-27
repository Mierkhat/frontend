# Third-party notices

The root MIT license applies to Mierkhat-authored code. Dependencies retain their own copyright and license terms. Exact dependency versions are recorded in package manifests and lockfiles; installing dependencies does not relicense them.

Mierkhat interacts with independently licensed protocols. The pinned DeFindex source uses GPL-3.0; the pinned Soroswap source uses Apache-2.0. The contracts builder fetches those repositories separately and retains their license files. Their source and built WASM artifacts are not redistributed in this repository. Consult their original terms when distributing upstream code or binaries.

Stellar SDKs and tooling, React, Fastify and other dependencies retain their package notices. Generated Mierkhat ABI bindings describe this project's own guard interface. Mierkhat names and logos identify the project; the code license does not grant trademark rights.

Archivo and Bitter are distributed under the SIL Open Font License 1.1. Their full license texts are in [archivo-OFL.txt](public/fonts/archivo-OFL.txt) and [bitter-OFL.txt](public/fonts/bitter-OFL.txt), next to the bundled font files. Preserve them when redistributing the frontend. The `.vendor/` SDK archive is Mierkhat-authored MIT code; its third-party runtime dependencies remain separately installed under their own licenses.
