# Implementation Plan: Mini-App Store UX Redesign

**Branch**: `claude/mini-app-redesign-k7f1lu` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/077-miniapp-store-redesign/spec.md`

## Summary

Two independent deliverables that share a release (issue #1024 + its byte-gate scoping
comment):

1. **Host-only store redesign** — `frontend/src/components/miniapps/` gets the "fun modern
   mini app store" treatment: curated inline-SVG artwork per app (slug-keyed, generic
   fallback), a verified-market trust banner shown only on verified listings, restructured
   security copy as prioritized blocks, styled category group headers, a contained
   vendor/version data box, a rocket-icon Launch CTA, restyled search/filter/refresh
   controls, and an in-section Market / My Apps / Search store bar on the existing `?view=`
   seam. No mini-app package byte moves; trust semantics (`launchable`, four honest states)
   unchanged.
2. **Byte-gate resolution** — absorb the deferred vite 7→8 toolchain move (closed Dependabot
   #1061 item) deliberately: align `vite ^8.2.1` + `@vitejs/plugin-react ^5.2.0` +
   `vitest`-family `^4.1.10` across every declaring manifest (FR-015 skew gate forbids a
   partial bump), reinstall via `deps:reinstall`, rebuild packages with the stamped byte-gate
   flow, re-record `baseline-miniapp-builds.json`, patch-bump both mini-app package versions
   (FR-007b pairing gate), update the npm/cli#4828 optional-binary guard for the
   rolldown-based toolchain if rollup leaves the lockfile, and extend the runbook with the
   re-publish/re-approve procedure the moved bytes require.

## Technical Context

**Language/Version**: JavaScript (React 19, Node 22); no Solidity changes

**Primary Dependencies**: React 19 + Vite (host build), `vite`/`@vitejs/plugin-react`/
`vitest` (bumped: ^8.2.1 / ^5.2.0 / ^4.1.10), `@fairwins/miniapp-build` preset,
react-router-dom (query-param sub-views)

**Storage**: none new — favorites via existing `lib/miniapps/favorites`; no on-chain or
schema changes

**Testing**: Vitest (scoped runs locally, full suite in CI), axe accessibility checks,
byte gate (`scripts/miniapps/record-build-digests.js`), `check:deps`,
`scripts/release/check-miniapp-versions.js`

**Target Platform**: Web (mobile-first store surface), light/dark + tenant themes

**Project Type**: Web frontend (workspace monorepo)

**Performance Goals**: no regression — artwork is inline SVG (no network fetches), sub-view
switching is client-side state

**Constraints**: zero package-byte moves from the redesign itself; all byte moves come from
the deliberate toolchain bump and are recorded + version-paired in the same change; registry
trust semantics untouched (spec 073 rules 1–5)

**Scale/Scope**: 1 CSS file + 1 component file redesigned, ~2 new host modules
(artwork, store bar), 2 live apps' artwork + 1 fallback; 4 manifests + lockfile for the bump;
2 mini-app version bumps; baseline + runbook/docs updates

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` v1.0.0 — PASS (re-checked after
Phase 1 design, still PASS).*

- **I. Security-first contracts** — no `contracts/` changes. The registry's trust surface is
  deliberately untouched: `launchable` stays the serving decision (spec 073 rule 1), no new
  host-object keys, no manifest schema changes. PASS.
- **II. Test-first / coverage** — behavior changes land with Vitest coverage: store bar
  sub-views, artwork fallback, badge-only-when-verified, preserved honest states; existing
  CatalogPanel suites updated in the same change. Byte-gate + version-pairing checks are
  themselves the tests for the toolchain bump. PASS.
- **III. Honest state** — the verified badge renders only on verified listings (R5); stale/
  unreachable/not-deployed/empty renderings keep their distinct meanings; artwork fallback is
  a deliberate generic, never a fabricated identity; runbook states plainly that on-chain
  records commit to the OLD bytes until re-publish/re-approve. PASS.
- **IV. Fail loudly in CI** — no `continue-on-error`; the work *strengthens* gates if needed
  (optional-binary guard updated for rolldown rather than deleted). The byte gate firing is
  treated as the deliverable, per the issue's scoping comment. PASS.
