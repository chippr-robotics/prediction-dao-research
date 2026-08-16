# Tasks: Chippr Brand Alignment for FairWins Styling Defaults

**Feature**: 090-chippr-brand-alignment
**Branch**: `claude/fairwins-chippr-branding-doqie6`
**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Two guard tests are **required** — spec FR-005 and FR-018 mandate automated checks, and
constitution II requires them written before the code they protect.

## Phase 1 — Setup

Runs first and **alone**. Spec 075 records that lockfile-touching changes here have repeatedly
dropped the platform binary every Vite build needs; isolating this phase means a dependency failure
is diagnosed as one, not blamed on the sweep.

- [ ] T001 Declare the three OFL brand font packages on the `frontend` workspace with `npm pkg set 'dependencies.@fontsource-variable/space-grotesk'='^5.3.0' 'dependencies.@fontsource-variable/inter'='^5.3.0' 'dependencies.@fontsource-variable/jetbrains-mono'='^5.3.0' --prefix frontend`
- [ ] T002 Resolve the lockfile with `npm run deps:reinstall` — **never** a bare `npm install`, which reports "up to date" and cannot repair a lockfile that is already wrong
- [ ] T003 Confirm dependency hygiene with `npm run check:deps`; if the platform binary was dropped, restore `package-lock.json` and reinstall the binary alone per the `monorepo-workspace` skill before continuing
- [ ] T004 Record the pre-change baseline for later comparison: write the output of `npm run test:frontend` (failure list only) to `/tmp/baseline-frontend.txt` so new failures are distinguishable from pre-existing ones (SC-005)

**Checkpoint**: dependencies healthy, fonts resolvable, baseline captured. Nothing visual has changed.

---

## Phase 2 — Foundational (blocking)

The guards and the token layer. Everything in Phase 3+ depends on these.

**Guards first, and they must be red.** A guard that has never failed proves nothing.

- [ ] T005 [P] Write the legacy-color guard in `frontend/src/test/brand/noLegacyBrandColors.test.js`: scan shipped styling (`frontend/src/**/*.css`, `frontend/src/**/*.jsx`, `frontend/src/**/*.js`, `frontend/index.html`, `tenants/*/manifest.json`) for `#2FA043`, `#36B37E`, `#2F9E6E`, `#45C492`, `#5ED6A6`, `#4C9AFF`, `#4A9EFF`, `#7BDCB5` and the rgba triples `54,179,126` / `76,154,255` / `123,220,181`; fail listing every `file:line`; exclude `src/test/**` fixtures and archived trees (FR-005)
- [ ] T006 [P] Write the contrast audit in `frontend/src/test/brand/tokenContrast.test.js`: parse token declarations out of `frontend/src/theme.css` for both themes, implement WCAG 2.1 relative luminance, and assert every pairing in the obligations table of `contracts/color-tokens.md` (FR-016, FR-017, FR-018)
- [ ] T007 Run both guards and **confirm they fail** against the current tree — T005 must report ~686 hits, T006 must report the outgoing palette's failures. Record the counts; a guard that passes here is not testing anything
- [ ] T008 Rewrite `frontend/src/theme.css` to the token set in `contracts/color-tokens.md`: Chippr palette as the source block, Gunmetal-derived dark ladder, three-step teal brand ladder, status extension, timeline progression, chart series, account-card tints (keeping `mint` resolving via an alias so stored profiles do not break), and the raised radii
- [ ] T009 Add the typography token block to `frontend/src/theme.css` per `contracts/type-tokens.md`: `--font-display` / `--font-sans` / `--font-mono` / `--font-family` alias, and the four tokens per type role (`--text-*`, `--leading-*`, `--weight-*`, `--tracking-*`), plus `--measure-body`
- [ ] T010 Create `frontend/src/styles/fonts.css` importing the three `@fontsource-variable` packages with `font-display: swap`, and import it once from `frontend/src/main.jsx` (or the existing root style entry) so no component imports fonts itself (FR-013, FR-014)
- [ ] T011 Re-run T006 — the contrast audit must now **pass** against the new tokens. If a pairing fails, fix the token, not the obligation

