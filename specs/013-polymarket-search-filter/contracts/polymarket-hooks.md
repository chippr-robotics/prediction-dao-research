# Internal Contract: Picker Hooks & Component

UI contracts for the data hooks and the `PolymarketBrowser` component — the
surface tests target and that the two call sites (`FriendMarketsModal` inline,
`Dashboard` feed) rely on. Backward compatibility with existing call-site props
is required (FR-015). Both hooks now return **`NormalizedEvent[]`** (events with
nested eligible markets) — see data-model.md.

---

## Hook: `usePolymarketSearch({ limit, categories })`

Searches events by free text, optionally constrained to categories.

**Inputs**:
- `limit?: number` — max events.
- `categories?: string[]` — selected category **slugs**; when non-empty, results
  are constrained to events tagged with those categories, OR semantics
  (Decision 6). *(Additive input; omitting it preserves global search.)*

**Returns**:
- `results: NormalizedEvent[]` — surfaceable, relevance-ordered events.
- `isLoading: boolean`, `error: string|null`, `lastQuery: string`.
- `search(query): void` — debounced entry point.
- `runSearch(query): Promise<void>` — immediate (retry/tests).
- `clear(): void`.

**Behavioral contract**:
- Uses `GET /public-search?q=…` (C1); blank/whitespace query → clears results,
  fires no request.
- Normalizes to events with only surfaceable children, drops empty events (C3,
  C8); when `categories` non-empty, applies the tag intersection (C4).
- Single in-flight `AbortController`; superseded requests aborted and discarded
  (C6). Errors set `error` and clear `results`; aborts silent (C7).

---

## Hook: `usePolymarketTopMarkets({ categories, limit })`

Browse top events, optionally by category. (Name retained for call-site
compatibility; now returns events.)

**Inputs**: `categories?: string[]` (slugs), `limit?: number`.

**Returns**: `{ results: NormalizedEvent[], isLoading, error, refresh }`.

**Behavioral contract**:
- No categories → `GET /events?…order=volume&ascending=false` (top events).
- One category → `GET /events?tag_id=<numeric>…` (C2).
- Multiple categories → parallel per-`tag_id` requests merged + de-duped by event
  `id`, re-sorted by volume, capped at `limit` (C5, OR).
- Per-market surfaceable filter + drop empty events (C3); abort on
  unmount/refresh.

---

## Helper: `resolveCategoryTagId(slug): string`

Maps a chip slug to a numeric `tag_id` via the verified seed map (memoized);
falls back to `GET /tags/slug/{slug}` only if unseeded. Synchronous for seeded
slugs so tests need no network.

---

## Component: `PolymarketBrowser` (props unchanged)

`{ onSelectMarket, variant, defaultCategories, limit, showFilters,
selectedConditionId, className }` — same signature as today.

**Behavioral contract (the fixes)**:
- Passes `activeCategories` into **both** hooks (today only the browse hook).
- **Multi-select OR** chips: toggling adds/removes a slug; `Clear` resets;
  toggling does **not** clear the query (remove `if (trimmedQuery) setQuery('')`)
  (FR-002, FR-004).
- With categories active, typing constrains search to them by default (FR-003).
- Exactly **one** debounce drives search (~300–350ms); the hook-level second
  debounce is removed (FR-009).
- Mode: `trimmedQuery` non-empty → search; else → browse.
- **Event-grouped rendering** (FR-017, Decision 10): one row per
  `NormalizedEvent`. An event with >1 eligible market renders an expand toggle
  (`aria-expanded`); expanding lists child markets (label = `market.label`,
  i.e. `groupItemTitle`) each selectable. An event with exactly one market
  selects that market directly on row click (no expand). `expandedEventIds`
  tracks open rows.
- Renders exactly one of: loading (skeletons, `aria-busy`), error
  (`role="alert"` + Retry), empty (distinct copy for search-empty vs
  category-empty vs no-markets), or the event list (FR-011/012).
- Events keyed by `id`; child markets keyed by `conditionId`. Selecting a child
  calls `onSelectMarket(market)` (FR-014); `selectedConditionId` highlights the
  matching child.
- Accessibility preserved/extended: labeled search input, `role="group"` filter
  set, `aria-pressed` chips, expand toggle with `aria-expanded`, keyboard-
  navigable sub-markets, `role="alert"` error, `aria-busy` loading; vitest-axe
  assertion guards it.

---

## Component test obligations (Vitest + @testing-library/react)

- **T1 (US1)**: typing a term shows only relevant events; an obviously relevant
  event is near the top; mock asserts `/public-search?q=` was called.
- **T2 (US2)**: selecting a category narrows results; selecting a second category
  shows the union (OR); mock asserts a `tag_id` request per selected category.
- **T3 (US3)**: with a query active, toggling a category preserves the typed
  query and constrains results; removing the category broadens back; selecting a
  category first then typing also constrains (default).
- **T4 (US4)**: loading, empty (search vs category), and error states render
  distinctly; Retry re-issues the correct request; no stale list on error.
- **T5**: superseded request never overwrites newer results (race).
- **T6**: only surfaceable child markets render; events with no eligible children
  are dropped.
- **T7 (US1/FR-017)**: a multi-sub-market event renders as one expandable row;
  expanding reveals children; selecting a child emits its `conditionId`. A
  single-market event selects directly without an expand step.
- **T8 (a11y)**: vitest-axe finds no violations across the picker's main states
  (collapsed list, expanded event, empty, error).
