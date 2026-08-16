# Contract: Type tokens

The brand typography system as tokens. Source: Chippr Brand Guidelines v1.0, slides 12–14.

**This file is the contract. `frontend/src/theme.css` (tokens) and `frontend/src/styles/fonts.css`
(delivery) are the implementation.**

## Families

| Token | Stack | Role |
|---|---|---|
| `--font-display` | `'Space Grotesk Variable', 'Space Grotesk', system-ui, -apple-system, 'Segoe UI', sans-serif` | Headlines, hero copy |
| `--font-sans` | `'Inter Variable', 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | Body, interface, controls |
| `--font-mono` | `'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | Code, addresses, hashes, ids |

`--font-family` is defined as an alias of `--font-sans`. Two components already reference
`var(--font-family, …)` and `var(--font-mono, …)` against variables that were **never defined**
(research R10) — those fallbacks have silently carried the app. Defining both fixes latent bugs.

All three are delivered self-hosted from the app origin via `@fontsource-variable/*` (research R7).
No external font origin is contacted; `font-src 'self'` already covers this, so **the CSP is
unchanged** (FR-014).

## Loading behaviour (FR-013)

- `font-display: swap` — text paints immediately in the fallback and re-renders when the brand face
  arrives. Text is never invisible.
- Variable fonts, so one file per family covers the full weight range rather than one request per
  weight.
- If a font file fails entirely, the stacks above degrade to the platform UI face and a real
  monospace. Layout does not break; metrics differ slightly.

## Web hierarchy (slide 13)

Scale is a 1.25 major third from a 16px base. Sizes are `rem`; line-heights are unitless.

| Token | Role | Family | Size | Line-height | Weight | Tracking |
|---|---|---|---|---|---|---|
| `--text-h1` | H1 | display | `3rem` (48px) | `1.1667` (56) | 700 | `-0.01em` |
| `--text-h2` | H2 | display | `2.25rem` (36px) | `1.2222` (44) | 700 | normal |
| `--text-h3` | H3 | display | `1.75rem` (28px) | `1.2857` (36) | 500 | normal |
| `--text-h4` | H4 | sans | `1.375rem` (22px) | `1.3636` (30) | 600 | normal |
| `--text-body` | Body | sans | `1rem` (16px) | `1.625` (26) | 400 | normal |
| `--text-small` | Small | sans | `0.875rem` (14px) | `1.5714` (22) | 400 | normal |
| `--text-caption` | Caption | sans | `0.8125rem` (13px) | `1.3846` (18) | 400 | normal |
| `--text-code` | Code | mono | `0.875rem` (14px) | `1.5714` (22) | 400 | normal |

Each row ships as four tokens: `--text-<role>`, `--leading-<role>`, `--weight-<role>`, and
`--tracking-<role>` where non-normal. A surface asks for a role, not a number (FR-012).

### Colors bound to type roles

- **Caption** renders in `--text-secondary` (Steel), per slide 13.
- **Code** renders in `--brand-secondary` (Teal 700) on `--bg-tertiary`, per slide 13's
  "Teal on Cloud". Teal 700 rather than Chippr Teal because code is 14px — below the large-text
  threshold (FR-017).

## Body measure

`--measure-body: 72ch`, per slide 13's "max 72ch". Applied to prose containers only, never to
tables, data grids, or control layouts.

## Application

Tokens alone do not land — the app sets `font-family` in ~40 places, most re-declaring a system or
monospace stack, and those local declarations would override a `:root`-only change (research R10).
Application therefore has three parts:

1. **Root defaults** in `index.css`: `body` takes `--font-sans`; `h1`–`h4` take their role tokens.
2. **Re-pointing the stray declarations**: every local `font-family` that restates a system stack
   becomes `var(--font-sans)`; every local monospace stack becomes `var(--font-mono)`. The
   addresses-and-hashes declarations (`'SF Mono', Monaco, 'Courier New'` and friends) are precisely
   the role FR-010 assigns to JetBrains Mono — they are re-pointed, not left alone.
3. **Utility classes** for the roles that are not heading elements (`.text-caption`, `.text-code`,
   `.text-small`), so a surface can take a role without inventing a size.

## Print and office fallbacks

Slide 14's office fallback stack (Space Grotesk → Arial Bold, Inter → Arial/Calibri, JetBrains Mono →
Courier New) applies to generated documents, not the SPA. It is honoured in
`frontend/src/data/reports/statement/theme.js`, which has no webfont access. The rule "never
substitute serifs, never Aptos" is respected there.

## What is deliberately not tokenized

Font sizes below caption (badges, dense table chrome, legal microcopy). The guidelines' smallest web
role is 13px; anything smaller is app-specific chrome outside the published hierarchy. Those stay as
they are rather than being forced into a role that does not exist.
