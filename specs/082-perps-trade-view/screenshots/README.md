# Perps view — visual review record (actor-critic loop)

Captured by `scripts/ui/capture-perps.mjs` against a stubbed gateway (fixture pairs/positions/
config — no live venue data), dev server at 1280×900 and 390×844, deviceScaleFactor 2.

| File | State |
|---|---|
| `perps-desktop-light.png` | Ready state, all venues healthy, light theme, desktop. Merged table + legend row, positions, fee + risk disclosures. |
| `perps-desktop-dark.png` | Same state, dark theme — badge/contrast check. |
| `perps-mobile-light.png` | Ready state at 390px — table scrolls inside its own container; page never scrolls horizontally. |
| `perps-mobile-dark.png` | Same at 390px, dark theme. |
| `perps-degraded-venue.png` | GMX degraded: named banner, GMX pairs absent (never stale-as-live), other venues render. |

Critic findings fixed during the loop (each re-verified by re-capture):

1. **Venue badges unreadable in dark theme** — `--bg-tertiary` pill is light in dark mode →
   switched to a bordered transparent badge that inherits theme text color.
2. **Table clipped its last columns at desktop width** — header InfoTips + wide headers pushed
   `Max leverage`/`Trade ↗` past the container edge with no cue. Fixed by moving term InfoTips
   into a legend row under the table (the Earn convention), naming the funding interval in the
   header (`Funding / 1h`) instead of per cell, tightening cell padding, and shortening chain
   labels ("Arbitrum One" → "Arbitrum"). Verified: table width == container width at 1280.
3. **Forex precision loss** — EUR/USD 1.0841 rendered "1.08"; `formatPairPrice` now keeps up to
   4 decimals for 1 ≤ price < 100.