**Checkpoint**: the token layer is Chippr-aligned and provably AA. T005 still fails — 74 files still hold literals. That is Phase 3.

---

## Phase 3 — User Story 1: A member sees one coherent brand (P1)

**Goal**: no surface still renders the retired green or the odds blue.

**Independent test**: navigate every top-level nav destination in both themes; no legacy brand hue appears; the FairWins mark is unchanged.

- [ ] T012 [US1] Write the codemod at `scripts/brand/codemod-colors.mjs`: driven by the explicit mapping table in `data-model.md`, exact-match only, case-insensitive on hex, handling `rgba()` brand triples by rewriting to `rgba(var(--token-rgb), α)`; it must report a per-file replacement count and refuse to touch anything under `src/test/`
- [ ] T013 [US1] Teach the codemod the theme-scoped rule: a dark-theme token value (e.g. `#E6EDF3`, `#23303D`, `#AAB6C2`, `#7A8590`, `#0E141B`, `#141C24`, `#26323D`) is replaced only inside a `.theme-dark` selector; the same literal outside one is **reported for manual review, never guessed at**
- [ ] T014 [US1] Run the codemod across `frontend/src/**/*.css` and review the reported summary; confirm the total replaced plus the total reported-for-review accounts for every hit T007 recorded
- [ ] T015 [US1] Resolve every site the codemod reported for manual review, deciding per site whether the value meant the light or dark token
- [ ] T016 [P] [US1] Sweep the brand literals out of the JS/JSX sites the codemod does not cover: `frontend/src/components/fairwins/MyMarketsModal.jsx`, `frontend/src/components/account/PnlChartCanvas.jsx`, `frontend/src/components/wallet/AssetLogo.jsx`
- [ ] T017 [US1] Update `tenants/fairwins/manifest.json` `brand.theme.{base,light,dark}` to declare exactly the values `theme.css` now defines — the manifest wins at runtime, so a stale manifest silently reverts the rebrand (FR-021)
- [ ] T018 [US1] Re-run T005; it must now **pass**. Any remaining hit is a real miss, not a false positive (SC-001)
- [ ] T019 [US1] Verify the mark is untouched: `git diff --stat origin/main -- frontend/public/assets/` returns empty (FR-019, FR-020, SC-004)

**Checkpoint**: the app renders in the Chippr palette everywhere. Type is still system fonts.

---

## Phase 4 — User Story 2: Type reads as Chippr (P1)

**Goal**: the three brand faces are actually applied, to the right roles.

**Independent test**: load any page; headings are the display face, body the text face, addresses the mono face.

- [ ] T020 [US2] Update `frontend/src/index.css`: `body` takes `var(--font-sans)`, `h1`–`h4` take their role tokens (size, line-height, weight, tracking), and the `a` color moves to `var(--accent-color)` — Teal 700, because links are body-sized and Chippr Teal is large-text-only (FR-017)
- [ ] T021 [US2] Re-point every local `font-family` that restates a system stack to `var(--font-sans)` across `frontend/src/**/*.css` and `*.module.css` (~20 sites, including `ShareModal.css`, `Button.module.css`, `Input.module.css`, `Badge.module.css`, `HelperText.module.css`, `AddressInput.module.css`, `StatusIndicator.module.css`, `FormGroup.module.css`)
- [ ] T022 [US2] Re-point every local monospace stack to `var(--font-mono)` (~20 sites, including `FairWinsUserModal.css`, `AddressInput.module.css`, `AddressBookField.css`, `AddressQRModal.css`, `SaveAddressToast.css`, `CallsignRegistryAdmin.css`, `AdminPanel.css`, `MarketAcceptanceModal.css`, `PremiumPurchaseModal.css`, `UserManagementModal.css`, `Footer.css`, `ComponentExamples.css`, `PerpsFeesPanel.css`) — these are exactly the addresses-and-hashes role FR-010 assigns to JetBrains Mono
- [ ] T023 [P] [US2] Add the non-heading role utilities (`.text-caption`, `.text-small`, `.text-code`) to `frontend/src/App.css` so a surface can take a role without inventing a size (FR-012)
- [ ] T024 [US2] Verify the font-failure path by hand: block the font files and reload; text stays legible in the fallback and layout does not break (FR-013)

