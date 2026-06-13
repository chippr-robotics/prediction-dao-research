# Internal Contract: Picker Hooks & Component

The UI contracts for the data hooks and the `PolymarketBrowser` component. These
define the surface that tests target and that the two call sites
(`FriendMarketsModal` inline, `Dashboard` feed) rely on. Backward compatibility
with existing call-site props is required (FR-015).

---

## Hook: `usePolymarketSearch({ limit, categories })`

Searches markets by free text, optionally constrained to categories.

**Inputs**:
- `limit?: number` — max results (default as today).
- `categories?: string[]` — selected category **slugs**; when non-empty, results
  are constrained to events tagged with those categories (Decision 4). *(New
  input — additive; omitting it preserves global search.)*

**Returns** (unchanged keys; behavior corrected):
- `results: NormalizedMarket[]` — surfaceable, relevance-ordered.
- `isLoading: boolean`, `error: string|null`, `lastQuery: string`.
- `search(query): void` — debounced entry point.
- `runSearch(query): Promise<void>` — immediate (used by retry/tests).
- `clear(): void`.

**Behavioral contract**:
- Uses `GET /public-search?q=…` (contract C1); blank/whitespace query → clears
  results, fires no request.
- Applies the surfaceable filter (C3) and, when `categories` non-empty, the tag
  intersection (C4).
- Single in-flight `AbortController`; superseded requests are aborted and
  discarded (C6). Errors set `error` and clear `results`; aborts are silent (C7).

---

## Hook: `usePolymarketTopMarkets({ categories, limit })`

Browse top markets, optionally by category.

**Inputs**:
- `categories?: string[]` — category **slugs**.
- `limit?: number`.

**Returns**: `{ results, isLoading, error, refresh }` (unchanged).

**Behavioral contract**:
- No categories → `GET /markets?…order=volume&ascending=false` (top markets).
- One category → `GET /markets?tag_id=<numeric>…` (C2).
- Multiple categories → parallel per-`tag_id` requests merged + de-duped by
  `conditionId`, re-sorted by volume, capped at `limit` (C5).
- Surfaceable filter applied (C3); abort on unmount/refresh.

---

## Helper: `resolveCategoryTagId(slug): string`

Maps a chip slug to a numeric `tag_id` using the verified seed map, memoized;
falls back to `GET /tags/slug/{slug}` only if unseeded. Pure/synchronous for
seeded slugs so tests need no network.

---

## Component: `PolymarketBrowser` (props unchanged)

`{ onSelectMarket, variant, defaultCategories, limit, showFilters,
selectedConditionId, className }` — same signature as today.

**Behavioral contract (the fixes)**:
- Passes `activeCategories` into **both** `usePolymarketTopMarkets` and
  `usePolymarketSearch` (today only the former).
- Toggling a category **does not clear** the query (remove the
  `if (trimmedQuery) setQuery('')` line); query is preserved (FR-004).
- Exactly **one** debounce drives search (~300–350ms); the hook-level second
  debounce is removed (FR-009). No double-fire.
- Mode selection: `trimmedQuery` non-empty → search results; else → browse.
- Renders exactly one of: loading (skeletons, `aria-busy`), error
  (`role="alert"` + Retry), empty (distinct copy for search-empty vs
  category-empty vs no-markets), or the results list (FR-011/012).
- Results keyed by `conditionId`; selecting calls `onSelectMarket(market)`
  (FR-014). `selectedConditionId` still marks the active card.
- Accessibility preserved: labeled search input, `role="group"` filter set,
  `aria-pressed` chips, `role="alert"` error, `aria-busy` loading; a vitest-axe
  assertion guards it.

---

## Component test obligations (Vitest + @testing-library/react)

- **T1 (US1)**: typing a term shows only relevant markets; an obviously relevant
  market is near the top; mock asserts `/public-search?q=` was called.
- **T2 (US2)**: selecting a category narrows results; selecting a different
  category changes the set; mock asserts distinct `tag_id` requests.
- **T3 (US3)**: with a query active, toggling a category preserves the typed
  query and constrains results; removing the category broadens back to the query.
- **T4 (US4)**: loading, empty (search vs category), and error states each render
  distinctly; Retry re-issues the correct request; no stale list on error.
- **T5**: superseded request never overwrites newer results (race).
- **T6**: only surfaceable markets render (closed/condition-less dropped).
- **T7 (a11y)**: vitest-axe finds no violations in the picker's main states.
