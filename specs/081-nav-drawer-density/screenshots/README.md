# Nav drawer screenshots (spec 081)

Captured with `scripts/ui/capture-nav-drawer.mjs` at 390×844 (a phone, where the crowding bites),
2× device pixel ratio, against the dev server.

| File | State |
|---|---|
| `01-default.png` | Defaults: Quick Access + Finance open, Tools folded, 2 pins. |
| `02-all-expanded.png` | Every section open. |
| `03-pins-capped.png` | 8 pins → 5 tiles + "Show all 8 (+3)". |
| `04-pins-expanded.png` | Overflow revealed in place; "Show fewer" returns. |
| `05-filter-active.png` | Filter "r" — matches across pinned apps and every section, folds overridden. |
| `06-filter-no-match.png` | No matches: stated explicitly, not a blank panel. |
| `07-compact.png` | Compact density, all sections open, 8 pins. |
| `08-before-unbounded-pins.png` | **Comparison only** — the pre-081 shape, 8 pins as full-width rows. Produced by a DOM edit in the harness; nothing in the app renders this. |

The first two pinned apps use the real `token-mint` / `clearpath` slugs so their curated store
artwork shows; the rest are uncurated on purpose, to photograph the generic illustration an
unknown app actually gets.
