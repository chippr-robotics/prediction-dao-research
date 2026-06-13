# External Contract: Polymarket Gamma API (consumed)

The picker depends on these Gamma endpoints. Base URL comes from
`config/networks.js` (`network.polymarket.gammaApiUrl`, default
`https://gamma-api.polymarket.com`). Unauthenticated. All requests send
`Accept: application/json`, use `AbortController`, and tolerate transient
failure (surface an error + retry, never a stale list).

Rate limit: the `/public-search` family is ~350 requests / 10s — debounce and
abort superseded requests.

---

## 1. Keyword search — `GET /public-search`

**Purpose**: relevance-ranked free-text search (replaces the broken
`/markets?search=`).

**Request params**:
| param            | type   | value |
|------------------|--------|-------|
| `q`              | string | the trimmed user query (**required**; `query=` is rejected) |
| `limit_per_type` | int    | result cap per type (e.g. `10`) |

Example: `GET /public-search?q=knicks&limit_per_type=10`

**Response (200)**: `{ "events": Event[], "pagination": {…} }`
- `Event` includes `tags: Tag[]` and `markets: Market[]`.
- `Market` includes `conditionId`, `question`, `active`, `closed`, `volume`,
  `endDate`, `outcomes`, `outcomePrices`, `slug`, `image`/`icon`.

**Consumer rules**:
- Flatten `events[].markets[]`, normalize, and keep only surfaceable markets
  (`conditionId` present, `active === true`, `closed !== true`).
- When categories are active, first keep only events whose `tags[].id` intersects
  the selected `tagId`s, then flatten (Decision 4).
- Preserve upstream order as relevance.

**Errors**: non-2xx → throw `Polymarket Gamma API returned <status>`; empty `q`
→ caller must not send the request (treat blank as browse mode).

---

## 2. Category browse — `GET /markets`

**Purpose**: list active, condition-bearing markets, optionally by category,
ordered by volume (replaces the broken `tag_slug=`).

**Request params**:
| param       | value |
|-------------|-------|
| `tag_id`    | numeric category id (omit for default top markets) |
| `active`    | `true` |
| `closed`    | `false` |
| `order`     | `volume` |
| `ascending` | `false` |
| `limit`     | e.g. `12` |

Example: `GET /markets?tag_id=1&active=true&closed=false&order=volume&ascending=false&limit=12`

**Response (200)**: `Market[]` (or `{ data: Market[] }`) — normalize the same way;
each has `conditionId`, `question`, `active`, `closed`, `volume`, `endDate`, …

**Consumer rules**:
- Single category → one request. Multiple categories → one request per `tag_id`
  in parallel, merge + de-dupe by `conditionId`, re-sort by volume, cap at
  `limit` (Decision 5).
- Apply the same surfaceable filter as search.

---

## 3. Category resolution — `GET /tags/slug/{slug}`

**Purpose**: map a chip slug to its numeric `tag_id`.

Example: `GET /tags/slug/pop-culture` → `{ "id": "596", "label": "Culture",
"slug": "pop-culture", … }`

**Verified seed mapping** (fallback if resolution is skipped/fails):

| slug          | tag_id |
|---------------|--------|
| `politics`    | `2`    |
| `sports`      | `1`    |
| `crypto`      | `21`   |
| `pop-culture` | `596`  |
| `business`    | `107`  |
| `tech`        | `1401` |

**Consumer rules**: resolve once, memoize in module scope; prefer the seed map
to avoid a network round-trip (and to keep tests hermetic). A slug with no
resolvable id applies no filter for that slug and yields an empty state rather
than the default list.

---

## Contract test obligations

Each obligation below is asserted in Vitest by mocking `fetch` (`vi.stubGlobal`)
and inspecting the requested URL + handling the canned response:

- **C1**: search issues `GET …/public-search?q=<encoded query>&limit_per_type=…`
  (never `/markets?search=`).
- **C2**: browse with a category issues `GET …/markets?...&tag_id=<numeric id>…`
  using the verified mapping (never `tag_slug=`).
- **C3**: only surfaceable markets (conditionId + active + !closed) appear;
  closed/condition-less items in the payload are dropped.
- **C4**: combined query+category keeps only markets from events tagged with a
  selected `tag_id`.
- **C5**: multi-category browse merges results from each `tag_id` request and
  de-dupes by `conditionId`.
- **C6**: a superseded in-flight request is aborted and never overwrites newer
  results.
- **C7**: non-2xx and network failure surface an error string; aborts are
  swallowed silently.
