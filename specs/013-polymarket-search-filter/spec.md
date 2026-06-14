# Feature Specification: Polymarket Search & Category Filter

**Feature Branch**: `claude/polymarket-search-filter-z0tu7n`

**Created**: 2026-06-13

**Status**: Draft

**Input**: User description: "the search and filter of polymarket is currently not functioning for users. investigate the implementation and then run /speckit-specify to specify a proper implementation of the search functionality so users will be able to quickly find the matchups they need."

## User Scenarios & Testing *(mandatory)*

The "Linked Polymarket Event" picker lets a user attach a wager to a real
Polymarket market so the wager settles automatically when that market resolves.
The picker appears in the wager-creation flow and in the dashboard feed. Today
its two ways of finding a market — typing a search query and tapping a category
filter — both fail: searches return irrelevant markets and category taps never
change the list. The journeys below restore the picker's core promise: a user
can quickly find the specific matchup they want to wager on.

### User Story 1 - Find a specific market by searching (Priority: P1)

A user knows the matchup they want (e.g. a New York Knicks game) and types a
term into the search box. They expect to see markets whose questions actually
relate to what they typed, ranked so the most relevant appears first, and to
pick one to attach to their wager.

**Why this priority**: Search is the primary way users locate a known matchup.
It is currently broken in the most visible way — typing "knicks" returns
album-release and GTA VI markets — which blocks the core task of linking a
wager. Without this, the picker is unusable for anyone with a specific event in
mind.

**Independent Test**: Type a distinctive term (e.g. "knicks") and confirm every
returned result is plausibly related to that term, that an obviously relevant
event appears near the top, that an event with many sub-markets appears as one
expandable row, and that selecting a sub-market attaches it to the wager.

**Acceptance Scenarios**:

1. **Given** the picker is open with no query, **When** the user types a term
   that matches live markets, **Then** the list updates to show only events
   whose markets relate to that term, most-relevant first.
2. **Given** a search term that matches no live markets, **When** results
   return, **Then** the user sees a clear "no matching markets" empty state
   rather than an unrelated or stale list.
3. **Given** search results are shown, **When** the user clears the search box,
   **Then** the picker returns to the default browse list of top markets.
4. **Given** an event that has many sub-markets (e.g. a game's moneyline,
   spreads, and over/unders), **When** it appears in results, **Then** it is
   shown as a single event row that the user can expand to reveal and select an
   individual sub-market.
5. **Given** the user selects a (sub-)market from the results, **When** they
   continue, **Then** that specific market is linked to the wager and used for
   automatic settlement.

---

### User Story 2 - Narrow the list by category (Priority: P1)

A user without a specific market in mind wants to browse a topic — Sports,
Politics, Crypto, Pop Culture, Business, or Tech. They tap a category and expect
the list to narrow to markets in that category.

**Why this priority**: Category browsing is the primary discovery path for users
exploring what they can wager on. It is currently fully broken — selecting
"Business" and "Pop Culture" both return the identical default political list —
so the filters are decorative. Restoring them is equally critical to search.

**Independent Test**: Tap a category and confirm the result set visibly changes
to markets belonging to that category, and that tapping a different category
produces a different, category-appropriate set.

**Acceptance Scenarios**:

1. **Given** the default browse list is shown, **When** the user selects a
   category, **Then** the list updates to show only markets in that category.
2. **Given** one category is selected, **When** the user selects an additional
   category, **Then** the list updates to the union of markets across all
   selected categories (OR semantics), and deselecting a category narrows the
   list back to the remaining selected categories.
3. **Given** one or more categories are selected, **When** the user clears the
   selection, **Then** the list returns to the default top-markets browse view.
4. **Given** a selected category has no eligible live markets, **When** results
   return, **Then** the user sees a clear empty state for that category.

---

### User Story 3 - Search within a category (Priority: P2)

A user combines both tools: they pick a category and also type a query to search
within it (e.g. Sports + "lakers"), and they can adjust the category without
losing what they typed.

**Why this priority**: Combining the two tools is how users refine large result
sets, but it depends on Stories 1 and 2 working first. A key sub-frustration
today is that toggling a category wipes the typed query, forcing a re-type.

**Independent Test**: Type a query, then toggle a category, and confirm the
query is preserved and results reflect both the query and the category;
confirm removing the category broadens results back to the query alone.

**Acceptance Scenarios**:

1. **Given** the user has typed a search query, **When** they select a category,
   **Then** the typed query is preserved and results reflect both the query and
   the category.
2. **Given** a query and a category are both active, **When** the user removes
   the category, **Then** the query remains and results broaden to all
   categories matching the query.
3. **Given** a query and a category are both active, **When** the user clears the
   query, **Then** the category remains active and the list shows that
   category's browse view.
