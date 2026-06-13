# External Contract: Polymarket Gamma API (consumed)

The picker depends on these Gamma endpoints. Base URL comes from
`config/networks.js` (`network.polymarket.gammaApiUrl`, default
`https://gamma-api.polymarket.com`). Unauthenticated. All requests send
`Accept: application/json`, use `AbortController`, and tolerate transient
failure (surface an error + retry, never a stale list).

Both search and browse return **events with nested markets**, normalized into
`NormalizedEvent` (see data-model.md). Rate limit: the `/public-search` family is
~350 requests / 10s — debounce and abort superseded requests.

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
- `Event`: `id`, `title`, `slug`, `tags: Tag[]`, `markets: Market[]`, `image`/`icon`.
- `Market`: `conditionId`, `question`, `groupItemTitle`, `active`, `closed`,
  `volume`, `endDate`, `outcomes`, `outcomePrices`, `slug`, `image`/`icon`.

**Consumer rules**:
- Normalize each event → `NormalizedEvent` keeping only surfaceable child markets
  (`conditionId` present, `active === true`, `closed !== true`); drop events with
  zero eligible children.
- When categories are active, keep only events whose `tags[].id` intersects the
  selected `tag_id`s (OR) before surfacing (Decision 6).
- Preserve upstream event order as relevance.

**Errors**: non-2xx → throw `Polymarket Gamma API returned <status>`; empty `q`
→ caller must not send the request (blank = browse mode).

---

## 2. Category / top browse — `GET /events`

**Purpose**: list active events (with nested markets), optionally by category,
ordered by volume (replaces the broken `/markets?tag_slug=`).

**Request params**:
| param       | value |
|-------------|-------|
| `tag_id`    | numeric category id (omit for default top events) |
| `active`    | `true` |
| `closed`    | `false` |
| `order`     | `volume` |
| `ascending` | `false` |
| `limit`     | e.g. `12` |

Example: `GET /events?tag_id=1&active=true&closed=false&order=volume&ascending=false&limit=12`

**Response (200)**: `Event[]` (or `{ data: Event[] }`) — same `Event`/`Market`
shape as §1; events carry `tags`, `volume`/`volume24hr`, nested `markets[]`.

**Consumer rules**:
- No category → one request (default top events).
- One category → one request with `tag_id`.
- Multiple categories → one request per `tag_id` in parallel, merge + de-dupe by
  **event `id`**, re-sort by volume, cap at `limit` (Decision 5, OR semantics).
- Apply the same per-market surfaceable filter and drop empty events as §1.

---

## 3. Category resolution — `GET /tags/slug/{slug}`

**Purpose**: map a chip slug to its numeric `tag_id`.

Example: `GET /tags/slug/pop-culture` → `{ "id": "596", "label": "Culture",
"slug": "pop-culture", … }`

**Verified seed mapping** (fallback / hermetic-test seed):

| slug          | tag_id |
|---------------|--------|
| `politics`    | `2`    |
| `sports`      | `1`    |
| `crypto`      | `21`   |
| `pop-culture` | `596`  |
| `business`    | `107`  |
| `tech`        | `1401` |

**Consumer rules**: prefer the seed map; resolve via `/tags/slug` only if
unseeded; memoize in module scope. A slug with no resolvable id applies no filter
for that slug.

---

## Contract test obligations

Asserted in Vitest by mocking `fetch` (`vi.stubGlobal`) and inspecting the
requested URL + handling the canned response:

- **C1**: search issues `GET …/public-search?q=<encoded query>&limit_per_type=…`
  (never `/markets?search=`).
- **C2**: browse issues `GET …/events?...` and, with a category, includes
  `tag_id=<numeric id>` from the verified mapping (never `tag_slug=`, never
  `/markets`).
- **C3**: events are normalized with only surfaceable child markets
  (conditionId + active + !closed); events with zero eligible children are
  dropped.
- **C4**: combined query+category keeps only events whose `tags` include a
  selected `tag_id` (OR across selected categories).
- **C5**: multi-category browse fans out one request per `tag_id` and merges +
  de-dupes events by `id`.
- **C6**: a superseded in-flight request is aborted and never overwrites newer
  results.
- **C7**: non-2xx and network failure surface an error string; aborts are
  swallowed silently.
- **C8**: a multi-market event normalizes to one `NormalizedEvent` with N
  children (grouping), and a single-market event to one child.
