# Contract: Color tokens

The complete set of color tokens the app ships, their values in each theme, and the contrast
obligation `frontend/src/test/brand/tokenContrast.test.js` enforces.

**This file is the contract. `frontend/src/theme.css` is the implementation.** If they disagree, one
of them is a bug.

## Source palette (Chippr Brand Guidelines v1.0, slide 10)

| Name | Hex | Role per guidelines |
|---|---|---|
| Chippr Teal | `#2E7D8C` | The default everywhere |
| Gunmetal | `#1C333B` | Anchors text and dark sections |
| Cloud | `#F4F6F7` | Light surface |
| Teal 700 | `#1F5966` | Links, emphasized teal text |
| Teal 300 | `#6FAEBB` | Light lift |
| Teal 100 | `#D9E9EC` | Icon containers, faint tints |
| Steel | `#5E6B70` | Secondary text, captions |
| Amber | `#F2A33C` | **Signal only** — alerts, live states, one CTA per view |

Retired and banned from shipped styling: `#2FA043` (legacy Chippr green), `#36B37E`, `#2F9E6E`,
`#45C492`, `#5ED6A6` (outgoing FairWins greens), `#4C9AFF`, `#4A9EFF` (Odds Blue), `#7BDCB5`
(Momentum Mint).

## Neutrals

Light values are palette colors or documented mixes of them. Dark values are derived from Gunmetal
(research R4) — raised surfaces lift toward Teal 300 so panels carry a faint brand cast rather than
reading as neutral grey.

| Token | Light | Dark | Derivation (dark) |
|---|---|---|---|
| `--bg-primary` | `#F4F6F7` Cloud | `#122126` | Gunmetal → black 35% |
| `--bg-secondary` | `#FFFFFF` | `#182B32` | Gunmetal → black 15% |
| `--surface-color` | `#FFFFFF` | `#1C333B` | **Gunmetal** |
| `--bg-tertiary` | `#E5EFF1` | `#243F48` | light: Cloud → Teal 100 55%; dark: Gunmetal → Teal 300 10% |
| `--text-primary` | `#1C333B` Gunmetal | `#F4F6F7` Cloud | — |
| `--text-secondary` | `#5E6B70` Steel | `#ABCED6` | Teal 300 → Cloud 45% |
| `--text-muted` | `#667277` | `#8FB2BA` | light: Steel → Cloud 5%; dark: tuned to clear AA on `--bg-tertiary` |
| `--border-color` | `#D9DDDF` | `#2B4952` | light: Cloud → Steel 18%; dark: Gunmetal → Teal 300 18% |

## Brand

A three-step teal ladder (research R2). Names are unchanged from the outgoing system so the tenant
manifest contract and 74 consuming files stay valid.

| Token | Light | Dark | Notes |
|---|---|---|---|
| `--brand-primary` | `#2E7D8C` Chippr Teal | `#83B9C4` | Chippr Teal fails AA on every dark surface (2.26–3.52), so dark lifts Teal 300 by 15% toward Cloud |
| `--brand-primary-rgb` | `46, 125, 140` | `131, 185, 196` | for `rgba()` tints |
| `--brand-secondary` | `#1F5966` Teal 700 | `#6FAEBB` Teal 300 | the deep anchor; carries roles needing AA at small sizes |
| `--brand-secondary-rgb` | `31, 89, 102` | `111, 174, 187` | |
| `--brand-accent` | `#6FAEBB` Teal 300 | `#D9E9EC` Teal 100 | the light lift |
| `--brand-accent-rgb` | `111, 174, 187` | `217, 233, 236` | |

### Interactive

| Token | Light | Dark |
|---|---|---|
| `--primary-button` | `#2E7D8C` Chippr Teal | `#6FAEBB` Teal 300 |
| `--primary-button-hover` | `#1F5966` Teal 700 | `#87BBC6` |
| `--primary-button-text` | `#FFFFFF` | `#1C333B` Gunmetal |
| `--accent-color` | `#1F5966` Teal 700 | `#83B9C4` |
| `--highlight-color` | `#D9E9EC` Teal 100 | `#243F48` |

**FR-017 is enforced here**: `--accent-color` — the link and emphasized-text color on light surfaces
— is Teal 700 (7.84), *not* Chippr Teal (4.74, which the guidelines annotate as large-text-only).

## Status

An intentional extension: the Chippr palette defines no success or error color (research R5, plan
Complexity Tracking). Amber is used exactly as the guidelines specify — signal only, never as small
text on light surfaces, never a large fill.