**Checkpoint**: palette and typography both landed.

---

## Phase 5 — User Story 3 + 4: Signal honesty and accessibility (P1)

**Goal**: warning, error, destructive, and success stay mutually distinguishable; Amber stays a signal.

**Independent test**: enumerate every warning/error/degraded/destructive surface; each is distinguishable from the others and from brand emphasis.

- [ ] T025 [US3] Audit every surface using `--warning-*` for Amber overuse — the palette's only warm color is signal-only, so anything using the old orange as decoration must move to a neutral or teal tint rather than becoming an amber field (FR-007)
- [ ] T026 [US3] Confirm destructive confirmations are distinguishable from non-destructive primaries at a glance, and that no status is carried by color alone — each carries a label, icon, or text cue (FR-008, FR-009)
- [ ] T027 [US4] Extend `tokenContrast.test.js` with any pairing discovered during T025/T026 that the obligations table did not model, and update `contracts/color-tokens.md` to match — the contract and the audit must not drift

**Checkpoint**: all four P1 stories complete. The app is shippable at this point.

---

## Phase 6 — User Story 5: White-label tenants (P2)

**Goal**: the default tenant reproduces the rebranded product; overriding tenants still win.

**Independent test**: build the default tenant and one overriding tenant; each renders its own palette.

- [ ] T028 [US5] Run `npm run tenants:validate` and `npx vitest run src/test/tenantConfig.test.js --root frontend`; fix any drift between the manifest and `theme.css`
- [ ] T029 [US5] Confirm `tenants/example/` (or the non-default tenant present) still overrides the Chippr defaults rather than inheriting them, and that unoverridden keys fall through (FR-021)

---

## Phase 7 — User Story 6: Off-screen brand surfaces (P3)

**Goal**: installed-app chrome, statements, and QR artwork carry the palette.

**Independent test**: install the app and generate a statement; both are on-palette.

- [ ] T030 [P] [US6] Update the PWA theme color in `frontend/index.html` (`<meta name="theme-color">`) and `tenants/fairwins/manifest.json` `brand.pwa.themeColor` / `backgroundColor` to the Chippr values (FR-022)
- [ ] T031 [P] [US6] Update `frontend/src/data/reports/statement/theme.js` to the Chippr palette, honouring the guidelines' print fallback stack (Space Grotesk → Arial Bold, Inter → Arial/Calibri, JetBrains Mono → Courier New; never a serif, never Aptos) since generated documents have no webfont access
- [ ] T032 [P] [US6] Update `frontend/src/utils/qrColorPreference.js` defaults to the Chippr palette, keeping the QR's own contrast requirement intact — a QR that scans is non-negotiable, so verify the foreground/background pair stays well above the scanner threshold
- [ ] T033 [US6] Update the colour expectations in `frontend/src/test/reports/statementTheme.test.js` and `frontend/src/test/reports/statementPdf.test.js` to the new values

---

## Phase 8 — Verification

- [ ] T034 Run the full frontend suite (`npm run test:frontend`) and diff against the T004 baseline; every new failure is either fixed or explained (SC-005)
- [ ] T035 Confirm the app builds: `npx vite build --mode development --root frontend`
- [ ] T036 Run lint and fix anything the sweep introduced

---

## Phase 9 — Actor-critic visual validation (FR-023, SC-003)

Cannot start until the app renders the new palette and type. The loop is the backstop for everything
the audits cannot model.

