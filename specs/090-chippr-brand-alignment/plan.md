# Implementation Plan: Chippr Brand Alignment for FairWins Styling Defaults

**Branch**: `claude/fairwins-chippr-branding-doqie6` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/090-chippr-brand-alignment/spec.md`

## Summary

Re-point every default color and type value in the FairWins app onto the Chippr Robotics Brand
Guidelines v1.0, without touching the FairWins mark.

The approach has four moves, in order:

1. **Rebuild the token layer.** `frontend/src/theme.css` becomes the single statement of the Chippr
   palette — a three-step teal ladder on Gunmetal/Cloud neutrals — plus a new typography token block
   carrying the guidelines' web hierarchy.
2. **Make the token layer actually govern.** A deterministic codemod replaces the 686 hex literals
   and 169 `rgba()` brand triples scattered across 74 CSS files with `var(--token)` references. This
   is the difference between a rebrand and a rebranded stylesheet nobody reads.
3. **Lock it.** Two Vitest guards — a literal scanner and a contrast audit — fail CI if a retired hue
   returns or a token pairing drops below AA.
4. **Look at it.** An actor-critic screenshot loop over the real running app, both themes, both
   viewports, until a full round produces no findings.

The FairWins clover mark and every logo asset are untouched, per the guidelines' own endorsement
model: the master brand governs color and type across the estate; product marks stay with products.

## Technical Context

**Language/Version**: JavaScript (ES2022), CSS. Node 20+.

**Primary Dependencies**: React 18 + Vite (existing). New: `@fontsource-variable/space-grotesk`,
`@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono` — self-hosted OFL webfonts,
added to the `frontend` workspace.

**Storage**: N/A. Theme mode and platform already persist in `localStorage`
(`themeMode`, `themePlatform`); unchanged.

**Testing**: Vitest (frontend). Two new guard tests. Playwright, operator-scoped under `/tmp/pw`,
for the screenshot harness — deliberately *not* a workspace dependency.

**Target Platform**: Browser SPA, installable PWA. Desktop 1280×900 and mobile 390×844 are the
validated viewports.

**Project Type**: Web frontend. No contract, gateway, subgraph, or infrastructure changes.

**Performance Goals**: No first-paint regression. Self-hosted fonts are subset variable files served
from origin with `font-display: swap`, so text is legible before fonts settle (FR-013).

**Constraints**: WCAG 2.1 AA in both themes (constitution V). No CSP change (FR-014) — self-hosting
uses the already-granted `font-src 'self'`. Lockfile changes must survive `npm run check:deps`
(spec 075).

**Scale/Scope**: 74 CSS files, 686 hex literals, 169 rgba triples, 1 tenant manifest, 1 index.html,
3 non-DOM brand surfaces (PWA metadata, statement PDF theme, QR defaults). ~40 stray `font-family`
declarations to re-point.

## Constitution Check

*GATE: passed before Phase 0. Re-checked after Phase 1 — see below.*

| Principle | Assessment |
|---|---|
| **I. Security-First Smart Contracts** | Not engaged. No `contracts/` change. No security review gate triggered. |
| **II. Test-First and Comprehensive Coverage** | Engaged and satisfied. Both guards (literal scanner, contrast audit) are written **before** the sweep they protect, and both must fail against the current tree first — that is what proves they work. |
| **III. Honest State, No Mocks or Placeholders** | Engaged at the color layer. Success/warning/error/destructive must stay mutually distinguishable (FR-008), and status may not be carried by color alone (FR-009). The screenshot harness stubs at real app seams and shows real state, never posed color swatches. |
| **IV. Fail Loudly in CI** | Satisfied. Both guards are Vitest tests in the existing frontend job — no new workflow, no `continue-on-error`, nothing skippable. |
| **V. Accessible, Consistent Frontend** | This is the principle the feature serves. AA is enforced mechanically by the contrast audit rather than asserted. |
| **Tech stack** | No new core technology. Three OFL font packages and an operator-scoped Playwright install are additions to existing categories, not new stack elements. |
| **Simplicity (YAGNI)** | The codemod is the simplicity argument: one mapping table replaces 686 hand edits. Scope is deliberately held back from the ~500 non-brand neutral-grey literals (research R8), which are unrelated debt. |

**Post-Phase-1 re-check**: No new violations. One item is recorded below as an intentional,
justified extension rather than a deviation.

### Complexity Tracking

| Item | Why it is needed | Why the simpler path was rejected |
|---|---|---|
| Success and danger colors outside the Chippr palette | The palette defines Amber as its only signal color. A wallet must distinguish succeeded / failed / warning / destructive, because a member acts differently on each. | Using Amber for all of them collapses four states into one appearance — a constitution III violation at the color layer. Documented in spec Assumptions and research R5. |

## Project Structure

### Documentation (this feature)

```text
specs/090-chippr-brand-alignment/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R11 + risk register
├── data-model.md        # the token set
├── quickstart.md        # how to validate
├── contracts/
│   ├── color-tokens.md  # token → value contract, both themes
│   └── type-tokens.md   # type role → family/size/weight/leading contract
├── checklists/
│   └── requirements.md
└── screenshots/         # actor-critic output + findings README
```

### Source code

```text
frontend/
├── index.html                          # PWA theme-color meta
├── package.json                        # + 3 @fontsource deps
└── src/
    ├── theme.css                       # REWRITTEN — the palette + type tokens
    ├── index.css                       # font stacks, heading scale, link color
    ├── App.css                         # brand literals → tokens
    ├── styles/
    │   └── fonts.css                   # NEW — @fontsource imports, one place
    ├── components/**/*.css             # 74 files, codemod-swept
    ├── data/reports/statement/theme.js # statement PDF accents
    ├── utils/qrColorPreference.js      # QR defaults
    └── test/
        ├── brand/noLegacyBrandColors.test.js   # NEW guard (FR-005)
        └── brand/tokenContrast.test.js         # NEW guard (FR-018)