| Token | Light | on white | Dark | on `--bg-tertiary` dark |
|---|---|---|---|---|
| `--success-color` | `#1E7A4F` | 5.31 | `#57C795` | 5.32 |
| `--danger-color` | `#C0392B` | 5.44 | `#F58A7E` | 4.69 |
| `--warning-color` | `#F2A33C` Amber | fill only | `#F2A33C` Amber | 5.36 |
| `--warning-text` | `#7A4A00` | 7.48 | `#F2A33C` Amber | 5.36 |
| `--warning-bg` | `#FDF2E4` | — | `rgba(242, 163, 60, 0.16)` | — |
| `--info-color` | `#1F5966` Teal 700 | 7.84 | `#83B9C4` | 5.16 |

Legacy aliases `--semantic-win` / `--semantic-active` / `--semantic-warning` / `--semantic-loss` map
onto success / info / warning / danger respectively.

## Timeline phases (spec 038)

The outgoing tokens used three unrelated hues (blue / green / purple). The teal ladder replaces them
with a deepening progression, which reads better as a timeline than three arbitrary colors did.

| Token | Light | Dark |
|---|---|---|
| `--timeline-accept` | `#6FAEBB` Teal 300 | `#6FAEBB` Teal 300 |
| `--timeline-active` | `#2E7D8C` Chippr Teal | `#83B9C4` |
| `--timeline-resolve` | `#1F5966` Teal 700 | `#4E93A2` |
| `--timeline-resolve-rgb` | `31, 89, 102` | `78, 147, 162` |

## Chart series

Ordered so adjacent series differ strongly in hue or luminance (research R6). FR-009 still requires a
non-color cue; this ordering is a legibility aid, not the only channel.

| Token | Value | Relative luminance |
|---|---|---|
| `--chart-series-a` | `#2E7D8C` Chippr Teal | 0.171 |
| `--chart-series-b` | `#F2A33C` Amber | 0.454 |
| `--chart-series-c` | `#6FAEBB` Teal 300 | 0.372 |
| `--chart-series-d` | `#1F5966` Teal 700 | 0.084 |
| `--chart-series-e` | `#5E6B70` Steel | 0.141 |

## Account-card tints (spec 086)

RGB triples the account cards mix their own alphas from. Re-pointed onto the palette; the two that
have no palette equivalent (violet, rose) are kept as distinguishable non-brand tints, since their
whole purpose is letting a member tell their own cards apart.

| Token | Value | Source |
|---|---|---|
| `--card-tint-teal` | `46, 125, 140` | Chippr Teal |
| `--card-tint-deep` | `31, 89, 102` | Teal 700 |
| `--card-tint-sky` | `111, 174, 187` | Teal 300 |
| `--card-tint-amber` | `242, 163, 60` | Amber |
| `--card-tint-slate` | `94, 107, 112` | Steel |
| `--card-tint-violet` | `139, 92, 246` | retained — user-chosen differentiation |
| `--card-tint-rose` | `244, 114, 182` | retained — user-chosen differentiation |

Existing stored tint ids (`mint`, `sky`, `violet`, `amber`, `rose`, `slate`) continue to resolve;
`mint` aliases to `--card-tint-teal` so no stored profile breaks.

## Radii (guidelines slide 15: r = 18–22% of height)

| Token | Before | After | 44px control |
|---|---|---|---|
| `--radius-sm` | 4px | 6px | — |
| `--radius-md` | 8px | 10px | 23% |
| `--radius-lg` | 12px | 16px | — |
| `--radius-full` | 9999px | 9999px | unchanged |

## Contrast obligations enforced by the audit

`tokenContrast.test.js` asserts each of these in **both** themes. A pairing that drops below its
threshold fails CI.

| Foreground | Background | Min | Why |
|---|---|---|---|
| `--text-primary` | `--bg-primary`, `--bg-secondary`, `--surface-color`, `--bg-tertiary` | 4.5 | body text |
| `--text-secondary` | same four | 4.5 | secondary text |
| `--text-muted` | same four | 4.5 | still text |
| `--accent-color` | `--bg-primary`, `--bg-secondary`, `--surface-color` | 4.5 | links at body size (FR-017) |
| `--primary-button-text` | `--primary-button` | 4.5 | button label |
| `--primary-button-text` | `--primary-button-hover` | 4.5 | button label, hovered |
| `--success-color` | `--bg-secondary`, `--surface-color` | 4.5 | status text |
| `--danger-color` | `--bg-secondary`, `--surface-color` | 4.5 | status text |
| `--warning-text` | `--warning-bg` | 4.5 | warning banner text |
| `--info-color` | `--bg-secondary`, `--surface-color` | 4.5 | status text |
| `--brand-primary` | `--bg-secondary` | 3.0 | large text / UI component boundary |
| `--border-color` | `--bg-secondary` | 1.3 | a visible divider, not a contrast requirement |

The `--brand-primary` row is 3.0 rather than 4.5 deliberately: Chippr Teal is a **large-text and
fill** color by the guidelines' own annotation. Anything needing 4.5 uses `--accent-color`.
