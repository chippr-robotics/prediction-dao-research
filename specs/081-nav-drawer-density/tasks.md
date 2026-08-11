# Tasks: Nav Drawer Density

**Feature**: `081-nav-drawer-density` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Ordered by dependency. `[P]` = parallelisable with the task beside it. Each user story block is
independently shippable and independently testable, per the spec's priorities.

## Phase 0 — Foundation (blocks everything)

- **T001** Add `frontend/src/lib/nav/navPreferences.js`: the device-scoped store for
  `nav_sections` and `nav_density` per `data-model.md` (lazy snapshot, revision counter,
  `subscribeNavPreferences`, `__resetNavPreferencesForTests`, defensive read validation).
- **T002** Add `frontend/src/test/navPreferences.test.js`: defaults with empty storage,
  round-trip persistence, `sectionKey` derivation, corrupt/foreign values falling back to
  defaults, unknown density rejected, subscribers notified once per commit.
- **T003** Verify the two keys are **not** present in `frontend/src/lib/backup/syncedObjects.js`
  and add a test asserting that, so a future backup change cannot quietly sync them.

## Phase 1 — User Story 1: Collapsible sections (P1)

- **T010** `components/ui/PortalNav.jsx`: add opt-in `collapsibleGroups={{ expanded, onToggle }}`
  and `emptyMessage`. When present, render the group label as
  `<button class="portal-nav-group-toggle" aria-expanded aria-controls>` with a chevron, and
  render items inside `<div id role="group">`, **unmounted** when collapsed. When absent, take
  today's exact render path. Ignore `collapsibleGroups` entirely while `collapsed` (desktop
  gutter).
- **T011** `components/ui/PortalNav.css`: styles for the toggle button, the chevron and its
  rotation, and `prefers-reduced-motion` suppression.
- **T012** `components/nav/AppNavDrawer.jsx`: read section state from the store, subscribe to
  changes, compute the effective expansion map (`filter > active group > stored`), and pass
  `collapsibleGroups`. Persist only real member toggles.
- **T013** [P] `frontend/src/test/AppNavDrawer.sections.test.jsx` — US1 acceptance scenarios
  1–5: defaults, toggle, persistence across remount, force-expand of the active section without
  overwriting storage, and the header's `aria-expanded` / `aria-controls` wiring.
- **T014** [P] `frontend/src/test/PortalNav.test.jsx` — non-regression: without
  `collapsibleGroups` the rail renders group labels as non-interactive elements and every item
  is present (Admin Panel / My Account form unchanged).
- **T015** Update `frontend/src/test/AppNavDrawer.test.jsx` for the new default: assertions on
  TOOLS/APPS items now expand those sections first. This is a deliberate, visible update, not a
  silent relaxation.

## Phase 2 — User Story 2: Pinned apps strip (P1)

- **T019** `config/appNav.js`: move the `apps` catalog entry into the Tools group and drop the
  Apps group (research R9). Tab ids and `/apps/<slug>` routes unchanged; update the drawer,
  mini-app navigation and section tests that named Apps as a group.
- **T020** Add `components/nav/PinnedAppsStrip.jsx`: horizontal strip of icon tiles, capped at
  `VISIBLE_PINNED_CAP = 5`, with a "Show all N (+K)" / "Show fewer" control BELOW the row (never
  inside the scroller). Renders nothing when there are no pins. Each tile shows the app's curated
  store artwork via `artworkFor(slug)` (research R10); full app name as accessible name and
  `title`; visible label clamped to two lines. Marks the active app with `aria-current="page"`.
- **T021** `components/nav/AppNavDrawer.jsx`: stop splicing favorites into the Quick Access
  group (`buildDrawerGroups`); render the strip above the section list; keep Home + Portfolio as
  rows. Preserve existing routing and `resolveActiveId`'s `favorite-<id>` behaviour.
- **T022** `components/nav/AppNavDrawer.css`: strip layout, horizontal scroll, wrapped expanded
  state, tile sizing.
- **T023** [P] `frontend/src/test/AppNavDrawer.pinned.test.jsx` — US2 acceptance scenarios 1–6:
  tiles render, cap honoured with an accurate hidden count, overflow expands and collapses,
  activation navigates and closes the drawer, nothing renders with zero pins, active tile
  marked.

## Phase 3 — User Story 3: Search (P2)

- **T030** Add a pure `filterNavGroups(groups, query)` in `lib/nav/filterNav.js` (its own module,
  not the drawer file — react-refresh requires a component module to export only components) doing
  case-insensitive, trimmed label matching and dropping empty groups.
- **T031** `components/nav/AppNavDrawer.jsx`: sticky labelled search field with a clear control;
  filter both the section groups and the pinned strip; force-expand all groups while filtering;
  reset the query whenever the drawer opens and on navigation.
- **T032** `components/nav/AppNavDrawer.css`: `position: sticky` field inside the drawer's
  scroll column.
- **T033** `components/ui/PortalNav.jsx`: render `emptyMessage` when the filtered group list is
  empty (no silent blank panel).
- **T034** [P] `frontend/src/test/AppNavDrawer.search.test.jsx` — US3 acceptance scenarios 1–6,
  including that clearing the filter restores the member's own collapse states untouched.

## Phase 4 — User Story 4: Compact density (P3)

- **T040** `components/nav/AppNavDrawer.jsx`: read density from the store, subscribe, and apply
  `app-nav-drawer--compact` to the drawer root.
- **T041** `components/nav/AppNavDrawer.css`: compact rules scoped under that class only — row
  padding, icon tile size, label size, strip tile size, section header — never in
  `PortalNav.css`.
- **T042** Add `components/account/NavigationPreferencesPanel.jsx` + `.css`: a Comfortable /
  Compact radio group inside an `AccordionSection` card, in the `HomePreferencesPanel` idiom.
- **T043** `pages/WalletPage.jsx`: mount it in the Settings tab's `AccordionGroup`.
- **T044** [P] `frontend/src/test/AppNavDrawer.density.test.jsx` — US4 acceptance scenarios 1–4:
  panel toggles the class with no reload, persistence, the shared rail surfaces are unaffected,
  and the compact CSS declares no interactive target below 36px.

## Phase 5 — Cross-cutting validation

- **T050** `frontend/src/test/AppNavDrawer.axe.test.jsx` — SC-005: axe clean in both densities,
  with sections expanded and collapsed, and with a filter active.
- **T051** Add `scripts/ui/capture-nav-drawer.mjs` (Playwright resolved from a scratch dir per
  research R8) capturing: default state, all expanded, filter active, compact, and 8 pinned
  apps at 390×844. Write to `specs/081-nav-drawer-density/screenshots/`.
- **T052** Run the scoped frontend Vitest files (never the full suite locally — it OOMs this
  environment), `npm run lint --workspace frontend`, and `npm run check:deps`.
- **T053** Add `docs/developer-guide/nav-drawer.md` describing the drawer's states, the two
  preference keys, and the opt-in `PortalNav` props; link it from the spec.
- **T054** Update `CLAUDE.md` with the invariants a future change must not break (opt-in rail
  props, device-scoped and unsynced preferences, filter/active/stored precedence, the strip cap).

## Dependencies

```
T001 ─┬─ T002, T003
      ├─ T012 ── T013, T015
      ├─ T040 ── T042 ── T043 ── T044
T010 ─┴─ T011, T012, T014, T033
T020 ── T021 ── T022, T023
T030 ── T031 ── T032, T034
T013/T023/T034/T044 ── T050 ── T051 ── T052 ── T053, T054
```

Phases 1–4 are independently shippable in priority order; Phase 0 blocks all of them.