4. **Given** one or more categories are already selected, **When** the user then
   types a query, **Then** the search is constrained to the selected categories
   by default (results must match both the query and a selected category).

---

### User Story 4 - Trustworthy, responsive results (Priority: P2)

While searching or filtering, the user always understands the picker's state:
results feel responsive, loading and empty states are clear, failures are
recoverable, and every listed market is one they can actually wager on.

**Why this priority**: Trust in the picker depends on it never showing stale,
ineligible, or silently-failed results. This hardens the experience around
Stories 1–3 but is not itself the primary discovery path.

**Independent Test**: Exercise rapid typing, an induced network failure, and an
empty result set, and confirm the picker shows responsive updates, a retry
affordance on failure, and only eligible markets — never a stale list presented
as current.

**Acceptance Scenarios**:

1. **Given** the user is typing quickly, **When** characters change, **Then**
   results update responsively without flicker from superseded requests, and the
   list reflects the latest query.
2. **Given** a results request fails, **When** the error occurs, **Then** the
   user sees a clear error message and a way to retry, not a blank or stale
   list.
3. **Given** results are loading, **When** the request is in flight, **Then** the
   user sees a loading indicator distinct from the empty state.
4. **Given** any market is listed, **When** it is displayed, **Then** it is an
   active, tradeable, unresolved market eligible for wager linking, with the
   information needed to choose it (question, and a useful signal such as
   volume).

---

### Edge Cases

- **Whitespace / very short queries**: Leading/trailing whitespace is ignored;
  the system defines a minimum effective query length and does not fire noisy
  requests for a single stray character.
- **Rapid query changes (race conditions)**: A slow earlier request must never
  overwrite results for a newer query; only the latest query's results are shown.
- **Special characters / emoji in query**: Unusual input must not break the
  picker; it returns a normal result or a normal empty state.
- **No results**: Both empty search results and empty category results show a
  clear, distinct empty state rather than the previous list.
- **Upstream unavailable / rate-limited / timeout**: A recoverable error state
  with retry is shown; the picker never presents stale results as current.
- **Markets missing required data**: Markets lacking the data needed to link or
  display them are excluded so the user never selects an unusable market.
- **Resolved / closed / inactive / already-ended markets**: Never shown, since
  they cannot back a new wager. A market whose end date is in the past (or
  missing/unparseable) is excluded even if the upstream still flags it active.
- **Category with zero eligible markets**: Distinct empty state, with selection
  still adjustable.
- **Query that matches a category name**: Treated as a text search over markets,
  not as an implicit category switch (categories change only via the filters).
- **Event with a single market**: An event that has only one market is shown
  directly (no redundant expand affordance for a single child).
- **Expanded event whose sub-markets become ineligible**: Only eligible
  sub-markets are listed under an event; an event with no eligible sub-markets is
  not shown at all.

## Clarifications

### Session 2026-06-13

