# Research: Chippr Brand Alignment

**Feature**: 089-chippr-brand-alignment
**Date**: 2026-08-16

## R1 — Are the guidelines' published contrast numbers trustworthy?

**Decision**: Yes. Treat slide 11's measured table as authoritative for light-theme pairings, and
derive dark-theme pairings ourselves.

**Rationale**: Every published pairing was recomputed against WCAG 2.1 relative luminance and
matched to two decimals:

| Pairing | Published | Recomputed |
|---|---|---|
| Gunmetal on White | 13.2 : 1 | 13.24 |
| Gunmetal on Cloud | 12.2 : 1 | 12.21 |
| Steel on White | 5.5 : 1 | 5.51 |
| White on Chippr Teal | 4.7 : 1 | 4.74 |
| Teal 700 on White | 7.8 : 1 | 7.84 |
| Amber on Gunmetal | 6.4 : 1 | 6.36 |

The consequential one is **White on Chippr Teal = 4.74**. It clears AA for normal text but has only
0.24 of headroom, and the inverse (Chippr Teal *as text* on white) is the same 4.74 — which the
guidelines correctly annotate as "AA (18px+ / bold 14px+)" because that is the large-text threshold
they are relying on for headings. So Chippr Teal is safe as a **fill** behind white text and as
**large** text, and unsafe as small body text or a small link. Teal 700 (7.84) is the value for
those.

**Alternatives considered**: Trusting the table without verification — rejected; a brand deck is not
a tested artifact, and one wrong number would ship an accessibility regression under the banner of
following the brand.

## R2 — What replaces the outgoing three-hue brand system?

**Decision**: A three-step **teal ladder** — Teal 700 / Chippr Teal / Teal 300 — replaces the
Green / Blue / Mint triad, mapped onto the existing `--brand-secondary` / `--brand-primary` /
`--brand-accent` token names.

**Rationale**: The Chippr palette is deliberately monochromatic plus one signal color. The outgoing
system used three *hues* to mean three things (brand, active, highlight). Mapping three hues onto
one hue family requires the distinction to move from hue to **luminance**, which the palette already
provides as a designed ladder. Keeping the existing token names means ~74 CSS files and the tenant
manifest keep working without a rename sweep on top of a value sweep.

The assignment is not arbitrary:

- `--brand-primary` = **Chippr Teal** — the default everywhere, per slide 6 ("Full color … the default").
- `--brand-secondary` = **Teal 700** — the deep anchor. It inherits the roles where AA at small sizes
  matters (links, emphasized text), which is exactly the guidelines' stated use for Teal 700.
- `--brand-accent` = **Teal 300** — the light lift. It carries the roles that sit on dark surfaces,
  where Chippr Teal itself fails contrast (2.26–3.52 measured against the dark ladder).

**Alternatives considered**:
- *Retaining a second hue for "active" states* — rejected; it reintroduces exactly the off-brand blue
  the feature exists to remove.
- *Renaming tokens to Chippr names (`--chippr-teal-700`)* — rejected; it converts a value change into
  a value + rename change across 74 files and the tenant contract, for no functional gain, and it
  hardcodes the master brand's vocabulary into a product that the guidelines say keeps its own
  identity.

## R3 — Chippr Teal cannot be the dark-theme brand color

**Decision**: The dark theme brand color is a lightened teal, not Chippr Teal.

**Rationale**: Measured against the proposed dark surface ladder, Chippr Teal `#2E7D8C` scores
3.52 / 2.79 / 2.26 on the three dark surfaces — failing AA everywhere. Teal 300 `#6FAEBB` scores
6.72 / 5.33 / 4.31 — passing except marginally on the lightest raised panel. `#83B9C4`
(Teal 300 lifted 15% toward Cloud) scores 7.72 / 6.12 / 5.16 and passes with headroom.

This is not a deviation from the brand: slide 6 defines a **reversed** variant precisely because the
full-color mark does not survive dark fields. The same logic applies to UI color.

## R4 — The dark surface ladder must be built from Gunmetal

**Decision**: Derive the dark neutrals from Gunmetal rather than keeping the outgoing
Midnight-Slate/Charcoal ladder.

| Token | Value | Derivation |
|---|---|---|
| `--bg-primary` | `#122126` | Gunmetal → black, 35% |
| `--bg-secondary` | `#182B32` | Gunmetal → black, 15% |
| `--surface-color` | `#1C333B` | **Gunmetal** |
| `--bg-tertiary` | `#243F48` | Gunmetal → Teal 300, 10% |
| `--border-color` | `#2B4952` | Gunmetal → Teal 300, 18% |