- [ ] T037 Install operator-scoped Playwright at `/tmp/pw` (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, Chromium is pre-installed) — **never** a workspace dependency
- [ ] T038 Write the harness at `scripts/ui/capture-brand.mjs` following `scripts/ui/capture-verify.mjs`: the shot matrix is every scenario × {desktop 1280×900, mobile 390×844} × {light, dark}; abort all non-dev-server network; stub at real app seams (EIP-6963 `window.ethereum`, spec-069 RPC override, seeded `fw_user_*` / `fw_global_prefs`); suppress `.dev-warning-banner` and `.notification` via `addStyleTag`; one retry per shot then fail loudly
- [ ] T039 Choose the scenario list to cover both the brand surfaces and the honesty surfaces: home/portfolio, wallet, transfer, wagers, earn, collect, settings, recovery, protect, admin, plus at least one each of a warning banner, an error state, a destructive confirmation, and a chart
- [ ] T040 Run the capture and write the full matrix to `specs/090-chippr-brand-alignment/screenshots/`
- [ ] T041 Critique every PNG against the checklist in `quickstart.md` step 7 — legible, functional, honest, on-brand, composed — and record findings in `specs/090-chippr-brand-alignment/screenshots/README.md`
- [ ] T042 Fix findings and re-run the **whole** matrix; a fix for one cell can regress another. Repeat until a full round yields zero findings. If findings persist after three rounds, stop patching pixels and read the CSS of the neighbouring surface the design should match
- [ ] T043 Finalize `specs/090-chippr-brand-alignment/screenshots/README.md` with the shot table and what each round changed — that record is the evidence the loop ran

---

## Phase 10 — Documentation

- [ ] T044 [P] Write `docs/developer-guide/brand-tokens.md`: the palette, the type scale, how to add a surface without inventing a color, and why Chippr Teal must not be used for small text
- [ ] T045 [P] Add a Guardrails bullet to `CLAUDE.md` recording the invariants future work must not break: color comes from tokens only, Chippr Teal is large-text/fill only (`--accent-color` for links), Amber is signal-only, the FairWins mark stays independent of the Chippr brandmark, and both guards gate CI
- [ ] T046 Note the deferred neutral-grey consolidation (~500 non-brand literals, research R8) as a follow-up issue so it is carried, not lost

---

## Dependencies

```
Phase 1 (setup, alone)
   ↓
Phase 2 (guards red → tokens → guards green)   ← blocks everything
   ↓
Phase 3 (US1 palette sweep)  ──┐
   ↓                            │
Phase 4 (US2 typography)  ──────┤
   ↓                            ├─→ Phase 8 (verification) → Phase 9 (actor-critic) → Phase 10 (docs)
Phase 5 (US3+US4 honesty/a11y) ─┤
   ↓                            │
Phase 6 (US5 tenants) ──────────┤
Phase 7 (US6 off-screen) ───────┘
```

- **T007 gates T008** — tokens must not be rewritten until the guards have been seen failing against the old ones.
- **T008 gates T012** — the codemod writes token references, so the tokens must exist.
- **T014 gates T018** — the guard cannot pass until the sweep has run.
- **Phase 9 gates on Phases 3–7** — you cannot photograph a rebrand that has not landed.
- Phases 6 and 7 are independent of each other and of Phase 5; Phase 4 is independent of Phase 3 in principle but sequenced after it to keep the diff reviewable one concern at a time.

## Parallel opportunities

- **T005 ‖ T006** — the two guards are separate files with no shared code.
- **T016** runs alongside T014/T015 (different file types, disjoint sets).
- **T030 ‖ T031 ‖ T032** — three independent non-DOM surfaces.
- **T044 ‖ T045** — separate documents.

## Implementation strategy

**MVP is Phases 1–3.** That alone delivers User Story 1 — the palette lands everywhere and the app
stops being half-green. It is independently shippable and independently valuable.

**Phase 4 is the other half of the identity** and should land in the same PR; palette without
typography is a partial rebrand that reads as a color tweak.

**Phase 5 is where the constitution bites.** Do not treat it as polish — success/warning/error
distinguishability is an honest-state requirement in an app that moves money, and it is the one
part of this feature where getting it wrong causes a member to take the wrong action.

**Phase 9 is not optional and not a formality.** The contrast audit models declared token pairings;
it cannot see a button whose background now matches the card it sits on. That class of bug is
exactly what the screenshot loop exists to catch, and it has caught it here before (spec 085).
