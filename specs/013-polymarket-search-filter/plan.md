# Implementation Plan: Polymarket Search & Category Filter

**Branch**: `claude/polymarket-search-filter-z0tu7n` | **Date**: 2026-06-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-polymarket-search-filter/spec.md`

## Summary

The "Linked Polymarket Event" picker's search and category filters are broken
because the integration calls the Gamma API with parameters it ignores:
free-text search is sent to `/markets?search=` (unsupported — the endpoint
returns a default set regardless), and category filtering uses `tag_slug=`
(unsupported — also ignored). The fix re-points the data layer at the correct
Gamma endpoints — `/public-search?q=<term>` for relevance-ranked search and
`/markets?tag_id=<numeric id>` for category browse — maps the six user-facing
category labels to their real numeric tag IDs, threads the active category into
search so users can search within a category, preserves the typed query when
toggling filters, collapses the double debounce into one, and adds the missing
Vitest coverage. Scope is the frontend picker (`PolymarketBrowser`) and its data
hooks (`usePolymarketSearch.js`); no contract, on-chain, or new-oracle changes.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 function components + hooks

**Primary Dependencies**: React, Vite 7, wagmi 3 (`useChainId`); data via the
public Polymarket Gamma REST API (`https://gamma-api.polymarket.com`, no auth)
reached with the browser `fetch` + `AbortController`

**Storage**: None server-side. Client-only state (React `useState`/`useMemo`);
existing user preferences (saved categories) via `useUserPreferences`; an
in-memory (module-scoped) cache for the category-slug→tag_id map

**Testing**: Vitest 4 + @testing-library/react + jsdom; accessibility via
vitest-axe; `fetch` mocked with `vi.stubGlobal` (no MSW in this repo). Setup at
`frontend/src/test/setup.js`

**Target Platform**: Modern evergreen browsers (mobile + desktop web app served
at fairwins.app/app)

**Project Type**: Web application — frontend feature within an existing
React + Vite app (`frontend/`)

**Performance Goals**: Results update within ~1s of the user pausing typing
(single debounce ≈ 300–350ms + network); no flicker from out-of-order responses;
no perceptible jank on the picker's result list

**Constraints**: Gamma API is unauthenticated and rate-limited (the
`/public-search` family is ~350 req / 10s); requests MUST be debounced and
aborted on supersession. Only active, non-closed, condition-bearing markets may
be shown (eligible to back a wager). WCAG 2.1 AA per constitution Principle V.
Network config (Gamma base URL) comes from `config/networks.js`, never hardcoded
in components

**Scale/Scope**: Two call sites (wager-creation modal `inline` variant and
dashboard `feed` variant); one component + one hooks module changed; ~10–12
results per query; six category chips

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Security-First Smart Contracts**: N/A — no `contracts/` changes. No
  on-chain, fund-custody, access-control, or oracle-resolution code is touched.
  The selected `conditionId` continues to flow into the existing, unchanged
  linked-market form. ✅ PASS
- **II. Test-First & Comprehensive Coverage**: This feature is currently
  untested. The plan mandates Vitest unit tests for the data hooks (correct
  endpoints/params, normalization, eligibility filtering, abort/supersession,
  error states) and component tests for the picker (relevant results, category
  narrowing, combined query+category, query-preserved-on-toggle, empty/loading/
  error states). Tests are written alongside the behavior and must pass in CI.
  ✅ PASS (enforced by FR-016 and Phase 1 contracts)
- **III. Honest State, No Mocks in Shipped Paths**: The fix replaces a silently
  wrong integration with one that reflects real upstream data. No mock/stub data
  in production paths; mocks live only in Vitest. Only genuinely
  active/tradeable/unresolved markets are surfaced (no implied finality). Gamma
  base URL stays network-scoped via `config/networks.js`. ✅ PASS
- **IV. Fail Loudly in CI**: No `continue-on-error` added; new tests and lint run
  in the existing frontend CI jobs and must pass. ✅ PASS
- **V. Accessible, Consistent Frontend**: Existing ARIA roles on the picker
  (search input label, `role="group"` filters, `aria-pressed` chips,
  `role="alert"` errors, `aria-busy` loading) are preserved and extended to new
  states; a vitest-axe check is added. ESLint must stay clean. Same behavior
  across both call sites (FR-015). ✅ PASS

**Result**: PASS — no violations, Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/013-polymarket-search-filter/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output — Gamma API decisions
├── data-model.md        # Phase 1 output — picker/market entities & state
├── quickstart.md        # Phase 1 output — manual + automated validation guide
├── contracts/
│   ├── gamma-api.md     # External: Gamma endpoints/params this feature relies on
│   └── polymarket-hooks.md  # Internal: hook + component interface contracts
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /speckit-specify)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
frontend/
├── src/
│   ├── components/
│   │   └── fairwins/
│   │       ├── PolymarketBrowser.jsx      # MODIFY — query/filter wiring, debounce,
│   │       │                              #   pass category into search, preserve query
│   │       ├── PolymarketBrowser.css      # (unchanged unless new state needs styling)
│   │       ├── FriendMarketsModal.jsx     # call site (inline) — no API change expected
│   │       └── Dashboard.jsx              # call site (feed) — no API change expected
│   ├── hooks/
│   │   └── usePolymarketSearch.js         # MODIFY — /public-search?q, tag_id mapping,
│   │                                      #   eligibility filter, category-aware search,
│   │                                      #   slug→tag_id resolver/cache
│   ├── config/
│   │   └── networks.js                    # READ — Gamma base URL (already present)
│   └── test/
│       ├── usePolymarketSearch.test.js    # NEW — hook unit tests
│       ├── usePolymarketTopMarkets.test.js# NEW — browse hook unit tests
│       └── PolymarketBrowser.test.jsx     # NEW — component search/filter tests
```

**Structure Decision**: Existing web-app layout under `frontend/src`. The change
is localized to one component and one hooks module, with new sibling test files
under `frontend/src/test/` (the repo's established Vitest location). No new
directories, packages, or services are introduced (YAGNI per Principle/Workflow
§4).

## Complexity Tracking

> No constitution violations — section intentionally empty.