**Rationale**: The guidelines name Gunmetal as what "anchors text and dark sections". A dark theme
whose surfaces are a different dark blue-grey than Gunmetal is not on the palette. Deriving the
ladder from Gunmetal by controlled mixes keeps every step provably on-palette, and puts Gunmetal
itself at the card/surface level where a member spends most of their attention.

Raised panels lift *toward Teal 300* rather than toward white, so raised surfaces carry a faint teal
cast consistent with the brand rather than reading as neutral grey.

## R5 — The palette defines no success or error color

**Decision**: Keep distinct success and danger colors as a documented extension; use Amber for
warning/live signal as the guidelines specify.

**Rationale**: The Chippr palette's only non-teal, non-neutral color is Amber, and slide 11 restricts
it to "alerts, live states, one CTA per view". A wallet has to express at minimum: succeeded,
failed, warning, and destructive — four states that a member acts on differently. Collapsing them
onto one signal hue would violate constitution principle III (honest state) at the color layer: a
failed transaction and a live price would look the same.

Chosen values, all measured:

| Role | Light | on White | Dark | on lightest dark surface |
|---|---|---|---|---|
| success | `#1E7A4F` | 5.31 | `#57C795` | 5.32 |
| danger | `#C0392B` | 5.44 | `#F58A7E` | 4.69 |
| warning (text) | `#7A4A00` | 7.48 | `#F2A33C` | 5.36 |
| warning (fill) | `#F2A33C` | — (fill only) | `#F2A33C` | — |
| info | `#1F5966` | 7.84 | `#83B9C4` | 5.16 |

Success sits at ~150° — far enough from teal's ~190° to be a different color at a glance, and
deliberately *not* the retired legacy green `#2FA043`, which it is darker and less saturated than.
Amber is never used as small text on light surfaces (2.08 on white); the warning *text* token is a
dark amber and Amber itself is reserved for fills, borders, and dark-surface text, matching the
guidelines' own "Amber on Gunmetal" pairing.

**Alternatives considered**: Using Amber for all non-success signals — rejected on honest-state
grounds above. Using teal for "info" and nothing else — adopted; info genuinely is brand-neutral and
does not need its own hue.

## R6 — Categorical chart colors

**Decision**: Series order `Chippr Teal → Amber → Teal 300 → Teal 700 → Steel`.

**Rationale**: The guidelines are silent on data visualization. Within the palette, only two hue
families exist (teal, amber) plus neutral Steel, so categorical separation has to come from
alternating hue and luminance. Measured relative luminance: 0.171, 0.454, 0.372, 0.084, 0.141. Every
adjacent pair differs either strongly in hue (teal↔amber, which is the blue–yellow axis and therefore
survives red-green color vision deficiency) or strongly in luminance (0.372→0.084). FR-009 requires
a non-color cue regardless, so this ordering is a legibility aid, not the only channel.

## R7 — Font delivery: self-hosted, not Google Fonts

**Decision**: Self-host Space Grotesk, Inter, and JetBrains Mono via `@fontsource` packages, served
from the app's own origin.

**Rationale**: The existing CSP already permits `fonts.googleapis.com` / `fonts.gstatic.com`, so
either route satisfies FR-014 on paper. Self-hosting wins on three grounds specific to this app:

1. **It is an installable PWA and a self-custody wallet.** Fonts fetched from a third party do not
   work offline and disclose app usage to that third party on every cold load.
2. **`font-src 'self'` is already granted**, so self-hosting needs no CSP change at all — and it
   makes the Google Font origins *removable* later, which is a tightening the current route blocks.
3. **No render-blocking third-party round trip** on first paint.

All three faces are OFL-licensed, which the guidelines note for each.

**Cost**: three new frontend dependencies and a lockfile re-resolve. Per spec 075 this is the
hazardous operation in this repo — the platform-binary drop. Mitigation is procedural and already
established: add with `npm pkg set`, re-resolve with `npm run deps:reinstall` (never a bare
`npm install`), then `npm run check:deps`.

**Alternatives considered**: Google Fonts `<link>` — rejected for the offline/privacy reasons above.
Variable fonts from a CDN — same objection. Bundling only the weights used — adopted implicitly;
`@fontsource` ships per-weight files and only the imported weights enter the bundle.

## R8 — How to eliminate 686 color literals without hand-editing 74 files

**Decision**: A deterministic, reviewable codemod driven by an explicit mapping table, plus a CI
guard that fails on reintroduction.

