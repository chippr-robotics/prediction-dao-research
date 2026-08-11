# Implementation Plan: Nav Drawer Density

**Branch**: `081-nav-drawer-density` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/081-nav-drawer-density/spec.md`

## Summary

Reshape the expanded global nav drawer so its height is bounded by design: section headers
become accordion toggles with persisted per-device state, pinned mini-apps move from unbounded
labelled rows into one capped horizontal icon strip, a sticky filter field cuts across the
hierarchy, and a Compact density preference tightens the rows for high-volume operators.

The work is **frontend-only**. No contract, subgraph, gateway, deployment, or network change is
involved, and no on-chain or off-chain data model moves.

The central design constraint is that `components/ui/PortalNav.jsx` is **shared** by the Admin
Panel and the My Account portal as well as the nav drawer. Every new behaviour is therefore
**opt-in via props**, defaulting off, so the two portal rails render byte-identically to today.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18, JSX

**Primary Dependencies**: React, react-router-dom, Vite; no new runtime dependency

**Storage**: `localStorage` via the existing `utils/userStorage#saveGlobalPreference` /
`getGlobalPreference` device-scoped blob (`fw_global_prefs`). Deliberately **not** added to
`lib/backup/syncedObjects.js` — these are per-device display choices, same treatment as
`miniapp_favorites` (spec 073) and `network_endpoints` (spec 069).

**Testing**: Vitest + @testing-library/react (`frontend/src/test/`), plus `vitest-axe` for the
accessibility assertions, following the existing `*.axe.test.jsx` idiom. Visual validation via
a Playwright screenshot script against the dev server (see *Visual validation* below).

**Target Platform**: Browser (mobile-first PWA + desktop)

**Project Type**: Web frontend inside an npm workspace monorepo

**Performance Goals**: No new network or chain reads. Filtering is an in-memory pass over
~15 items; the drawer must not re-render on keystroke beyond its own subtree.

**Constraints**: WCAG 2.1 AA (constitution V); compact density floor of 36×36 CSS px per
interactive target; reduced-motion honoured; no layout shift on the desktop icon gutter.

**Scale/Scope**: One drawer, one shared rail component, one new preferences panel, two new
device preference keys. ~6 source files touched, 2 added, plus tests.

## Constitution Check

*GATE: passed before Phase 0; re-checked after design below.*

| Principle | Assessment |
|---|---|
| **I. Security-First Smart Contracts** | N/A — no `contracts/` change. |
| **II. Test-First and Comprehensive Coverage** | Vitest coverage is written per user story before/with the behaviour: accordion state + persistence + force-expand, pinned strip cap + overflow + navigation, filter matching + collapse override + reset, density toggle + target-size floor, and axe checks in both densities. |
| **III. Honest State, No Mocks or Placeholders** | The strip renders the live favorites list; the overflow control states the real hidden count; "no matches" is shown explicitly rather than an empty panel. Corrupt stored state falls back to defaults instead of silently inventing one. No mock data enters a shipped path. |
| **IV. Fail Loudly in CI** | No `continue-on-error` added. New tests run in the existing frontend Vitest job. |
| **V. Accessible, Consistent Frontend** | Headers are `<button aria-expanded aria-controls>`; collapsed items are unmounted (out of the a11y tree and tab order); the filter field is labelled; tiles carry full names as accessible names; axe tests cover both densities and both section states; reduced-motion respected. No contract addresses or ABIs involved. |

**No violations. Complexity Tracking section is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/081-nav-drawer-density/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0 decisions
├── data-model.md        # preference shapes
├── quickstart.md        # how to see it / validate it
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
frontend/src/
├── components/
│   ├── nav/
│   │   ├── AppNavDrawer.jsx        # MODIFIED — owns filter state, builds groups, renders strip
│   │   ├── AppNavDrawer.css        # MODIFIED — search bar, pinned strip, density vars
│   │   └── PinnedAppsStrip.jsx     # NEW — horizontal capped icon strip (store artwork)
│   ├── ui/
│   │   ├── PortalNav.jsx           # MODIFIED — opt-in `collapsibleGroups` + `emptyMessage`
│   │   └── PortalNav.css           # MODIFIED — header button, chevron, compact modifier
│   └── account/
│       ├── NavigationPreferencesPanel.jsx  # NEW — density radio group
│       └── NavigationPreferencesPanel.css  # NEW
├── config/
│   └── appNav.js                   # MODIFIED — Apps entry moves into the Tools group (R9)
├── lib/nav/
│   ├── navPreferences.js           # NEW — section state + density store (device-scoped)
│   └── filterNav.js                # NEW — pure label matching for the drawer filter
├── pages/
│   └── WalletPage.jsx              # MODIFIED — mount the panel on the Settings tab
└── test/
    ├── AppNavDrawer.test.jsx       # MODIFIED — existing drawer expectations
    ├── AppNavDrawer.sections.test.jsx    # NEW — US1
    ├── AppNavDrawer.pinned.test.jsx      # NEW — US2
    ├── AppNavDrawer.search.test.jsx      # NEW — US3
    ├── AppNavDrawer.density.test.jsx     # NEW — US4
    ├── AppNavDrawer.axe.test.jsx         # NEW — SC-005
    ├── navPreferences.test.js            # NEW — store
    └── PortalNav.test.jsx                # NEW/MODIFIED — non-regression for shared rail

