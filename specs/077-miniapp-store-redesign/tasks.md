# Tasks: Mini-App Store UX Redesign

**Input**: Design documents from `/specs/077-miniapp-store-redesign/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/store-ui.md, quickstart.md

**Tests**: Included — constitution II makes Vitest coverage for behavior changes non-optional,
and the byte-gate/pairing checks ARE the tests for US3.

**Organization**: Phases follow the plan's execution order: the byte-gate resolution (US3) runs
first as an isolated, separately-committed increment so the redesign commits demonstrably move
no package bytes and the redesign is validated on the final toolchain. US1 then US2 follow.

## Phase 1: Setup

- [X] T001 Verify clean baseline before any change: `npm run check:deps` and the stamped byte-gate
      compare (`STAMP=$(($(date +%s) * 1000)); npm run build:miniapps && node
      scripts/miniapps/record-build-digests.js --compare
      specs/075-monorepo-workspaces/baseline-miniapp-builds.json --since "$STAMP"`) both green on
      the unmodified tree, proving any later diff is caused by this feature.

## Phase 2: User Story 3 — Byte-gate resolution: absorb the vite build-preset bump (Priority: P2, executed first per plan)

**Goal**: vite 8 toolchain absorbed deliberately; bytes re-recorded + version-paired; release
steps documented. **Independent test**: quickstart §1.

- [X] T002 [US3] Align toolchain ranges in `frontend/package.json` (`vite` → `^8.2.1`,
      `@vitejs/plugin-react` → `^5.2.0`, `vitest`/`@vitest/coverage-v8`/`@vitest/ui` → `^4.1.10`),
      `frontend/miniapps/token-mint/package.json` and `frontend/miniapps/clearpath/package.json`
      (`vite` → `^8.2.1`, `@vitejs/plugin-react` → `^5.2.0`, `vitest` → `^4.1.10`), and
      `tools/miniapp-build/package.json` (`peerDependencies.vite` → `^8.2.1`).
- [X] T003 [US3] Bump mini-app package versions by hand (spec 076 FR-007/FR-007b):
      `frontend/miniapps/token-mint/package.json` and `frontend/miniapps/clearpath/package.json`
      `1.0.0 → 1.0.1`.
- [X] T004 [US3] Full re-resolve via `npm run deps:reinstall` (NEVER incremental `npm install`),
      updating `package-lock.json`.
- [X] T005 [US3] Run `npm run check:deps`; if the rollup optional binary left the lockfile with the
      rolldown-based vite 8, update `REQUIRED_OPTIONAL` in
      `scripts/deps/check-dependency-hygiene.js` to guard the binary the build actually needs
      (`@rolldown/binding-linux-x64-gnu`), keeping the rollup entry only if rollup remains in the
      tree. Gate must end green for a real reason, never vacuously.
- [X] T006 [US3] Rebuild + prove detection: stamp, `npm run build:miniapps` (fix any vite-8/preset
      incompatibilities in the packages' configs if the build fails — preset source changes are
      part of the absorbed move), run the `--compare` against the OLD baseline and confirm it
      FAILS reporting moved digests; then re-record with `node
      scripts/miniapps/record-build-digests.js --out
      specs/075-monorepo-workspaces/baseline-miniapp-builds.json` and re-run `--compare` green.
- [X] T007 [US3] Run `node scripts/release/check-miniapp-versions.js --base origin/main --head
      HEAD` → "pairing OK"; run the host build (`npm run build --workspace frontend`) and scoped
      frontend suites (`npx vitest run src/test/miniapps --root frontend`) under the new
      toolchain; fix any vite-8/vitest-4.1 breakage in host config (`frontend/vite.config.js`,
      `frontend/vite-plugins/*`) — behavior-preserving only.
- [X] T008 [US3] Update `docs/runbooks/miniapp-registry-operations.md` with the "re-publish +
      re-approve after a toolchain byte move" procedure (rebuild → publish to IPFS → propose →
      `approveApp(id, expectedManifestHash)` per cohort) stating explicitly that on-chain records
      commit to the previous bytes until curators complete it; note the v1.0.1 rebuilds.
- [X] T009 [US3] Commit Phase 2 as its own commit (manifests + lockfile + baseline + versions +
      guard + runbook), so the byte diff is reviewable in isolation.

**Checkpoint**: byte gate green on new baseline; pairing check green; host build green.

## Phase 3: User Story 1 — Trustworthy, scannable app market (Priority: P1) 🎯 MVP

**Goal**: redesigned market view — artwork, badge, category headers, data box, rocket CTA,
restructured trust copy. **Independent test**: quickstart §2 steps 1, 4–6.

- [X] T010 [P] [US1] Create `frontend/src/components/miniapps/appArtwork.jsx`: slug-keyed inline
      SVG illustrations for `token-mint` (token/mint motif) and `clearpath` (governance/compass
      motif) plus a generic fallback; `artworkFor(slug)` total function; art theme-aware
      (currentColor/CSS vars) and `aria-hidden` per contracts/store-ui.md §3.
- [X] T011 [US1] Redesign `frontend/src/components/miniapps/CatalogPanel.jsx` market surface:
      verified-market banner (badge + title) rendered ONLY on `listing.verified`; security
      explanation restructured into short prioritized blocks with icons preserving the spec-073
      factual claims; `AppCard` gains artwork panel, contained Vendor/Version data box, rocket
      glyph inside the Launch link (accessible name unchanged); all four honest states and both
      launch-refusal reasons preserved verbatim in meaning.
- [X] T012 [US1] Extend `frontend/src/components/miniapps/miniapps.css` with the store aesthetic:
      badge/banner, card artwork panel, data box, category group headers, control styling —
      scoped under existing class-name discipline, `var(--token, fallback)` theming, WCAG 1.4.1
      colour-independence, light/dark/tenant-safe.
- [X] T013 [US1] Add/extend Vitest suites in `frontend/src/test/miniapps/` covering: artwork
      fallback for unknown/null slugs; badge present on verified listing and ABSENT on stale
      snapshot/unreachable/not-deployed; data box renders vendor tooltip + version; Launch
      accessible name intact; honest-state copy branches still render; axe pass on the redesigned
      surface.

**Checkpoint**: market view fully redesigned and tested — MVP deliverable.

## Phase 4: User Story 2 — Quick section navigation (Priority: P2)

**Goal**: persistent Market / My Apps / Search store bar on the `?view=` seam.
**Independent test**: quickstart §2 steps 2–3.

- [ ] T014 [P] [US2] Create `frontend/src/components/miniapps/StoreBar.jsx`: `<nav>` with
      accessible name, link entries Market (`view` absent), My Apps (`view=mine`), Search
      (`view=search`), `aria-current="page"` on the active entry; bottom-anchored on small
      viewports, inline on wide (styles in miniapps.css).
- [ ] T015 [US2] Wire sub-views in `frontend/src/components/miniapps/CatalogPanel.jsx`: StoreView
      resolution from `useSearchParams` (unknown → market; `submit` keeps exclusive rendering);
      My Apps = favorites ∩ verified listing with identical AppCard/launch rules and honest empty
      state; Search = market with autofocused search + filters; all sub-views share the single
      fetched listing and state branches per contracts/store-ui.md §1.
- [ ] T016 [US2] Store bar + sub-view styles in
      `frontend/src/components/miniapps/miniapps.css` (thumb-reachable bottom bar on small
      viewports without occluding content; safe-area padding).
- [ ] T017 [US2] Vitest suites in `frontend/src/test/miniapps/`: view switching via query param,
      unknown view falls back to market, My Apps filtering + empty state, Search focus/filters,
      store bar aria-current and keyboard operability, sub-views never refetch (single
      fetchCatalog call), honest states rendered identically across sub-views.

**Checkpoint**: full store navigation working with US1 visuals.

## Phase 5: Polish & Cross-Cutting

- [ ] T018 [P] Update `docs/developer-guide/miniapps.md`: host-side artwork map (why art never
      comes from packages/chain), store sub-view seam, badge honesty rule.
- [ ] T019 Final verification sweep (monorepo-verify): `npm run check:deps`, stamped byte-gate
      compare green against the NEW baseline, `check-miniapp-versions` pairing green, scoped
      frontend suites + lint + host build green; confirm the redesign commits (Phases 3–5)
      moved NO baseline digest.

## Dependencies & Execution Order

- Phase 1 → Phase 2 (US3) → Phase 3 (US1) → Phase 4 (US2) → Phase 5.
- US3 is functionally independent of US1/US2 but runs first by plan decision (isolated byte
  diff; redesign validated on final toolchain).
- US2 depends on US1's redesigned AppCard/CSS only for visual consistency; its logic is
  independent (could be built against the old card if needed).
- [P] opportunities: T010 alongside T011-prep; T014 alongside T015-prep; T018 anytime after
  Phase 4.

## Implementation Strategy

MVP = Phase 3 (US1) — the redesigned market alone satisfies the issue's core pain points.
Phases commit separately: toolchain bump (one commit), US1, US2, polish — each leaving the
tree green.
