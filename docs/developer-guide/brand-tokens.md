# Brand tokens — colour and typography

FairWins renders in the **Chippr Robotics Brand Guidelines v1.0** system (spec 090). This page is
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

## Three things that are easy to get wrong

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

### 3. A brand fill never states its own label colour

```css
/* WRONG — 2.16:1 in dark mode, and it was written 66 times (issue #1260) */
.earn-btn.primary { background: var(--brand-primary); color: #fff; }

/* RIGHT */
.earn-btn.primary { background: var(--primary-button); color: var(--primary-button-text); }
```

`--primary-button` / `--primary-button-text` are a **matched pair**, and the reason they exist is
that the label has to invert where the fill does:

| | fill | label | ratio |
|---|---|---|---|
| light | `#2E7D8C` Chippr Teal | `#FFFFFF` | 4.7:1 |
| dark | `#6FAEBB` Teal 300 | `#1C333B` Gunmetal | 5.3:1 |

A hardcoded `#fff` cannot do that. On dark, `--brand-primary` lifts to `#83B9C4` and a white label
measures **2.16:1** — below AA and below even the 3:1 large-text floor. The fix is the pair, never
darkening `--brand-primary`: Chippr Teal is a fill colour by the guidelines' own table, and re-toning
it to pass one contrast row takes the whole brand off palette.

Decorative fills — a step number, a success glyph, a role badge — take the **same** pair. They are
not exempt just because nobody clicks them: a badge often sits inside a control that can be disabled
(the count chip in `.mm-tab` is inside a `<button>` with a `:disabled` state), and the rule below is
what keeps it legible there. The one fill that carries **no** label is `--gradient-brand-soft`: its
Teal 100 stop is 2.5:1 under white and 3.0:1 under Gunmetal, so nothing readable fits on it.

**Disabled controls change hue, not alpha.** `opacity: 0.55` over a pale teal is not a state a member
can read. `index.css` re-points the fill/label set on any disabled button:

```css
button:disabled, button[disabled], button[aria-disabled='true'] {
  --primary-button: var(--disabled-bg);
  --primary-button-hover: var(--disabled-bg);
  --primary-button-text: var(--disabled-text);
  --gradient-primary-button: linear-gradient(135deg, var(--disabled-bg) 0%, var(--disabled-bg) 100%);
}
```

It is done with custom properties rather than a `background` declaration on purpose: a property set
on the element beats the inherited one whatever specificity the component's own rule has, where a
`background` here would win on some surfaces and lose on others.

Two consequences, and both have already been got wrong:

**The fill and the label move together or not at all.** A control only follows the remap for the
tokens it actually reads, so a rule that fills from `--brand-primary` and labels from
`--primary-button-text` gets `--disabled-text` on a full-strength teal — **1.27:1 in light, 1.06:1 in
dark**, against 4.74:1 for the `#fff` it replaced. That is a regression in *both* themes, and it
lands on every primary `Button` while a transaction is in flight (`disabled={disabled || loading}`).
A fill that is a **status** colour keeps its colour when disabled, so it labels with
`--status-fill-text` — same values as `--primary-button-text` per theme, deliberately outside the
remap. `disabledControlState.test.js` enforces the pairing in both directions.

**`--gradient-primary-button` is re-pointed, not inherited-and-re-resolved.** A custom property's
computed value is its specified value *with `var()` already substituted*, resolved on the element the
declaration applies to. The gradient is declared at `:root`, so its stops resolve there against the
**enabled** tokens and descendants inherit that finished string — re-pointing `--primary-button` on
the button cannot reach back into it. Drop that fourth line and 18 gradient-filled controls keep
their teal under a grey label. The same reasoning applies to the compatibility aliases
(`--text-on-brand`, `--color-on-primary`): they resolve at `:root` too, so they never follow the
remap, and a rule using one must fill from something that also does not.

## Status colours

The Chippr palette defines no success or error colour. A wallet needs four distinguishable states,
so this is a documented extension (spec 090 research R5), not a deviation.

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

Six Vitest suites in `frontend/src/test/brand/`, all gating CI:

| Guard | What it prevents |
|---|---|
| `noHardcodedColors.test.js` | **Any** colour literal outside `theme.css` — the one that makes the rule above true rather than aspirational |
| `noLegacyBrandColors.test.js` | A retired brand hue reappearing, named specifically |
| `tokenContrast.test.js` | A token pairing dropping below WCAG 2.1 AA, in **both** themes |
| `noUndefinedTokens.test.js` | `var(--nonexistent, #hardcoded)` — see below |
| `noBrandFillOwnLabel.test.js` | A brand fill that states its own label colour — the **usage** gap the four above are blind to |
| `disabledControlState.test.js` | A disabled control that is only a faded copy of the enabled one |

The fifth exists because the first four all look adjacent to issue #1260 and none of them sees it.
`tokenContrast` audits the *palette*, not who uses it, so 66 rules that never named the pair were
invisible to it. `noHardcodedColors` exempts `#fff` as an absolute — precisely the literal being
used. `cy.a11yScan()` would have caught it in dark mode, but the fast tier runs one theme. The
missing check was never about the palette or the literal; it was about the **pairing**.

### What the literal gate allows, and why

Two exemptions, each stated in the test with a reason:

- **White and black.** Not palette colours. `#000` at 6% alpha is a shadow, and white on a fixed
  surface is not `--surface-color`. Forcing ~100 such call sites through tokens would make them less
  honest, not more. This exemption is also how issue #1260 hid for four specs: `#fff` **on a brand
  fill** is a real bug and this gate cannot see it, which is what `noBrandFillOwnLabel.test.js` is
  for.
- **Third-party identity.** `NetworkPill.css` (Polygon purple, Ethereum indigo) and Bitcoin's
  `#F7931A`. A network pill rendered in teal is not on-brand — it is **wrong**, because it tells the
  member something untrue about which chain they are on.

Adding a row to either allowlist is a design decision: it is a promise that the colour belongs to
someone else. If it is ours, it belongs in `theme.css`.

## Tier metals and gradients (spec 091)

Two more token families, both documented exceptions on the same footing as status colour:

| Token | Notes |
|---|---|
| `--tier-bronze` / `--tier-silver` / `--tier-gold` | Rank has no vocabulary in the palette, and the metals are a convention members read without a legend. **Gold resolves to Amber** — the brand's own warm colour — keeping the estate to one yellow. |
| `--gradient-brand` / `--gradient-brand-soft` / `--gradient-gold` | The app carried an indigo→violet gradient on avatars and the error boundary. One token, so the next change is one line rather than nine. |

A gradient whose stops are two different semantic tokens is almost always a mistake: a primary
button built from `--brand-primary → --success-color` says something untrue about what it does.
Use `--gradient-brand`, or `color-mix()` off a single token.

### The undefined-token trap

`var(--color-primary, #6d28d9)` looks like a themed reference and behaves like a hardcoded violet,
because the token does not exist and the fallback always renders. The app had **177** such
references across **90** names before spec 090, and they were why green survived the palette sweep.

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

See `specs/090-chippr-brand-alignment/` for the full contract and
`specs/091-neutral-token-consolidation/` for the sweep that made the literal gate possible. Both
carry a `screenshots/README.md` recording what the visual loop caught that the audits could not —
in 091's case, two role-mapping mistakes that every automated check read as correct.