- Q: How should the picker present an event that returns many sub-markets (e.g.
  "knicks" → a game's moneyline + several spreads + several over/unders)? → A:
  Group them under a single expandable event row; the user expands to select an
  individual sub-market (not one top-level row per sub-market).
- Q: Should category chips be multi-select or single-select? → A: Multi-select
  with OR semantics (results belong to any selected category).
- Q: When a category is already selected and the user types a query, should
  search be constrained to that category by default? → A: Yes — constrain the
  search to the selected categories by default.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The picker MUST return search results whose market questions are
  relevant to the user's query, ordered most-relevant first. Searching a
  distinctive term MUST NOT return markets unrelated to that term.
- **FR-002**: The picker MUST narrow results to the selected category when a
  category filter is active. Category filters MUST be multi-selectable, combined
  with OR semantics (results belong to ANY selected category), and selecting
  different categories MUST produce correspondingly different result sets.
- **FR-003**: The picker MUST support applying a search query and category
  filters simultaneously, returning only results that satisfy both. When one or
  more categories are already selected and the user types a query, the search
  MUST be constrained to the selected categories by default.
- **FR-004**: Changing the category selection MUST preserve any text the user has
  already typed in the search box.
- **FR-005**: Clearing the search query MUST return to the active category's
  browse view (or the default top-markets view when no category is selected);
  clearing the category selection MUST return to the default top-markets view
  while preserving any active query.
- **FR-006**: The picker MUST display only markets that are active, tradeable,
  unresolved, AND end in the future (eligible to back a new wager); resolved,
  closed, inactive, or already-ended markets MUST be excluded. A market whose
  resolution/end date is missing or unparseable MUST be treated as ineligible.
- **FR-007**: The picker MUST exclude markets that lack the data required to link
  a wager or to render a usable result card, so a user cannot select an unusable
  market.
- **FR-008**: In browse mode (no query), results MUST be ordered by a useful
  popularity signal (e.g. trading volume, highest first); in search mode, results
  MUST be ordered by relevance to the query.
- **FR-009**: The picker MUST update results responsively as the user types,
  consolidating rapid keystrokes so the upstream is not queried on every
  character, while keeping perceived latency low.
- **FR-010**: The picker MUST ensure that results from a superseded request never
  replace results for a newer query or filter selection.
- **FR-011**: The picker MUST present distinct, clear states for loading,
  empty/no-results, and error conditions, and MUST NOT present stale results as
  current.
- **FR-012**: On a failed results request, the picker MUST offer the user a way
  to retry.
- **FR-013**: The category filter set offered to users MUST map to real,
  supported upstream categories so that every offered category returns its
  corresponding markets.
- **FR-014**: Selecting a (sub-)market from any result (search or browse) MUST
  link that specific market to the wager such that the wager settles
  automatically when the market resolves, preserving the existing selection
  behavior.
- **FR-017**: When an event exposes multiple related markets (e.g. a game's
  moneyline, spreads, and over/unders), the picker MUST group them under a single
  event entry that the user can expand to reveal and select an individual
  sub-market, rather than listing every sub-market as a separate top-level
  result. An event with a single market is shown without a redundant expand step.
- **FR-015**: Search and filter behavior MUST be consistent everywhere the picker
  appears (wager-creation flow and dashboard feed).
- **FR-016**: The search and filter behavior MUST be covered by automated tests,
  including relevant-results, multi-category OR narrowing, combined
  query+category (default constraint), query-preservation-on-toggle,
  event grouping/expand and sub-market selection, empty/error states, and
  superseded-request handling.

### Key Entities *(include if feature involves data)*

- **Event (grouped matchup)**: A real-world happening (e.g. a specific game or
  question) that groups one or more related markets. Shown as a single
  expandable row in the picker. Relevant attributes: a human-readable title, its
  category/topic association(s), and its set of eligible child markets. An event
  is surfaced only if it has at least one eligible child market.
- **Market (sub-market)**: A single Polymarket prediction market under an event
  that the user actually links a wager to. Relevant attributes: a human-readable
  question/title, a popularity signal (e.g. trading volume), resolution/active
  status, and the identifiers required to link it for automatic settlement.
- **Search query**: The free-text term the user types to find events/markets by
  their text.
- **Category filter**: A user-selectable topic (e.g. Sports, Politics, Crypto,
  Pop Culture, Business, Tech). Multiple may be selected at once; selected
  categories constrain results with OR semantics.
- **Result set / picker state**: The current list of events (with their
  expandable sub-markets) shown to the user plus its state (browsing vs.
  searching, selected categories, expanded events, loading/empty/error), driven
  by the combination of active query and active category filters.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a distinctive search term that has matching live markets, 100%
  of returned results have questions relevant to the term, and a clearly relevant
  market appears within the top results.
- **SC-002**: Selecting each offered category returns a result set composed of
  markets in that category, and selecting two different categories yields
  measurably different result sets (no longer the identical default list).
- **SC-003**: Users can locate and select a specific known matchup in under 15
  seconds from opening the picker.
- **SC-004**: Results update within roughly one second of the user pausing
  typing, with no flicker from out-of-order responses.
- **SC-005**: 100% of listed markets are eligible to back a new wager (active,
  tradeable, unresolved, ending in the future, and complete enough to link).
- **SC-006**: Empty, loading, and error states are each distinctly presented;
  a failed request always offers a retry and never displays a stale list as
  current.
- **SC-007**: The same search and filter behavior holds in every place the picker
  appears.
- **SC-008**: Automated tests cover the search, filter, combined, state, and
  race-condition behaviors and pass in CI.
- **SC-009**: An event with many related sub-markets (e.g. a single game's
  moneyline/spreads/over-unders) occupies a single result row that expands to its
  sub-markets, rather than flooding the list with one row per sub-market.

## Assumptions

- The upstream prediction-market data source (Polymarket's public market data)
  remains the single source of markets; no new oracle or data provider is
  introduced by this feature.
- The current breakage stems from the integration requesting markets in a way the
  upstream does not honor (free-text search and category parameters that are
  ignored). Choosing the correct upstream query mechanism is an implementation
  concern for the plan; this spec only requires that the resulting behavior be
  correct.
- The user-facing category set (Sports, Politics, Crypto, Pop Culture, Business,
  Tech) is retained, but each category must be mapped to a real upstream topic so
  it actually filters. Adjusting category labels to match available upstream
  topics is acceptable if needed to make filtering work.
- Scope is limited to the frontend search/filter experience and the layer that
  fetches market data for the picker. On-chain settlement logic and adding new
  oracle sources are out of scope.
- Personalization signals already used to rank browse results (saved category
  preferences, history) may be retained as a ranking refinement but MUST NOT
  override query relevance in search mode.
- "Active, tradeable, unresolved" is defined by the upstream market status fields
  already available for each market.
