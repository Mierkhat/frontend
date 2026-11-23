---
name: Mierkhat
description: Guarded Stellar testnet withdrawals and vault moves
colors:
  ink: "#000000"
  accent: "#eb4134"
  paper: "#dedede"
typography:
  body:
    fontFamily: "Archivo, Arial, sans-serif"
  display:
    fontFamily: "Bitter, Georgia, serif"
---

## Overview

Refine the incumbent identity: local Archivo and Bitter, the supplied meerkat
mark, black/red/grey surfaces and flowing landing-page edges. The landing page
helps a visitor understand the withdrawal; the workspace helps an owner review
and execute it. Help and technical details prioritize reading.

## Colors

`src/style.css` defines semantic tokens; `src/liquid.css`, loaded afterward,
derives surface and border tones using `color-mix`. Light uses grey with black
text; Dark uses black with grey text. Fixed red panels use black text and focus.
Fixed inverted panels use grey text. Use the existing `--text`, `--surface`,
`--line`, `--accent`, `--error` and `--focus` roles instead of component hex values.
Small red text on grey does not meet AA contrast. Errors use a message and
invalid state as well as their colour.

## Typography

Self-host Archivo for controls and body text, Bitter for prominent headings.
Keep human amounts in their asset decimals; use code for hashes and contract
addresses. Balanced headings and pretty paragraph wrapping are progressive
CSS enhancements. Preserve readable line height and bounded text measure.

## Layout

The shared gutter is `clamp(20px, 4vw, 64px)`. Connected workspace balances and
transaction controls form a responsive grid; disconnected onboarding uses one
column with a 760px maximum. Groups use consistent local spacing, with more
space between tasks. Verify 320, 768 and 1440px in both themes, including errors,
empty states and long addresses. Lists and filters wrap without horizontal scroll.

## Elevation & Depth

Borders and surface tones establish structure. Notices use the same 1px outline
as related controls. Avoid decorative shadows or thick side accents. Reserve
fixed red and black surfaces for the existing identity and hierarchy.

## Shapes

Preserve the incumbent asymmetric control/panel corners and flowing landing
edges. Use Lucide icons with the shared stroke settings; decorative icons are
hidden from assistive technology. Retain the supplied mark and font licences.

## Components

- `AmountField` owns visible labels, exact decimal validation, optional balance
  and maximum bounds, blur feedback and associated inline errors.
- `ErrorNotice` announces actionable errors; explicit action failures may focus
  it. Background refreshes never move focus.
- `TestnetScope` names token value and strategy limitations beside the first action.
- `Busy` announces loading. Async actions disable repeat clicks and retain inputs.
- Wallet dialogs protect focus, close with Escape and return focus to the trigger.
- Review/confirmation retains owner, amounts, minimum, fee and expiry. Refresh
  clears confirmation. An unresolved signed attempt permits exact retry and lookup.
- Browser alerts are observations; saving them grants no execution authority.

## Do's and Don'ts

Use typed catalog copy and clear action names. Keep visible focus, 44px touch
controls and reduced-motion behavior. Put protocol details behind disclosures
where that helps the task. Preserve real service failures and uncertain results.
Do not introduce sample balances, imply yield in strategy-free vaults, claim
mainnet readiness, silently lower a minimum or request replacement signatures
while an existing signed attempt is unresolved. Keep historical acceptance
separate from current local and component verification.
