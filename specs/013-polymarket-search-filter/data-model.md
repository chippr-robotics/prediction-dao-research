# Phase 1 Data Model: Polymarket Search & Category Filter

This feature has no persistent storage. The "data model" is the set of in-memory
shapes that flow through the picker: the normalized market, the category
definition, and the derived picker state. Field names below match the existing
`normaliseGammaMarket` output so changes stay minimal.

## Entity: NormalizedMarket

A single Polymarket market eligible to back a wager. Produced by
`normaliseGammaMarket` from a Gamma market object (whether obtained via
`/public-search` event flattening or `/markets` browse).

| Field         | Type            | Source (Gamma)                         | Notes |
|---------------|-----------------|----------------------------------------|-------|
| `id`          | string\|null    | `id` / `marketId`                      | display key fallback |
| `slug`        | string\|null    | `slug`                                 | |
| `question`    | string          | `question` / `title` / `name`          | shown on card; matched by search |
| `description` | string          | `description`                          | |
| `category`    | string\|array\|null | `category` / `categories` / event `tags` | display tag |
| `conditionId` | string (bytes32)\|null | `conditionId` / `condition_id`    | **required** to link; used as list key |
| `endDate`     | string\|null    | `endDate` / `end_date_iso`             | |
| `volume`      | number\|null    | `volume`                               | browse sort key; shown as "vol" |
| `liquidity`   | number\|null    | `liquidity`                            | |
| `active`      | boolean         | `active` (default true)                | eligibility |
| `closed`      | boolean         | `closed` (default false)               | eligibility |
| `image`       | string\|null    | `image` / `icon`                       | |
| `outcomes`    | `{name,price}[]`| parsed `outcomes`/`outcomePrices`      | |

**Validation / eligibility rule** (Decision 6): a NormalizedMarket is
**surfaceable** iff `conditionId != null` AND `active === true` AND
`closed !== true`. Non-surfaceable markets are dropped before ranking/display.

**Identity**: `conditionId` is the stable identity used for de-duplication
(multi-category merge) and as the React list `key`.

## Entity: CategoryFilter

A user-selectable topic chip. Static definitions plus a resolved upstream ID.

| Field    | Type   | Notes |
|----------|--------|-------|
| `slug`   | string | stable key, e.g. `pop-culture` |
| `label`  | string | user-facing, e.g. `Pop Culture` |
| `tagId`  | string\|number | numeric Gamma tag id (resolved/seeded) |

**Seed mapping** (verified, Decision 3): politics→2, sports→1, crypto→21,
pop-culture→596, business→107, tech→1401.

**Resolution rule**: `tagId` is taken from the seed map; if absent it is fetched
once via `GET /tags/slug/{slug}` and memoized in module scope. A category with no
resolvable `tagId` is treated as "no filter applied" for that slug (and surfaced
as empty rather than silently returning the default list).

## Entity: PickerState (derived, in-component)

The observable state of the picker, derived from inputs. Drives which request is
issued and which view is shown.

| Field             | Type            | Derivation |
|-------------------|-----------------|-----------|
| `query`          | string          | controlled input; `trimmedQuery = query.trim()` |
| `activeCategories`| string[] (slugs)| user toggles, falling back to prop/saved prefs until touched |
| `mode`           | `'search'`\|`'browse'` | `trimmedQuery.length > 0 ? 'search' : 'browse'` |
| `results`        | NormalizedMarket[] | surfaceable + ranked (see below) |
| `status`         | `'idle'`\|`'loading'`\|`'empty'`\|`'error'`\|`'ready'` | one at a time |
| `error`          | string\|null    | last request error message |

**State transitions (request selection)**:

```
mode = browse, categories = []        → GET /markets?…order=volume (top markets)
mode = browse, categories = [a,b]     → parallel GET /markets?tag_id=<a|b>…, merge by conditionId
mode = search, categories = []        → GET /public-search?q=…, flatten markets
mode = search, categories = [a,b]     → GET /public-search?q=…, keep events whose tags ∈ {a,b}, flatten markets
```

**Query/filter interaction rules** (FR-003/004/005):
- Toggling a category MUST NOT clear `query` (removes the current
  `if (trimmedQuery) setQuery('')` behavior).
- Clearing `query` returns to the active category's browse view (or default
  top markets if none selected).
- Clearing categories returns to default top markets while preserving `query`.

**Ranking rule** (FR-008, Decision 8):
- browse: sort surfaceable markets by `volume` desc.
- search: preserve upstream relevance order; optional saved-pref/history boost as
  a tie-breaker only, never reordering above relevance.

**Concurrency rule** (FR-009/010, Decision 7): a single debounce (~300–350ms)
and a single in-flight `AbortController`; results from a superseded request are
discarded (never written to `results`).

## Relationships

- A `CategoryFilter.tagId` selects `NormalizedMarket`s via the upstream tag, OR
  (in search mode) constrains which events' markets are surfaced by
  `event.tags ∋ tagId`.
- `PickerState.results` is a filtered+ranked list of `NormalizedMarket`.
- Selecting a `NormalizedMarket` emits it via `onSelectMarket(market)`; only its
  `conditionId` (and metadata) feed the unchanged linked-market form downstream.
