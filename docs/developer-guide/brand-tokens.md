# Brand tokens — colour and typography

FairWins renders in the **Chippr Robotics Brand Guidelines v1.0** system (spec 089). This page is
what you need to add a surface without inventing a colour.

The guidelines govern **colour and typography across the estate**; product marks stay with their
products. The FairWins clover mark is FairWins' own and is never composited with the Chippr robot
brandmark.

## The one rule

**Colour comes from a token. Never write a hex into a component.**

`frontend/src/theme.css` is the only file that states a colour value. Everything else asks for a
role. This is enforced, not merely encouraged — see [Guards](#guards).

```css
/* no */
.my-thing { color: #2E7D8C; }

/* yes */
.my-thing { color: var(--brand-primary); }
```

## The palette

| Name | Hex | What it is for |
|---|---|---|
| Chippr Teal | `#2E7D8C` | The default everywhere — fills, large text, emphasis |
| Gunmetal | `#1C333B` | Text, and dark-mode surfaces |
| Cloud | `#F4F6F7` | The light page background |
| Teal 700 | `#1F5966` | Links and small teal text |
| Teal 300 | `#6FAEBB` | The light lift; the dark theme's brand colour |
| Teal 100 | `#D9E9EC` | Faint tints, icon containers |
| Steel | `#5E6B70` | Secondary text, captions |
| Amber | `#F2A33C` | **Signal only** |

**Retired.** `#2FA043` (the 2017 Chippr green) and the outgoing FairWins hues `#36B37E`, `#4C9AFF`,
`#7BDCB5` and their variants. These fail CI if reintroduced.

## Two things that are easy to get wrong

### 1. Chippr Teal is a large-text and fill colour

The guidelines' own measured table puts Chippr Teal on white at **4.7:1** — AA, but annotated
"18px+ / bold 14px+". At body size it does not clear AA.

- Small text, links, anything under 18px → **`--accent-color`** (Teal 700, 7.8:1).
- Fills behind white text, and headings → `--brand-primary` is correct.

The contrast audit enforces this: `--accent-color` carries a 4.5 obligation, `--brand-primary` a
3.0 one. Do not "fix" a failing `--brand-primary` row by darkening the token — that takes the brand
off palette. Use `--accent-color` at the call site.

### 2. Amber is a signal colour, and never small text on a light field

Amber measures **2.1:1 on white**. It is for alerts, live states, and at most one CTA per view; it
never fills a large area.

- Amber as a **fill or border** → `--warning-color`.
- Amber-toned **text** → `--warning-text` (a dark amber on light, Amber itself on dark).

## Status colours

The Chippr palette defines no success or error colour. A wallet needs four distinguishable states,
so this is a documented extension (spec 089 research R5), not a deviation.

| Role | Text token | Surface token | Fill token |
|---|---|---|---|
| success | `--success-text` | `--success-bg` | `--success-color` |
| warning | `--warning-text` | `--warning-bg` | `--warning-color` |
| danger | `--danger-text` | `--danger-bg` | `--danger-color` |
| info | `--info-text` | `--info-bg` | `--info-color` |

**Status surfaces are opaque on purpose.** An alpha tint's contrast depends on whatever is behind
it, which is unknowable where the token is defined — the dark amber chip measured 5.89:1 over the
page background and 4.10:1 over a raised panel. A test asserts these stay opaque.

**Colour is never the only channel.** Every status needs a label, icon, or text cue as well.

## Typography

| Role | Family | Token |
|---|---|---|
| H1–H3 | Space Grotesk | `--font-display`, `--text-h1`…`--text-h3` |
| H4, body, controls | Inter | `--font-sans`, `--text-h4`, `--text-body` |
| Code, addresses, hashes | JetBrains Mono | `--font-mono`, `--text-code` |

Each role ships `--text-*`, `--leading-*`, `--weight-*`, and `--tracking-*` where non-normal. Ask
for a role, not a number. `h1`–`h4` already take theirs in `index.css`; `.text-small`,
`.text-caption` and `.text-code` cover the non-heading roles.

Fonts are **self-hosted** (`src/styles/fonts.css`, `@fontsource-variable/*`) so the PWA works
offline and no external origin is contacted. Do not add a Google Fonts link — it would reintroduce
a third-party dependency the CSP no longer needs.

**Never restate a font stack in a component.** A local `font-family` overrides the root and the
brand face silently does not apply — that is why 62 of them had to be swept.

## Guards

Three Vitest suites in `frontend/src/test/brand/`, all gating CI:

| Guard | What it prevents |
|---|---|
| `noLegacyBrandColors.test.js` | A retired brand hue reappearing in shipped styling |
| `tokenContrast.test.js` | A token pairing dropping below WCAG 2.1 AA, in **both** themes |
| `noUndefinedTokens.test.js` | `var(--nonexistent, #hardcoded)` — see below |

### The undefined-token trap

`var(--color-primary, #6d28d9)` looks like a themed reference and behaves like a hardcoded violet,
because the token does not exist and the fallback always renders. The app had **177** such
references across **90** names before spec 089, and they were why green survived the palette sweep.

If you need a name that does not exist, **define it in `theme.css`** mapping onto a real token —
do not lean on the fallback. There is a compatibility alias block near the bottom of `theme.css`
for the historical `--color-*` vocabulary; new code should use the real token names.

## Tenants

`tenants/<id>/manifest.json` `brand.theme` overrides these tokens per tenant (spec 072). The
default `fairwins` tenant must declare the same values `theme.css` does — the manifest wins at
runtime, so a stale manifest silently reverts a palette change. `tenantConfig.test.js` checks it.

## Changing the palette

1. Edit `frontend/src/theme.css`.
2. Edit `tenants/fairwins/manifest.json` to match.
3. `npx vitest run src/test/brand/ --root frontend` — the contrast audit will tell you what broke.
4. Re-run the screenshot loop (`scripts/ui/capture-brand.mjs`). The audits check arithmetic; only
   the pixels show you a control that has disappeared into its own card.

See `specs/089-chippr-brand-alignment/` for the full contract, and
`specs/089-chippr-brand-alignment/screenshots/README.md` for what the visual loop actually caught.
