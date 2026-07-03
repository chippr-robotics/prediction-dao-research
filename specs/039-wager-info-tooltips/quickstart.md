# Quickstart: Validating Wager View Info Tooltips

**Feature**: 039-wager-info-tooltips

## Prerequisites

```bash
npm install            # repo root; workspaces install frontend deps
```

## Automated validation

```bash
# Full frontend suite (unit + integration + axe) — must pass
npm run test:frontend

# Focused runs while iterating
npm --workspace frontend run test -- InfoTip
npm --workspace frontend run test -- DeadlineTimeline
npm --workspace frontend run test -- OpenChallenge GroupPoolModal FriendMarketsModal

# Lint gate (blocks build in CI)
npm --workspace frontend run lint
```

Expected: new `InfoTip.test.jsx` / `InfoTip.axe.test.jsx` pass (contract
B1–B8 in [contracts/infotip-component.md](./contracts/infotip-component.md));
updated view suites assert each moved explainer is hidden by default and
revealed via its icon; zero new axe violations (SC-004).

## Manual validation (mobile-first)

```bash
npm run frontend       # Vite dev server
```

In the browser devtools, set a phone viewport (e.g. 360×800; also check 320 px
width for the clamp behavior), then:

1. **Open challenge (SC-001 reference view)** — Dashboard → create an open
   challenge. Verify: no explainer paragraphs visible; ⓘ icons next to
   "What's the wager?", "Stake — each side", "How is it resolved?", the
   timeline tiles, and the arbitrator field (when shown). The form should be
   roughly a third shorter than before (compare against the spec's motivating
   screenshot).
2. **Bubble behavior** — tap an icon: speech bubble appears anchored to it,
   fully on-screen. Tap another icon: first bubble closes (only one open).
   Tap outside / press Escape / re-tap: closes. Near the screen edge the
   bubble shifts instead of clipping.
3. **Dynamic text still inline** — enter an invalid deadline (validation
   alert stays inline), start a create (progress line stays inline), and
   confirm the computed "Open … for a taker · then …" line and the four-word
   code warning on the success screen are still always visible.
4. **Other views (SC-002 sweep)** — repeat the icon spot-check in: create
   wager (Friend markets), create group pool, take-challenge panel, unified
   lookup, and the open-challenge decrypt modal, per the inventory in
   [data-model.md](./data-model.md).
5. **Keyboard/AT (FR-007)** — Tab to an icon (visible focus ring), Enter opens,
   Escape closes and returns focus. With a screen reader, opening announces the
   explainer text.
6. **Themes** — toggle light/dark; bubble contrast holds in both.

## Success criteria mapping

| Criterion | How verified |
|---|---|
| SC-001 form-height/word reduction | Manual step 1 (viewport comparison) |
| SC-002 100% explainers behind icons, none lost | Updated view tests + manual step 4 against the data-model inventory |
| SC-003 open/dismiss < 5 s any input | Manual steps 2 & 5 |
| SC-004 zero new a11y violations | `npm run test:frontend` axe suites |
| SC-005 no behavior regression | Existing create/accept flow tests unchanged and green; Cypress fast e2e in CI |