scripts/
└── ui/capture-nav-drawer.mjs       # NEW — Playwright screenshot harness (dev tooling)
```

**Structure Decision**: Existing `frontend/` React app; no new project. The preference store
goes under `frontend/src/lib/nav/` to mirror `lib/network/endpointStore.js` and
`lib/miniapps/favorites.js` — a lazily-loaded snapshot + revision counter + subscribe, so the
drawer and the preferences panel react to each other without prop-drilling, exactly as the
favorites store already does for this same drawer.

## Design decisions

### 1. Accordions live in `PortalNav`, opt-in

`PortalNav` already renders `groups` as a label followed by items. Adding collapse there (rather
than in the drawer) keeps one rail implementation. It is gated behind a new
`collapsibleGroups` prop object:

```js
<PortalNav
  groups={drawerGroups}
  collapsibleGroups={{ expanded, onToggle }}   // absent ⇒ today's behaviour exactly
  emptyMessage="No matches"
/>
```

When absent, the render path is unchanged — the Admin Panel and My Account rails do not
re-render a single different node (FR-023, FR-025). When present, the group label element
becomes a `<button class="portal-nav-group-toggle" aria-expanded aria-controls>` wrapping the
same label text plus a chevron, and the items render inside a `<div id role="group">` that is
**unmounted** when collapsed (FR-006).

The collapsed desktop rail (`collapsed` prop) ignores `collapsibleGroups` entirely: its group
labels are already hairline rules, there is no room for a control, and every glyph must stay
reachable (FR-024).

### 2. Force-expand without overwriting

`expanded` handed to `PortalNav` is derived, not stored:

```js
const effectiveExpanded = { ...storedExpanded, [groupOfActiveItem]: true }
```

The stored map is untouched, so collapsing TOOLS while sitting on Recovery is remembered for
when the member leaves (FR-004). Precedence while filtering is: **filter > active-section >
stored**.

### 3. Pinned apps: strip, not rows, showing the app's store artwork

`buildDrawerGroups` stops splicing `favoriteItems` into the Quick Access group. The drawer
renders `<PinnedAppsStrip>` between the header and `PortalNav`, above the search field's
section list but below the search field itself. Quick Access keeps Home + Portfolio as rows
(FR-012).

The strip caps at `VISIBLE_PINNED_CAP = 5`. Beyond that a trailing `+N` button expands the
strip in place into a wrapped grid (`flex-wrap`), with the same button flipping to "Show
fewer". Expansion is component-local state — it is a momentary view choice, not a preference
worth persisting. Tiles reuse `PortalNav`'s initial-letter fallback styling (the registry
carries no icon), truncate their visible label, and keep the full name in `aria-label` +
`title` (FR-009, edge case).

Each tile renders `artworkFor(slug)` — the same curated, decorative store illustration the catalog
card shows (spec 077, research R10) — so the favorite's `slug` rides into the nav item alongside its
label. `artworkFor` is total, so an uncurated app gets the generic illustration.

Active marking: `resolveActiveId` already returns `favorite-<id>` for a mounted favorited app;
the strip consumes the same id (FR-010).

### 3b. The Apps group folds into Tools

`RAW_NAV_GROUPS` loses its fourth group; the `{ id: 'apps' }` entry joins Tools (research R9). Tab
ids and routes are unchanged. Two knock-on effects, both intended: the drawer has three sections
instead of four, and `groupForTab('apps')` answers Tools, so the mobile bottom bar shows the Tools
siblings beside the catalog.

### 4. Search

Filter state lives in `AppNavDrawer` (it must reset on open — FR-018 — and the drawer owns the
open/closed lifecycle). A pure `filterNavGroups(groups, query)` helper does the matching so it
is unit-testable without rendering. Sticky positioning via `position: sticky; top: 0` inside the
drawer's existing `overflow-y: auto` column; the header above it is not sticky, so the field
reaches the top edge as the list scrolls (FR-013).

While `query` is non-empty the drawer passes `expanded` as all-true and hides the toggles'
effect — the member asked to see matches, and a match hidden behind a fold is a lie about the
result set (FR-016).

### 5. Density

A single class on the drawer root: `app-nav-drawer--compact`. All compact rules are scoped
under it inside `AppNavDrawer.css`, so the shared `PortalNav.css` stays density-free and the
Admin/My Account rails cannot inherit it (FR-023). Compact reduces row padding `9px 12px →
5px 10px`, icon tile `30px → 26px`, and label `14px → 13px`, which measures ≥36px of row height
against the current ~48px — a ~33% density gain that clears both SC-004 and the 36px floor
(FR-022). The panel is one collapsed `AccordionSection` card on the Settings tab, matching
`HomePreferencesPanel`'s shape: its header states the current density so the tab scans without
opening anything.

## Visual validation

`npm run frontend` serves the app; `scripts/ui/capture-nav-drawer.mjs` drives Chromium
(pre-installed at `/opt/pw-browsers/chromium`) to open the drawer at a 390×844 mobile viewport
and capture: default state, all sections expanded, filter active, compact density, and 8 pinned
apps. Screenshots land in `specs/081-nav-drawer-density/screenshots/`. Playwright is invoked as
a **dev-time script**, not added to the workspace dependency graph, because a new devDependency
here would re-resolve the lockfile and risk the optional-platform-binary trap documented in
spec 075 — the byte gates guard mini-app output and are not worth disturbing for a screenshot.

## Complexity Tracking

> No constitution violations. Section intentionally empty.
