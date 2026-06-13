# Phase 0 Research: Polymarket Search & Category Filter

All findings below were verified against the live Gamma API
(`https://gamma-api.polymarket.com`, unauthenticated) on 2026-06-13, in addition
to Polymarket's developer documentation. They resolve every "NEEDS
CLARIFICATION" implied by the spec's Assumptions (the correct upstream query
mechanism).

## Decision 1 — Free-text search uses `/public-search?q=`, not `/markets?search=`

**Decision**: Perform keyword search against
`GET /public-search?q=<term>&limit_per_type=<N>`.

**Evidence**:
- `GET /markets?search=knicks` (current code) ignores the `search` param and
  returns a default/volume-ordered set — this is the exact production bug
  (searching "knicks" returned album/GTA-VI markets).
- `GET /public-search?q=knicks&limit_per_type=5` returned only Knicks markets
  ("Pacers vs. Knicks", "Spread: Knicks (-4.5)", "Pacers vs Knicks: O/U 224.5",
  …) — relevance-ranked and correct.
- The param name is **`q`** (a request with `query=` returned
  `validation error … query argument "q": empty`).

**Response shape**: `{ "events": [ … ], "pagination": { … } }`. Each event
carries a `tags` array (category membership) and a nested `markets` array. Each
market object includes the fields the picker needs: `conditionId`, `question`,
`active`, `closed`, `volume`, `endDate`, `outcomes`, `outcomePrices`, `slug`,
`image`/`icon`. Markets to surface are obtained by **flattening
`event.markets`** across returned events.

**Rationale**: It is the only endpoint that honors free-text relevance search,
and it returns the same market fields already consumed by `normaliseGammaMarket`,
so normalization is reusable.

**Alternatives considered**:
- `/markets?search=` — rejected: param unsupported (the bug).
- Client-side substring filtering over a generic `/markets` pull — rejected:
  cannot reproduce upstream relevance ranking, would miss markets outside the
  fetched page, and wastes the rate budget.

## Decision 2 — Category filtering uses numeric `tag_id`, not `tag_slug`

**Decision**: Browse markets via
`GET /markets?tag_id=<numeric>&active=true&closed=false&order=volume&ascending=false&limit=<N>`.

**Evidence**:
- The current `tag_slug=` param is unsupported and silently ignored — selecting
  "Business" vs "Pop Culture" returned the identical default list (the bug).
- `GET /markets?tag_id=2&active=true&closed=false&order=volume&ascending=false`
  returned real markets with `conditionId`s, confirming `/markets` accepts
  `tag_id`.

**Rationale**: `tag_id` is the documented, working filter parameter for both
`/markets` and `/events`; `/markets` returns flat, condition-bearing markets that
map directly to the picker's needs.

**Alternatives considered**:
- `/events?tag_id=…` then flatten — viable and equivalent; `/markets` chosen for
  a flatter response and to preserve the existing browse code path. (Either is
  acceptable at implementation time; the contract documents `/markets`.)

## Decision 3 — Map the six category labels to real numeric tag IDs via `/tags/slug/{slug}`

**Decision**: Resolve each user-facing category slug to its numeric `tag_id`
using `GET /tags/slug/{slug}`, cached in module scope (slugs/IDs are stable).
Verified mapping:

| Chip label   | slug          | tag_id |
|--------------|---------------|--------|
| Politics     | `politics`    | `2`    |
| Sports       | `sports`      | `1`    |
| Crypto       | `crypto`      | `21`   |
| Pop Culture  | `pop-culture` | `596`  |
| Business     | `business`    | `107`  |
| Tech         | `tech`        | `1401` |

**Evidence**: each `GET /tags/slug/<slug>` returned a `Tag` object with the IDs
above (e.g. `pop-culture` → `{ id: "596", label: "Culture", slug: "pop-culture" }`).

**Rationale**: A resolver keeps the chip definitions human-readable while sending
the API the numeric IDs it requires. Resolving via `/tags/slug` (rather than
hardcoding) self-heals if an ID ever changes; the verified IDs above serve as a
safe fallback/seed and let tests assert exact request URLs without a network
round-trip.

**Alternatives considered**:
- Hardcode IDs only — acceptable but brittle if Polymarket renumbers; keep them
  as a seed/fallback alongside the resolver.
