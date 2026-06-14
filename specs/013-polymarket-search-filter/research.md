# Phase 0 Research: Polymarket Search & Category Filter

All findings below were verified against the live Gamma API
(`https://gamma-api.polymarket.com`, unauthenticated) on 2026-06-13, in addition
to Polymarket's developer documentation. They resolve every "NEEDS
CLARIFICATION" implied by the spec's Assumptions (the correct upstream query
mechanism) and incorporate the 2026-06-13 spec clarifications (event grouping,
multi-select OR categories, search constrained to the active category).

## Decision 1 — Free-text search uses `/public-search?q=`, returned as events

**Decision**: Perform keyword search against
`GET /public-search?q=<term>&limit_per_type=<N>` and consume the **events** it
returns (each with nested markets).

**Evidence**:
- `GET /markets?search=knicks` (current code) ignores the `search` param and
  returns a default/volume-ordered set — this is the exact production bug
  (searching "knicks" returned album/GTA-VI markets).
- `GET /public-search?q=knicks&limit_per_type=5` returned only Knicks markets
  ("Pacers vs. Knicks", "Spread: Knicks (-4.5)", "Pacers vs Knicks: O/U 224.5",
  …) — relevance-ranked and correct.
- The param name is **`q`** (a request with `query=` returned
  `validation error … query argument "q": empty`).
- Response shape is `{ "events": Event[], "pagination": {…} }`. Each `Event`
  carries `tags: Tag[]` and a nested `markets: Market[]`; each `Market` includes
  `conditionId`, `question`, `active`, `closed`, `volume`, `endDate`, `outcomes`,
  `outcomePrices`, `slug`, `image`/`icon`, `groupItemTitle`.

**Rationale**: It is the only endpoint that honors free-text relevance search,
and it returns events-with-nested-markets — exactly the grouping the picker now
needs (Decision 10).

**Alternatives considered**:
- `/markets?search=` — rejected: param unsupported (the bug).
- Client-side substring filtering over a generic `/markets` pull — rejected:
  cannot reproduce upstream relevance ranking, misses markets outside the page,
  and wastes the rate budget.

## Decision 2 — Category browse uses `/events?tag_id=` (events with nested markets)

**Decision**: Browse via
`GET /events?tag_id=<numeric>&active=true&closed=false&order=volume&ascending=false&limit=<N>`,
and the default (no category) top list via the same endpoint without `tag_id`.

**Evidence**:
- The current `tag_slug=` param is unsupported and silently ignored — selecting
  "Business" vs "Pop Culture" returned the identical default list (the bug).
- `GET /events?tag_id=1&active=true&closed=false&order=volume&ascending=false`
  returned a list of events (e.g. "World Cup Winner") each with event-level
  `tags`, `volume`/`volume24hr`, and a nested `markets[]` (e.g. "Will Spain win
  the 2026 FIFA World Cup?" with its own `conditionId`, `volume`,
  `groupItemTitle`). `order=volume` is honored on `/events`.

**Rationale**: Switching browse from `/markets` to `/events` makes browse return
the **same event-grouped shape** as search, so one normalizer and one grouped
render path serve both modes (consistency, less code). `/markets` returns flat
markets with no parent-event handle, which would make grouping browse results
impossible without extra calls.

**Alternatives considered**:
- `/markets?tag_id=…` (the previous plan) — rejected now that results must be
  grouped by event: flat markets cannot be regrouped reliably client-side.

## Decision 3 — Map the six category labels to real numeric tag IDs via `/tags/slug/{slug}`

**Decision**: Resolve each user-facing category slug to its numeric `tag_id`
using `GET /tags/slug/{slug}`, seeded with the verified values below and memoized
in module scope (slugs/IDs are stable).

| Chip label   | slug          | tag_id |
|--------------|---------------|--------|
| Politics     | `politics`    | `2`    |
| Sports       | `sports`      | `1`    |
| Crypto       | `crypto`      | `21`   |
| Pop Culture  | `pop-culture` | `596`  |
| Business     | `business`    | `107`  |
| Tech         | `tech`        | `1401` |

**Evidence**: each `GET /tags/slug/<slug>` returned a `Tag` with the IDs above
(e.g. `pop-culture` → `{ id: "596", label: "Culture", slug: "pop-culture" }`).

**Rationale**: A resolver keeps chip definitions human-readable while sending the
numeric IDs the API requires; the verified seed map keeps tests hermetic and
avoids a network round-trip.

**Alternatives considered**: hardcode-only (brittle) or scan full `/tags`
(paginated to 100 granular tags; top-level categories not surfaced) — both
rejected in favor of seed + `/tags/slug` fallback.

## Decision 4 — Multi-select categories with OR semantics

**Decision**: Category chips are multi-select. Selected categories are combined
with OR: a result qualifies if it belongs to **any** selected category
(clarification 2026-06-13).

**Implementation**: browse issues one `/events?tag_id=<id>…` request per selected
category in parallel, then merges and de-duplicates events by event `id`,
re-sorts by volume, and caps at `limit` (Decision 5). With a single category it
degenerates to one request; with none it is the default top-events query.