tenants/fairwins/manifest.json          # default tenant theme declaration

scripts/
├── brand/codemod-colors.mjs            # NEW — one-shot, mapping-table driven
└── ui/capture-brand.mjs                # NEW — actor harness
```

**Structure decision**: Everything lands in `frontend/` plus the one tenant manifest that declares
the default theme. No new directories beyond `frontend/src/styles/` (font imports) and
`frontend/src/test/brand/` (guards), both of which follow existing conventions in the tree.

## Phase 0 — Research

Complete. See [research.md](./research.md). Eleven decisions, all resolved, no open
NEEDS CLARIFICATION. The load-bearing ones:

- **R1** — the guidelines' contrast table was independently recomputed and is accurate to two
  decimals, so it can be relied on for light-theme pairings. Chippr Teal has only 0.24 of AA
  headroom, which is why FR-017 exists.
- **R3/R4** — Chippr Teal fails AA on every dark surface (2.26–3.52). The dark theme uses a lifted
  teal and a Gunmetal-derived surface ladder.
- **R7** — fonts are self-hosted, not pulled from Google, because this is an offline-capable
  self-custody wallet and `font-src 'self'` is already granted.
- **R8** — the codemod's rule is exact-match only: *a literal equal to a token's current value becomes
  that token*. Non-brand neutral greys are explicitly out of scope.

## Phase 1 — Design & Contracts

Complete. Artifacts:

- [data-model.md](./data-model.md) — the token set as entities: color tokens, type tokens, the tenant
  override relationship, and the codemod mapping table.
- [contracts/color-tokens.md](./contracts/color-tokens.md) — every color token with its light value,
  dark value, and the contrast obligation the audit enforces.
- [contracts/type-tokens.md](./contracts/type-tokens.md) — every type role with family, size, weight,
  line-height, tracking, and the fallback stack.
- [quickstart.md](./quickstart.md) — the validation runbook.

### Design notes

**Token names do not change.** `--brand-primary` / `--brand-secondary` / `--brand-accent` keep their
names and change their values. This keeps the tenant manifest contract stable and avoids layering a
rename sweep on top of a value sweep (research R2).

**The codemod is one-shot and reviewable.** It reads an explicit mapping table, rewrites only exact
matches, and reports a per-file count. It is committed so the sweep is reproducible and auditable,
not run-and-discarded.

**Guards are written first.** Per constitution II, both guard tests are authored and confirmed
*failing* against the current tree before the sweep runs. A guard that has never been red is not
evidence of anything.

**The harness stubs at real seams.** Per the actor-critic skill: `window.ethereum` via EIP-6963 for
the wallet, the spec-069 member RPC override for chain reads, seeded `fw_user_*` / `fw_global_prefs`
storage — so the screenshots show the app working, not a color swatch page. A swatch page would
photograph the tokens; only the real surfaces photograph the *rebrand*.

## Phase 2 — Task generation approach

`/speckit-tasks` will decompose this into dependency-ordered work. The ordering is forced by three
hard constraints:

1. **Dependencies before anything else.** The font install must complete and `npm run check:deps`
   must pass before any other change lands, so that a platform-binary drop is diagnosed on its own
   rather than blamed on the codemod.
2. **Guards before the sweep.** Both must be red against the current tree first.
3. **Tokens before the sweep.** The codemod maps literals to tokens by *current* value, so it must
   read the old values while writing the new token references — meaning the mapping table is built
   from the pre-change token values, and the token file is rewritten in the same change.

Then: tenant manifest, non-DOM surfaces, typography application, verification suite, and finally the
screenshot loop, which cannot start until the app renders the new palette.

## Verification

| Requirement | Verified by |
|---|---|
| FR-002, FR-003, FR-005, SC-001 | `noLegacyBrandColors.test.js` — scans shipped styling, fails listing file:line |
| FR-016, FR-017, FR-018, SC-002 | `tokenContrast.test.js` — parses shipped tokens, asserts every declared pairing both themes |
| FR-001, FR-006, FR-007, FR-010–015 | `contracts/*.md` reviewed against the shipped token files; screenshot round |
| FR-008, FR-009 | Screenshot round — status surfaces enumerated in the harness scenario list |
| FR-019, FR-020, SC-004 | `git diff --stat` empty on `frontend/public/assets/*` |
| FR-021 | Existing `tenantConfig.test.js` + manifest validation (`npm run tenants:validate`) |
| FR-023, SC-003 | `specs/090-chippr-brand-alignment/screenshots/` + findings README |
| SC-005 | `npm run test:frontend`, existing accessibility job |
| SC-006 | Implied by SC-001 passing: no brand literals remain outside token definitions |

## Risks

Carried from [research.md](./research.md#risk-register). The one that will actually bite:

**Adding three dependencies re-resolves the lockfile**, and spec 075 records that 3 of 5 recent
lockfile-touching PRs silently dropped the platform binary, breaking every Vite build including the
on-chain mini-app release path. The procedure is not optional: `npm pkg set` to declare,
`npm run deps:reinstall` to resolve (**never** a bare `npm install`, which cannot fix it and will
report "up to date"), then `npm run check:deps` to confirm. This happens first and alone.