- **V. Accessible, consistent frontend** — WCAG 2.1 AA: decorative SVGs `aria-hidden`,
  labelled controls, `aria-current` store bar, colour-independent state blocks, existing live
  regions preserved; theme via CSS variables only (no tenant identity hardcoding, spec 072).
  PASS.
- **Workflow** — Spec → Plan → Tasks → Implement followed; no deviations to log in
  Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/077-miniapp-store-redesign/
├── spec.md
├── plan.md              # this file
├── research.md          # R1–R6 decisions
├── data-model.md        # presentation-state + artwork-map + gate-artifact model
├── quickstart.md        # validation walkthrough
├── contracts/
│   └── store-ui.md      # store sub-view + artwork-map contracts
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output (not created by plan)
```

### Source Code (repository root)

```text
frontend/src/components/miniapps/
├── CatalogPanel.jsx        # redesigned: store bar, badge, grouped market, My Apps, Search
├── appArt.jsx              # NEW: inline-SVG illustration components (curated + generic)
├── appArtwork.js           # NEW: slug-keyed artwork map + artworkFor resolver
├── StoreBar.jsx            # NEW: Market / My Apps / Search in-section navigation
├── MiniAppWorkspace.jsx    # unchanged (launch path)
├── SubmitAppPanel.jsx      # unchanged (reached via existing view=submit)
└── miniapps.css            # extended: store-* styles, badge, cards, data box, store bar

frontend/src/test/miniapps/ # updated + new Vitest suites for the surface

# Byte-gate resolution
frontend/package.json                    # vite ^8.2.1, plugin-react ^5.2.0, vitest family ^4.1.10
frontend/miniapps/token-mint/package.json    # same bumps + version 1.0.0 → 1.0.1
frontend/miniapps/clearpath/package.json     # same bumps + version 1.0.0 → 1.0.1
tools/miniapp-build/package.json         # peerDependencies.vite → ^8.2.1
package-lock.json                        # full re-resolve (deps:reinstall)
scripts/deps/check-dependency-hygiene.js # REQUIRED_OPTIONAL updated for rolldown binary (if needed)
specs/075-monorepo-workspaces/baseline-miniapp-builds.json  # re-recorded
docs/runbooks/miniapp-registry-operations.md  # re-publish/re-approve after toolchain byte move
docs/developer-guide/miniapps.md         # artwork-map + store-surface notes
```

**Structure Decision**: All redesign work stays in the host component tree
(`frontend/src/components/miniapps/`) — nothing under `frontend/miniapps/*` or
`tools/miniapp-build/` changes source; only their manifests move for the dependency
alignment, and their `dist` byte change is the recorded, version-paired toolchain move.

## Implementation strategy (ordering rationale)

1. **Toolchain bump first, in isolation** — one commit for manifests + lockfile + baseline +
   versions + guard updates. Keeping it separate from the redesign makes the byte-gate diff
   reviewable on its own and proves the redesign commits move no package bytes.
2. **Redesign second** — artwork module, store bar, CatalogPanel/CSS overhaul, tests.
3. **Docs last** — runbook re-publish/re-approve procedure, developer-guide updates.

Verification at each stage per the `monorepo-verify` skill: `check:deps`, stamped byte-gate
compare, scoped Vitest runs locally (full suite only in CI — local full runs OOM), frontend
build, lint.

## Risks

- **Vite 8 is rolldown-based**: the host build and custom `frontend/vite-plugins/*` must be
  validated under the new bundler; if a plugin or config option is incompatible, fixing it is
  in scope (it's the cost of the absorbed bump). Mini-app dist bytes will move heavily —
  expected and recorded.
- **npm/cli#4828 guard**: rollup's binary may leave the lockfile with rollup itself; the
  guard must follow the toolchain (add rolldown's linux-x64-gnu binding) rather than pass
  vacuously or fail spuriously.
- **On-chain records lag by design**: until curators re-publish + re-approve, the chain
  serves the previous approved packages — the runbook update makes that explicit, and the
  repo's release record stays true because versions and bytes move together.

## Complexity Tracking

No constitution violations to justify.
