# Data Model: Chippr Brand Alignment

No persisted data changes. The "model" here is the design-token set and the relationships that
decide which value wins at render time.

## Entities

### ColorToken

A named color role. The **only** place a color value is stated.

| Field | Description |
|---|---|
| `name` | CSS custom property, e.g. `--brand-primary` |
| `lightValue` | Value under `:root` / `.theme-light` |
| `darkValue` | Value under `.theme-dark` |
| `category` | `neutral` \| `brand` \| `interactive` \| `status` \| `timeline` \| `chart` \| `tint` |
| `contrastObligation` | Zero or more `(background token, minimum ratio)` pairs the audit enforces |

**Validation rules**

- Every token has a value in **both** themes. A token defined only in one theme is a bug — the other
  theme silently inherits a value designed for the wrong background.
- Every value traces to the Chippr palette, a documented mix of palette colors, or an entry in the
  status extension (research R5). Nothing else.
- No value may be a banned literal: `#2FA043`, `#36B37E`, `#2F9E6E`, `#45C492`, `#5ED6A6`, `#4C9AFF`,
  `#4A9EFF`, `#7BDCB5`.
- Every `contrastObligation` holds in the theme it is declared for.

Full instance list: [contracts/color-tokens.md](./contracts/color-tokens.md).

### TypeToken

A named type role.

| Field | Description |
|---|---|
| `role` | `h1`–`h4`, `body`, `small`, `caption`, `code` |
| `family` | `--font-display` \| `--font-sans` \| `--font-mono` |
| `size` | rem |
| `lineHeight` | unitless |
| `weight` | numeric |
| `tracking` | em, or normal |

**Validation rules**

- Sizes derive from the 1.25 major third on a 16px base and are expressed in `rem`.
- Line-heights are unitless (they must scale with the size they are applied to).
- Every family stack ends in a platform fallback, so a failed font load degrades rather than blanks.

Full instance list: [contracts/type-tokens.md](./contracts/type-tokens.md).

### TenantThemeDeclaration

A tenant's optional overrides, already defined by spec 072.

| Field | Description |
|---|---|
| `brand.theme.base` | Overrides applied in both themes |
| `brand.theme.light` | Light-only overrides |
| `brand.theme.dark` | Dark-only overrides |
| `brand.pwa.themeColor` | Installed-app chrome color |
| `brand.pwa.backgroundColor` | Splash background |

**Relationship**: tenant declaration **overrides** the defaults in `theme.css`. Absent keys fall
through. The `fairwins` tenant is the default and must reproduce the shipped product exactly, so its
declaration is updated in lockstep with `theme.css` — if the two disagree, the manifest wins at
runtime and `theme.css` becomes dead code.

**Validation rule**: after this change, `tenants/fairwins/manifest.json` states the same values for
every key it declares as `theme.css` does. Enforced by `tenantConfig.test.js`.

## The codemod mapping table

Not a runtime entity — the input to `scripts/brand/codemod-colors.mjs`, recorded here because it is
the specification of the sweep.

**Rule**: a color literal that exactly equals the *current* value of a theme token is replaced by
`var(--that-token)`. Exact match only; no fuzzy or nearest-color mapping.

### Brand literals → brand tokens

| Literal | Occurrences | Replacement |
|---|---|---|
| `#36B37E` | 447 | `var(--brand-primary)` |
| `#4C9AFF` | 93 | `var(--brand-secondary)` |
| `#2F9E6E` | 25 | `var(--primary-button-hover)` |
| `#7BDCB5` | 19 | `var(--brand-accent)` |
| `#4A9EFF` | 19 | `var(--brand-secondary)` |
| `#45C492`, `#5ED6A6` | few | `var(--primary-button)`, `var(--primary-button-hover)` |
| `rgba(54, 179, 126, α)` | — | `rgba(var(--brand-primary-rgb), α)` |
| `rgba(76, 154, 255, α)` | — | `rgba(var(--brand-secondary-rgb), α)` |
| `rgba(123, 220, 181, α)` | — | `rgba(var(--brand-accent-rgb), α)` |

### Neutral literals → neutral tokens

These are exact restatements of tokens whose values this feature changes, so leaving them would
produce visible drift between tokenized and non-tokenized surfaces.

| Literal | Occurrences | Replacement |
|---|---|---|
| `#1F2933` | 116 | `var(--text-primary)` |
| `#5A6772` | 83 | `var(--text-secondary)` |
| `#E3E7EB` | 73 | `var(--border-color)` |
| `#E6EDF3` | 65 | `var(--text-primary)` *(dark-theme value)* |
| `#23303D` | 57 | `var(--border-color)` *(dark)* |
| `#AAB6C2` | 55 | `var(--text-secondary)` *(dark)* |
| `#7A8590` | 41 | `var(--text-muted)` *(dark)* |
| `#0E141B` | 36 | `var(--bg-primary)` *(dark)* |
| `#F3F4F6` | 28 | `var(--bg-tertiary)` |
| `#F7F9FA` | 27 | `var(--bg-primary)` |
| `#8A959E` | 23 | `var(--text-muted)` |
| `#141C24` | 15 | `var(--bg-secondary)` *(dark)* |
| `#26323D` | — | `var(--bg-tertiary)` *(dark)* |

Dark-theme-value literals are replaced only where they occur inside a `.theme-dark` selector; a
dark value appearing in a light-theme rule is reported for manual review rather than guessed at.

### Status literals → status tokens

| Literal | Occurrences | Replacement |
|---|---|---|
| `#22C55E`, `#2ECC71` | 28 + | `var(--success-color)` |
| `#DC2626` | 66 | `var(--danger-color)` |
| `#E5533D` | 59 | `var(--danger-color)` |
| `#F59E0B`, `#F5A623` | 43 + 36 | `var(--warning-color)` |
| `#3B82F6` | 15 | `var(--info-color)` |
| `#FEF3C7` | 12 | `var(--warning-bg)` |
| `#78350F` | 12 | `var(--warning-text)` |

### Explicitly NOT mapped

Literals with no current token equivalent: `#6B7280` (155), `#E5E7EB` (128), `#111827` (84),
`#1A202C` (50), `#E2E8F0` (42), `#718096` (31), `#F8FAFC` (32), `#2D3748`, `#4A5568`, `#A0AEC0`,
`#667EEA`, `#6366F1`, `#6D28D9`, and the remaining Tailwind-ish neutrals.

These are pre-existing neutral-consolidation debt (research R8). They are not brand hues, they do not
clash with the teal system, and sweeping them would mix an unrelated refactor into a brand change.
**Recorded as follow-up, not silently dropped** — the literal guard does not fail on them, and the
plan says so.

## State transitions

None. Theme mode (`light` ⇄ `dark`) and platform selection already exist and are unchanged; this
feature changes what those states *resolve to*, not how they are entered.