**Rationale**: The literals are not evenly distributed or ad hoc — they are overwhelmingly *exact
restatements of values that already exist as tokens*. `#36B37E` (447 occurrences) is verbatim
`--brand-primary`; `#1F2933` (116) is verbatim `--text-primary`; `#5A6772` (83) is verbatim
`--text-secondary`. A literal that exactly equals a token's current value has an unambiguous
replacement, so the mapping is mechanical rather than a judgement call per site.

The rule the codemod applies:

> **A color literal that exactly equals the current value of a theme token is replaced by
> `var(--that-token)`.** `rgba()` with a brand RGB triple becomes `rgba(var(--token-rgb), α)`.

This is what makes FR-004 and SC-006 true rather than aspirational: after the sweep, changing the
palette means editing the token definitions.

**Explicitly out of scope**: literals with *no* current token equivalent — the Tailwind-ish neutral
greys (`#6B7280` ×155, `#E5E7EB` ×128, `#111827` ×84 and friends). These are a pre-existing
neutral-consolidation debt, they are not brand hues, and they do not clash with teal. Sweeping them
would triple the diff and mix a brand change with an unrelated refactor. Recorded as follow-up.

**Alternatives considered**:
- *Hand-editing* — rejected at 686 sites; error rate and review burden both unacceptable.
- *Leaving literals and only changing tokens* — rejected outright; it produces the half-rebranded app
  User Story 1 exists to prevent, since 447 of the 686 sites would keep rendering the old green.
- *A CSS `@supports`/filter hack to hue-rotate the old palette* — rejected; it is a fabrication, it
  breaks the moment a surface is edited, and it cannot honor per-token contrast requirements.

## R9 — Where the guard lives

**Decision**: Two Vitest tests in the frontend suite, not a bespoke script.

- A **literal guard** that scans shipped styling for retired/legacy brand hues and fails listing each
  file and line (FR-005 / SC-001).
- A **contrast audit** that parses the shipped token definitions and asserts every declared
  foreground/background pairing against its required ratio, in both themes (FR-018 / SC-002).

**Rationale**: The repo already enforces cross-cutting invariants this way — `nginxCspConnectSrc.test.js`,
`packageBoundary.test.js`, `navSearchIndex.test.js`. Tests run in the existing CI job with no new
workflow wiring, and constitution principle IV forbids a check that can be skipped. The contrast
audit is the mechanism that keeps FR-016 true as tokens are tuned, rather than a one-time manual
measurement.

## R10 — Typography must be tokenized, not restated

**Decision**: Express the guidelines' hierarchy as `--font-*` and `--text-*` tokens in the theme
layer, apply them via element and utility selectors, and let existing component CSS inherit.

**Rationale**: The app currently sets `font-family` in 40+ places, most of them re-declaring a
system stack or a monospace stack. If the brand faces are only applied at `:root`, those 40 local
declarations override them and the change silently does not land — the same failure mode as the
color literals. The mono declarations in particular (`'SF Mono', Monaco, 'Courier New'`) are exactly
the addresses-and-hashes role FR-010 assigns to JetBrains Mono, so they must be re-pointed, not left.

`--font-mono` is already referenced by two components (`PerpsPendingOrders.css`,
`FairWinsUserModal.css` reference `var(--font-mono, …)` and `var(--font-family, …)`) but the variable
was **never defined** — those fallbacks have been silently carrying the app. Defining them is part of
this work.

## R11 — Container radii

**Decision**: Keep the existing `--radius-*` scale and re-point the card/button radii to the
guidelines' proportion; do not introduce a new scale.

**Rationale**: Slide 15 specifies rounded rectangles at "r = 18–22% of height" as the container
language, and slide 4 gives the mark's own 56/300 ≈ 18.7% corner ratio. A percentage-of-height radius
cannot be expressed as one fixed pixel token, so the honest translation is to raise the fixed steps
so that typical control and card heights land in that band: a 44px control at `--radius-md: 10px`
is 23%, at 8px is 18%. Buttons and cards move up one step; pills and full-round are unchanged.
Changing the scale wholesale would restyle every surface in the app for a change the guidelines do
not require.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Lockfile drops the platform binary when fonts are added | High (3 of 5 recent lockfile PRs) | `npm run deps:reinstall`, then `npm run check:deps` before anything else |
| Codemod corrupts a CSS file | Medium | Mapping table is exact-match only; full frontend suite + build after the sweep |
| A token swap breaks contrast on a surface the audit does not model | Medium | Actor-critic screenshot loop over both themes × both viewports is the backstop |
| Success green reads as the retired legacy green | Low | `#1E7A4F` is measurably darker and less saturated; literal guard bans `#2FA043` |
| Mini-app packages drift from host palette | Certain, by design | Documented; packages are immutable at their pinned CIDs |