- Pull the full `/tags` list and match — rejected: the default list is paginated
  to 100 granular tags and does not surface the top-level categories;
  `/tags/slug/{slug}` is the direct lookup.

## Decision 4 — "Search within a category" filters search results by tag membership

**Decision**: When both a query and one or more categories are active, call
`/public-search?q=…`, then keep only events whose `tags` include a selected
`tag_id`, and surface those events' markets. (OR semantics across multiple
selected categories.)

**Rationale**: `/public-search` results include per-event `tags`, so the
category constraint can be applied client-side on a small result set —
deterministic, no extra request, and robust regardless of whether the search
endpoint accepts a server-side tag filter. Categories live at the **event**
level, which is the correct granularity for these markets.

**Alternatives considered**:
- A server-side tag param on `/public-search` — not relied upon (undocumented/
  unverified); client-side filter of the returned `tags` is simpler and certain.

## Decision 5 — Multi-category browse = parallel `tag_id` requests merged by `conditionId`

**Decision**: For browse mode with N selected categories, issue one
`/markets?tag_id=<id>…` request per category in parallel, then merge and
de-duplicate by `conditionId`, re-sort by volume, and cap at `limit`.

**Rationale**: Guarantees correct OR semantics across categories without
depending on undocumented repeated-param behavior. N is at most 6 and requests
are abortable; the rate budget (~350/10s) easily covers it. With a single
selected category it degenerates to one request.

**Alternatives considered**:
- Repeated `tag_id=` params in one URL — behavior across Gamma versions is
  unverified; rejected for determinism.

## Decision 6 — Eligibility filter: active, not closed, condition-bearing

**Decision**: After normalization, surface only markets where `active === true`,
`closed !== true`, and `conditionId` is present (FR-006, FR-007). Apply this
uniformly to both search and browse results. (`/public-search` can return closed
markets even for live queries — observed `closed: true` items — so the
client-side guard is required, not just the `active/closed` query params.)

**Rationale**: Only such markets can back a new wager; this prevents selecting an
unusable/resolved market.

## Decision 7 — Single debounce; abort/supersession safety

**Decision**: Drive search from one debounce (~300–350ms) instead of the current
two stacked timers (component 350ms + hook 400ms ≈ 750ms). Keep a single
`AbortController` per in-flight request and ignore results once superseded so a
slow earlier response can never overwrite a newer query/filter (FR-009, FR-010).

**Rationale**: Removes perceived lag and the out-of-order overwrite class of bug
while respecting the rate limit.

**Alternatives considered**:
- Keep both debounces — rejected (sluggish, redundant).

## Decision 8 — Ranking & personalization

**Decision**: Browse mode orders by volume (desc). Search mode preserves the
upstream relevance order; existing saved-preference / history "boosts" may apply
only as a minor tie-breaker and MUST NOT reorder above relevance (spec
Assumptions). Eligibility filtering happens before ranking.

**Rationale**: Honors FR-008 (relevance for search, popularity for browse) while
retaining the existing personalization nicety in a non-destructive way.

## Decision 9 — Testing approach (no new deps)

**Decision**: Use the repo's existing stack — Vitest 4, @testing-library/react,
jsdom, vitest-axe — and mock `fetch` via `vi.stubGlobal('fetch', …)` returning
canned Gamma payloads (the bug's "knicks→GTA VI" case, a per-category fixture,
a closed/ineligible market, an error, and an abort/supersession scenario). No
MSW or other new dependency is introduced.

**Rationale**: Matches established patterns (`ipfsService.test.js`,
`usePriceConversion.test.js`), keeps CI fast, and satisfies Principle II.

## Sources

- [Gamma Markets API overview](https://docs.polymarket.com/developers/gamma-markets-api/overview)
- [Fetching Markets guide](https://docs.polymarket.com/developers/gamma-markets-api/fetch-markets-guide)
- [Polymarket agent-skills: market-data](https://github.com/Polymarket/agent-skills/blob/main/market-data.md)
- [AgentBets: Polymarket Gamma API guide (2026)](https://agentbets.ai/guides/polymarket-gamma-api-guide/)
- Live API verification: `/public-search?q=`, `/markets?tag_id=`, `/tags/slug/{slug}` (2026-06-13)
