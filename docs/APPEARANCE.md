# Appearance

The current palette is black `#000000`, red `#EB4134` and grey `#DEDEDE`. Light uses grey surfaces and black text; Dark uses black surfaces and grey text. Both use red accents. Red panels use black text, and interactive boundaries/focus remain visible. Red is not small text on grey because that pair does not meet AA text contrast.

`src/style.css` owns semantic roles and fixed accent/inverted surfaces. The palette also applies to the active wordmarks, marks, SVG/PNG favicon, touch icon, share preview, browser theme color and review surfaces. Original supplied artwork is preserved for provenance; derived SVGs change colors without changing geometry. Generate public assets with `pnpm exec node scripts/assets.mjs`.

The global network/ledger strip and circular minimum-return hero badge have been removed. Contextual network labels remain where a user reviews actual testnet activity. Live values still come from the service and ledger. Theme selection and reduced-motion behavior are retained.
