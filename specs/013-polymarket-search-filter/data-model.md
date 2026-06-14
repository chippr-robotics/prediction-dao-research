# Phase 1 Data Model: Polymarket Search & Category Filter

This feature has no persistent storage. The "data model" is the set of in-memory
shapes that flow through the picker: the normalized **event** (grouping its
markets), the normalized **market** (sub-market), the category definition, and
the derived picker state. Field names match the existing `normaliseGammaMarket`
output where possible to keep changes minimal.

## Entity: NormalizedEvent

A real-world happening (game/question) grouping one or more eligible markets.
One row in the picker. Produced from a Gamma `Event` (from `/public-search` or
`/events`).

| Field      | Type                | Source (Gamma event)        | Notes |
|------------|---------------------|-----------------------------|-------|
| `id`       | string              | `id`                        | grouping/dedup identity; React key |
| `title`    | string              | `title`                     | row heading |
| `slug`     | string\|null        | `slug`                      | |
| `tagIds`   | string[]            | `tags[].id`                 | category membership (search constraint) |
| `category` | string\|null        | first `tags[].label`        | display chip |
| `volume`   | number\|null        | `volume`                    | browse sort key |
| `image`    | string\|null        | `image`/`icon`              | |
| `markets`  | NormalizedMarket[]  | eligible `markets[]`        | ≥1 required to surface |

**Validation / surface rule** (Decision 7, 10): an event is **surfaceable** iff
it has ≥1 surfaceable `NormalizedMarket`. Non-surfaceable events are dropped.

**Identity**: `id` (used for multi-category merge dedup and as the React key).

## Entity: NormalizedMarket (sub-market)

A single market under an event — what the user actually links a wager to.
Produced by `normaliseGammaMarket` (reused).

| Field         | Type            | Source (Gamma market)                  | Notes |
|---------------|-----------------|----------------------------------------|-------|
| `id`          | string\|null    | `id` / `marketId`                      | |
| `slug`        | string\|null    | `slug`                                 | |
| `question`    | string          | `question` / `title` / `name`          | sub-market label |
| `label`       | string          | `groupItemTitle` \|\| `question`       | short label when expanded (e.g. "Spain") |
| `description` | string          | `description`                          | |
| `conditionId` | string (bytes32)\|null | `conditionId` / `condition_id`    | **required** to link |
| `endDate`     | string\|null    | `endDate` / `end_date_iso`             | |
| `volume`      | number\|null    | `volume`                               | sub-market sort key; shown as "vol" |
| `liquidity`   | number\|null    | `liquidity`                            | |
| `active`      | boolean         | `active` (default true)                | eligibility |
| `closed`      | boolean         | `closed` (default false)               | eligibility |
| `image`       | string\|null    | `image` / `icon`                       | |
| `outcomes`    | `{name,price}[]`| parsed `outcomes`/`outcomePrices`      | |

**Surface rule** (Decision 7): surfaceable iff `conditionId != null` AND
`active === true` AND `closed !== true`. Filtered before its event is assembled.

## Entity: CategoryFilter

A user-selectable topic chip with a resolved upstream ID.

| Field   | Type           | Notes |
|---------|----------------|-------|
| `slug`  | string         | stable key, e.g. `pop-culture` |
| `label` | string         | user-facing, e.g. `Pop Culture` |
| `tagId` | string\|number | numeric Gamma tag id (seeded/resolved) |

**Seed mapping** (verified, Decision 3): politics→2, sports→1, crypto→21,
pop-culture→596, business→107, tech→1401.

**Resolution rule**: from the seed map; otherwise fetched once via
`GET /tags/slug/{slug}` and memoized. Categories are **multi-selectable**;
selected categories combine with **OR** (Decision 4).

## Entity: PickerState (derived, in-component)

| Field             | Type                | Derivation |
|-------------------|---------------------|-----------|
| `query`          | string              | controlled input; `trimmedQuery = query.trim()` |
| `activeCategories`| string[] (slugs)    | user toggles (multi-select), falling back to prop/saved prefs until touched |
| `mode`           | `'search'`\|`'browse'` | `trimmedQuery.length > 0 ? 'search' : 'browse'` |
| `expandedEventIds`| Set<string>        | which event rows are expanded |
| `results`        | NormalizedEvent[]   | surfaceable + ranked |
| `status`         | `'idle'`\|`'loading'`\|`'empty'`\|`'error'`\|`'ready'` | one at a time |
| `error`          | string\|null        | last request error message |

**Request selection (state transitions)**:

```
mode=browse, categories=[]        → GET /events?active=true&closed=false&order=volume&ascending=false (top events)
mode=browse, categories=[a,b]     → parallel GET /events?tag_id=<a|b>…, merge events by id (OR)
mode=search, categories=[]        → GET /public-search?q=… (events, global)
mode=search, categories=[a,b]     → GET /public-search?q=…, keep events whose tagIds ∩ {a,b} ≠ ∅ (OR)
```

**Query/filter interaction rules** (FR-002/003/004/005):
- Categories are multi-select; toggling adds/removes a slug (OR semantics).
- Toggling a category MUST NOT clear `query` (remove the existing
  `if (trimmedQuery) setQuery('')`).
- With categories active, typing a query constrains the search to those
  categories by default (FR-003).
- Clearing `query` → active categories' browse view (or top events if none).
- Clearing categories → top events, query preserved.

**Grouping / expand rules** (FR-017, Decision 10):
- Render one row per `NormalizedEvent`.
- Event with >1 market → expandable; toggling adds/removes its `id` in
  `expandedEventIds`; expanded list shows child markets (label = market.label).
- Event with exactly 1 market → selecting the row selects that market (no
  expand affordance).
- Selecting any child market → `onSelectMarket(market)`; `selectedConditionId`
  highlights the matching child.

**Ranking** (FR-008, Decision 9): browse → events by volume desc; search →
upstream relevance order (optional pref/history tie-break only). Children sorted
by volume desc.

**Concurrency** (FR-009/010, Decision 8): one debounce (~300–350ms), one
in-flight `AbortController`; superseded results discarded.

## Relationships

- `NormalizedEvent` 1→N `NormalizedMarket` (only eligible children).
- `CategoryFilter.tagId` selects events via the upstream tag (browse) or
  constrains search events by `tagIds` membership (search).
- `PickerState.results` is a filtered+ranked list of `NormalizedEvent`.
- Selecting a child `NormalizedMarket` emits it via `onSelectMarket(market)`;
  only its `conditionId` (+ metadata) feeds the unchanged linked-market form.
