# Quickstart & Validation: Polymarket Search & Category Filter

How to run and validate the feature end-to-end. Details live in
[research.md](./research.md), [data-model.md](./data-model.md), and
[contracts/](./contracts/); this file is the run/verify guide.

## Prerequisites

- Node + repo deps installed (`npm install` at repo root and in `frontend/` per
  project setup).
- A chain with Polymarket sidebets enabled (the picker self-gates on
  `capabilities.polymarketSidebets`; it renders `null` otherwise).
- Network access to `https://gamma-api.polymarket.com` (no auth/key needed).

## Run the app

```bash
npm run frontend        # Vite dev server (from repo root)
```

Open the app, start creating a wager, and open the **Linked Polymarket Event**
picker (inline variant). The dashboard **Top from Polymarket** feed exercises the
browse (feed) variant.

## Manual validation (maps to user stories)

1. **Search relevance (US1)** — type `knicks`. **Expect**: only Knicks-related
   markets (e.g. "Pacers vs. Knicks", spreads, over/unders); no album/GTA-VI
   noise. Clearing the box returns to the top-markets list.
2. **Category narrowing (US2)** — with no query, tap **Sports**. **Expect**: the
   list changes to sports markets. Tap **Crypto**. **Expect**: a different,
   crypto set (not the previous list). Tap **Clear**. **Expect**: default top
   markets return.
3. **Search within category (US3)** — type `lakers`, then toggle **Sports**.
   **Expect**: the typed query is **preserved** (not wiped) and results reflect
   both. Remove **Sports** → results broaden to the query alone.
4. **Responsive + trustworthy (US4)** — type quickly; results update within ~1s
   of pausing, no flicker/out-of-order. Simulate a failure (offline / block the
   Gamma host in devtools) → an error with a **Retry** that re-issues the
   request; never a stale list. A no-match query shows a distinct empty state.
5. **Eligibility** — every listed market is active/unresolved and selectable;
   selecting one links it to the wager (the downstream linked-market form
   receives the `conditionId`).

## Quick API sanity (optional, no app needed)

```bash
# Search must be relevant (uses q=, not search=)
curl -s "https://gamma-api.polymarket.com/public-search?q=knicks&limit_per_type=5"

# Category browse by numeric tag_id (Sports=1)
curl -s "https://gamma-api.polymarket.com/markets?tag_id=1&active=true&closed=false&order=volume&ascending=false&limit=5"

# Slug → tag_id mapping
curl -s "https://gamma-api.polymarket.com/tags/slug/pop-culture"
```

## Automated tests

```bash
npm run test:frontend                                   # full frontend suite
npx vitest run src/test/usePolymarketSearch.test.js \
               src/test/usePolymarketTopMarkets.test.js \
               src/test/PolymarketBrowser.test.jsx      # this feature
```

`fetch` is mocked via `vi.stubGlobal` (no MSW). The suite must cover contract
obligations **C1–C7** ([gamma-api.md](./contracts/gamma-api.md)) and component
obligations **T1–T7** ([polymarket-hooks.md](./contracts/polymarket-hooks.md)),
including the regression fixture where searching `knicks` against the old code
path would have returned GTA-VI markets.

## Done / acceptance

- Manual steps 1–5 pass; success criteria SC-001…SC-008 in
  [spec.md](./spec.md) hold.
- New Vitest files pass; `npm run lint` (frontend) clean; vitest-axe clean.
- No `contracts/` (Solidity) or deployment changes; behavior identical across
  both picker call sites.
