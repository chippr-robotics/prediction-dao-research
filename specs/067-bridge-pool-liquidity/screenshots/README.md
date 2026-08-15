# Earn ▸ Supply — screen validation

Actor-critic screenshot loop over the Supply pool list after it gained a search box, the
All / Trading / Bridge chip row, and the folded "Where pools are available" disclosure.

Actor: `scripts/ui/capture-supply.mjs` — run it with

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright     # once
NODE_PATH=/tmp/pw/node_modules node scripts/ui/capture-supply.mjs
```

It writes a throwaway harness page (entry, hook stubs, a vite config aliasing them), serves it,
captures, and deletes all four on exit — nothing dev-only is left in the app tree.

## Why the data is injected

`useLiquidityCatalog` reads a `LiquidityRouter`, and the router is deployed on **no network yet**
(issue #966), so against a normal dev server this surface can only photograph its empty state.
The shots therefore feed `SupplyView`'s own `catalog` prop — the seam its vitest suite already
uses. What is real in every shot: the component, `Supply.css`, and the theme tokens. What is
posed: the four pools and two positions. States that need a live router (a paused router, an
unreachable protocol, an unreadable fee rate) are **not photographed** rather than faked; they are
covered by `src/test/earn/SupplyView.test.jsx`.

## Shots

| File | What it shows |
|---|---|
| `list-desktop-light.png` / `list-desktop-dark.png` | The default list — search, chips, four pools including one closed to new deposits. |
| `list-mobile-light.png` / `list-mobile-dark.png` | The same at 390×844: full-width search, chips wrapped to their own row. |
| `searching-desktop-dark.png` | Query + kind chip together, with the "Showing 2 of 4 pools." count. |
| `searching-mobile-light.png` | The same narrowing on a phone. |
| `no-match-mobile-dark.png` | A search that reached nothing: its own copy plus **Clear search**. |
| `availability-open-mobile-light.png` | The availability disclosure expanded. |
| `positions-mobile-dark.png` | Open positions above the catalog — the search never filters them. |
| `empty-mobile-light.png` | Empty catalog: no search, no chips, and no second copy of the availability sentence. |

Matrix: every scenario × {desktop 1280×900, mobile 390×844} × {light, dark} is captured; the ten
above are the ones kept in the repo.

## Rounds

**Round 1 — 2 findings.**

1. *The disclosure marker was clipped on mobile.* `<summary>` defaults to `list-style-position:
   outside`, which draws the triangle in the margin — and this panel has no left gutter at phone
   widths, so it rendered half off the screen edge. Fixed by moving the marker inside the content
   box (`Supply.css`).
2. *Harness bug, not a product bug:* the first pass loaded `index.css` but not `theme.css`, so
   `--brand-primary` was undefined and both dark-mode shots rendered light. The capture script now
   imports `theme.css`, which is what makes the selected chip visibly green in
   `searching-desktop-dark.png`. Worth recording because the shots looked plausible while being
   wrong about the only thing dark mode was there to check.

**Round 2 — clean.** Full matrix re-captured, no findings: controls read as controls in both
themes, the selected chip is distinguishable from the unselected two by more than weight, no
clipping or horizontal scroll at 390px, and every empty/narrowed state is a stated sentence with a
live control rather than a blank area.