**Rationale**: Matches the existing component and the saved-preferences array
(`polymarketCategories`), and is the more powerful UX. OR is the intuitive
meaning of "show me Sports or Crypto."

## Decision 5 — Multi-category merge by event id

**Decision**: For N selected categories, fan out N parallel requests and merge by
event `id` (dedupe), re-rank by volume, cap at `limit`.

**Rationale**: Guarantees correct OR semantics without relying on undocumented
repeated-`tag_id` behavior. N ≤ 6, requests are abortable, and the rate budget
(~350/10s) easily covers it.

## Decision 6 — Search constrained to active categories by default

**Decision**: When one or more categories are selected and a query is present,
call `/public-search?q=…`, then keep only events whose `tags[].id` intersects the
selected `tag_id`s (OR across selected categories), and surface those events
(clarification 2026-06-13). With no category selected, search is global.

**Rationale**: `/public-search` events carry `tags`, so the category constraint
is a deterministic client-side filter on a small result set — no extra request,
and it honors the visible active chip (FR-003).

**Alternatives considered**: a server-side tag param on `/public-search` —
unverified/undocumented; client-side `tags` filter is simpler and certain.

## Decision 7 — Eligibility filter: active, not closed, condition-bearing (per sub-market)

**Decision**: Within each event, keep only markets where `active === true`,
`closed !== true`, and `conditionId` is present (FR-006, FR-007). An **event is
surfaced only if it has ≥1 eligible market**; events with zero eligible markets
are dropped entirely.

**Rationale**: Only such markets can back a new wager (`/public-search` and
`/events` can include closed markets even for live queries, so the client-side
guard is required). Dropping empty events prevents dead expandable rows.

## Decision 8 — Single debounce; abort/supersession safety

**Decision**: Drive search from one debounce (~300–350ms) instead of the current
two stacked timers (≈750ms). Keep a single `AbortController` per in-flight
request and discard superseded results so a slow earlier response can never
overwrite a newer query/filter (FR-009, FR-010).

**Rationale**: Removes perceived lag and the out-of-order overwrite bug class
while respecting the rate limit.

## Decision 9 — Ranking & personalization

**Decision**: Browse orders **events** by volume (desc). Search preserves the
upstream relevance order of events; existing saved-preference/history "boosts"
apply only as a minor tie-breaker and MUST NOT reorder above relevance (spec
Assumptions). Within an expanded event, sub-markets are ordered by volume desc.
Eligibility filtering happens before ranking.

**Rationale**: Honors FR-008 (relevance for search, popularity for browse) and
keeps the existing personalization nicety non-destructively.

## Decision 10 — Event grouping & expandable rows

**Decision**: Normalize both search and browse responses into a list of
**NormalizedEvent** objects, each holding its eligible **NormalizedMarket**
children. The picker renders one row per event; an event with >1 eligible market
is expandable to reveal and select a child sub-market (using `groupItemTitle` as
the child label where present). An event with exactly one eligible market is
shown directly and selecting the row selects that market (no redundant expand)
— clarification 2026-06-13, FR-017.

**Rationale**: A single game can expose 60+ sub-markets (verified: World Cup
event had 60 markets); flattening floods the list and buries the matchup.
Grouping makes "find the matchup" fast while still letting the user pick the
exact sub-market that backs the wager. The data already arrives grouped from both
endpoints (Decisions 1, 2), so grouping is normalization, not extra fetching.

**Selection contract**: selecting any (sub-)market emits the existing
`onSelectMarket(market)` with that market's `conditionId` — the downstream
linked-market form is unchanged (FR-014).

**Accessibility**: the expand control is a real toggle button with
`aria-expanded`; the sub-market list is keyboard-navigable; existing input/group/
chip/alert/busy roles are preserved (Constitution V, vitest-axe).

## Decision 11 — Testing approach (no new deps)

**Decision**: Use the repo's existing stack — Vitest 4, @testing-library/react,
jsdom, vitest-axe — and mock `fetch` via `vi.stubGlobal('fetch', …)` returning
canned Gamma payloads: the bug's "knicks→GTA VI" regression case, an event with
many sub-markets (grouping/expand), a per-category `/events?tag_id` fixture, a
multi-category merge case, a closed/ineligible sub-market, a query+category
constraint case, an error, and an abort/supersession scenario. No MSW.

**Rationale**: Matches established patterns (`ipfsService.test.js`,
`usePriceConversion.test.js`), keeps CI fast, and satisfies Principle II.

## Sources

- [Gamma Markets API overview](https://docs.polymarket.com/developers/gamma-markets-api/overview)
- [Fetching Markets guide](https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide)
- [Polymarket agent-skills: market-data](https://github.com/Polymarket/agent-skills/blob/main/market-data.md)
- [AgentBets: Polymarket Gamma API guide (2026)](https://agentbets.ai/guides/polymarket-gamma-api-guide/)
- Live API verification: `/public-search?q=`, `/events?tag_id=`, `/tags/slug/{slug}` (2026-06-13)
