# Phase 0 Research: Collectibles Portfolio (Read-Only NFT Display)

**Feature**: 055-collectibles-portfolio | **Date**: 2026-07-13
**Upstream research**: `docs/research/opensea-sdk-nft-trading-analysis.md`

All Technical Context unknowns are resolved below. Each decision records rationale
and alternatives considered.

## D1. Upstream integration: OpenSea REST API v2 directly, no `@opensea/sdk`

- **Decision**: The gateway calls OpenSea REST API v2 (`https://api.opensea.io/api/v2`)
  with plain `fetch`, mirroring the existing engine client
  (`services/relay-gateway/src/engine/client.js`: base-URL normalization,
  auth header, AbortController timeout, bounded retries, injectable `fetchImpl`).
  Auth header is `X-API-KEY` (OpenSea) instead of `Authorization: Bearer` (engine).
- **Rationale**: The MVP is read-only. `@opensea/sdk` adds value for order
  construction/fulfillment (Seaport), which is explicitly out of scope; for reads it
  is a thin wrapper over the same REST endpoints. Zero new npm dependencies keeps
  the constitution's "new core technology requires justification" gate trivially
  green and shrinks supply-chain surface in a service that holds signing keys.
- **Alternatives considered**: `@opensea/sdk` in the gateway (rejected: pulls in
  ethers/viem + Seaport machinery unused by reads); multi-provider aggregation e.g.
  Alchemy/Reservoir (rejected: out of scope per spec assumptions).

## D2. OpenSea endpoints consumed (and chain slug mapping)

- **Decision**: Four upstream endpoints cover the whole feature:
  1. `GET /api/v2/chain/{chain}/account/{address}/nfts` — owned items (cursor-paginated via `next`)
  2. `GET /api/v2/chain/{chain}/contract/{address}/nfts/{identifier}` — item detail incl. traits
  3. `GET /api/v2/collections/{slug}` + `GET /api/v2/collections/{slug}/stats` — collection metadata + floor price
  4. `GET /api/v2/offers/collection/{slug}/nfts/{identifier}/best` — best offer for an item
  Chain slugs: chainId `1` → `ethereum`, `137` → `matic`. Any other chainId is
  rejected by the gateway with `404 unsupported_chain` (soft-fail contract).
- **Rationale**: Smallest endpoint set that satisfies FR-002/FR-003/FR-006.
  Deep link needs no API: `https://opensea.io/assets/{chain}/{contract}/{identifier}`.
- **Alternatives considered**: account-level portfolio/valuation endpoints
  (not part of the stable public v2 surface); per-collection NFT listing (not needed).

## D3. Gateway surface: thin typed proxy under `/v1/opensea/*`

- **Decision**: New read-only route group in `services/relay-gateway` (see
  `contracts/gateway-opensea-api.md` for the full contract):
  - `GET /v1/opensea/:chainId/account/:address/nfts[?next=]`
  - `GET /v1/opensea/:chainId/contract/:contract/nfts/:identifier` (composes item detail + collection floor + best offer into one response)
  - `GET /v1/opensea/collections/:slug/stats`
  Routes are registered after the origin-lock middleware in `createApp`
  (server.js ~line 171) so they inherit CORS + `X-Origin-Auth` enforcement; the
  killswitch is honored at the top of each handler (a disabled gateway returns 503,
  and the frontend degrades per FR-008).
  Responses are normalized DTOs (not raw OpenSea passthrough) so the frontend
  never binds to OpenSea's response shape and the API key scope stays obvious.
- **Rationale**: Composition on the server (item + floor + best offer) means one
  client round-trip for the detail sheet, one cache entry, and simpler quota math.
  Normalized DTOs keep FR-013 (currency labeling, `fetchedAt`, `stale`) enforceable
  in one place.
- **Alternatives considered**: raw passthrough proxy (rejected: leaks upstream
  shape, harder to cache/compose); separate microservice (rejected: relay-gateway
  already has quotas/killswitch/origin-lock/deploy pipeline; a fourth service adds
  operational cost for no isolation benefit on a read-only path).

## D4. Per-user quotas: keyed by requested wallet address + global cap

- **Decision**: Reuse `createQuotas` (`src/policy/quotas.js`) with a third instance
  (`osQuotas`): per-key limit keyed on the **requested wallet address** (lowercased;
  for collection/item routes, the address falls back to a per-route constant so the
  global cap dominates), plus the instance's global sliding-window cap. Defaults:
  60 requests/address/min, 300 requests global/min (env-tunable).
- **Rationale**: The gateway has no authenticated user principal on GETs (identity
  exists only via signature recovery on write paths). The spec's quota requirement
  (FR-009 / SC-005) protects the shared OpenSea key from exhaustion — the global
  cap is the real backstop; the per-address key adds fairness against a single hot
  wallet. A spoofable soft key is acceptable for public, read-only data.
- **Alternatives considered**: signed request challenge like `/v1/intents`
  (rejected for MVP: adds a wallet signature to a read path, hostile UX for a
  browse screen); IP-based keys (rejected: gateway sits behind Cloudflare +
  Cloud Run; client IP handling adds config risk for little gain over the global cap).

## D5. Caching: keyed TTL + single-flight + serve-stale, in-process

- **Decision**: Generalize the health-handler cache pattern (server.js:228-265)
  into `src/opensea/cache.js`: `Map<key, {at, value, inflight}>` with per-route
  TTLs — account NFTs 60 s, item detail 60 s, collection stats/floor 300 s. On
  upstream failure, serve the last good value marked `stale: true` (with original
  `fetchedAt`); with no cached value, return `503 upstream_unavailable`. Bounded
  size (LRU-ish eviction at a few thousand entries) since the gateway runs
  `--max-instances=1` with in-process state by design (README precedent).
- **Rationale**: Matches FR-008 (graceful degradation with staleness surfaced) and
  the service's existing anti-amplification stance for cached routes; single-flight
  prevents concurrent identical misses from stampeding OpenSea.
- **Alternatives considered**: Redis (already in docker-compose for oz-relayer, but
  gateway state is deliberately in-process at max-instances=1; adding a network
  cache violates YAGNI); HTTP `Cache-Control` only (rejected: doesn't provide
  serve-stale-on-error or single-flight).

## D6. Frontend data layer: `usePortfolio`-style hook, not TanStack Query

- **Decision**: `useCollectibles(chainId, address)` follows the repo's established
  data-hook shape (`frontend/src/hooks/usePortfolio.js`): `useState`/`useEffect`,
  race-safe request ids, `status`/`isLoading`/`error`/`refresh`, refetch on
  chain/address change. No polling interval in the MVP (collectibles change
  rarely; `refresh` covers manual reload). Gateway client lives in
  `frontend/src/lib/collectibles/gatewayClient.js`, reads `VITE_RELAYER_URL`
  (same base URL as the relay client), returns `null`-client when unset —
  the feature then hides, mirroring `makeRelayer()`'s soft-fail.
- **Rationale**: TanStack Query is installed but only services wagmi internally;
  every app-data hook in the codebase is hand-rolled. Consistency beats the
  marginal caching benefit (the gateway already caches server-side). This
  supersedes the TanStack suggestion in the user's planning input — recorded here
  deliberately.
- **Alternatives considered**: TanStack `useQuery` (workable — wagmi's provider is
  already mounted — but would make this the only non-wagmi `useQuery` surface in
  the app; rejected for pattern consistency).

## D7. Network/feature gating: capability flag + gateway-config check

- **Decision**: Add a `collectibles` capability to `frontend/src/config/networks.js`
  (`true` for chainId 1 and 137 only). Visibility rule:
  `collectiblesAvailable(chainId) = getNetwork(chainId)?.capabilities?.collectibles === true && gatewayConfigured()`.
  `appNav.js` gains a chain-aware filter (`visibleNavGroups(chainId)`) used by the
  drawer/rail/bottom-nav consumers so the Collectibles item disappears entirely on
  unsupported networks (FR-007); `WalletPage` routes `?tab=collectibles` on an
  unsupported network to the default-tab fallback (existing unknown-tab behavior).
- **Rationale**: Matches the established soft-fail patterns (callsign resolver
  returns null; `getContractAddressForChain` gates features), but keyed on a
  capability flag since there is no on-chain contract to detect. The spec requires
  *hidden*, which is stricter than Earn's "always present, self-discloses" nav
  convention — the nav filter is the smallest change that satisfies FR-007/SC-003.
- **Alternatives considered**: Earn-style always-visible tab with an in-panel
  unavailability notice (rejected: contradicts FR-007); per-deployment env flag
  (rejected: chain capability is static product truth, not deployment config).

## D8. Portfolio wiring: separate labeled estimate line, excluded from headline total

- **Decision**: `PortfolioPanel` gains a "Collectibles (floor estimate)" row backed
  by `useCollectibles` aggregate value, rendered alongside token balances,
  navigating to `/wallet?tab=collectibles`, and **not** added into the existing
  `totalUsd` headline. The row's label states the basis ("floor-price estimate,
  priced items only") and shows priced/unpriced counts; on unsupported networks or
  unconfigured gateway the row is absent; on upstream outage it shows the
  stale/unavailable state without blocking token rendering (FR-006, story 3).
- **Rationale**: `usePortfolio` computes `totalUsd` from verifiable balances ×
  prices; mixing a floor-price *estimate* into that headline would overstate
  certainty (constitution III, honest state). A visually adjacent, explicitly
  labeled line satisfies "alongside token balances" without polluting the
  SEC/CFTC category taxonomy math.
- **Alternatives considered**: merging into `aggregates` with `kind: 'nft'`
  pricing (rejected: pollutes category subtotals and the headline with estimates);
  a second headline total "incl. collectibles" (deferred: can be added later if
  users ask).

## D9. Spam and content flags

- **Decision**: Trust OpenSea's per-item flags: items with `is_disabled === true`
  or `is_nsfw === true` are placed behind the "hidden items" toggle (FR-012). The
  gateway passes both flags through in the DTO; filtering is a frontend display
  concern (data remains reachable, per spec).
- **Rationale**: Matches the spec assumption (provider flags, no in-house
  denylist). Flags exist on the v2 NFT objects the gateway already fetches.
- **Alternatives considered**: collection `safelist_status`-based filtering
  (rejected for MVP: hides legitimate unverified collections users genuinely own).

## D10. Item images

- **Decision**: Render OpenSea-provided image URLs directly (`image_url` /
  `display_image_url`) with lazy loading, `AssetLogo`-style placeholder fallback
  on error, and accessible names from item name (FR-014). No image re-proxying
  through the gateway in the MVP.
- **Rationale**: Re-proxying media would turn the gateway into a bandwidth-bearing
  CDN and threaten its read-only quota model; the privacy trade-off (user IP
  visible to OpenSea's CDN) is accepted and was flagged as an open question in the
  research doc — revisit post-MVP if privacy review requires it.
- **Alternatives considered**: gateway media proxy with size caps (rejected:
  cost/complexity, gateway runs read-only tmpfs with 32 kb JSON limits — media
  streaming is out of character for the service).

## D11. Testing strategy

- **Decision**:
  - Gateway: `services/relay-gateway/test/opensea.test.js` — Supertest against
    `createApp` with an injected mock `fetchImpl` (pattern: `test/gateway.test.js`
    `build({...})`). Covers: DTO normalization, chain-slug mapping + unsupported
    chain 404, cache hit (two calls → one upstream), serve-stale on upstream 5xx,
    quota 429 (per-address and global), killswitch 503, origin-lock 403, missing
    API key → 503 fail-closed.
  - Frontend: hook test for `useCollectibles` (fetch mocked), `CollectiblesPanel`
    render states (grid/empty/degraded/hidden-toggle), detail-sheet test
    (traits/floor/offer + "none yet" states + deep-link href), `WalletPage`
    deep-link test (`?tab=collectibles` on supported and unsupported chains),
    `PortfolioPanel` estimate-line tests, axe accessibility assertions
    (vitest-axe already in setup).
- **Rationale**: Constitution II (tests alongside behavior; Vitest both sides —
  the gateway already uses Vitest+Supertest, the frontend Vitest+RTL).

## D12. Configuration & deployment

- **Decision**: New env vars (all optional; feature fails closed when unset):
  - Gateway: `OPENSEA_API_KEY` (secret, Cloud Run Secret Manager),
    `OPENSEA_BASE_URL` (default `https://api.opensea.io`), `OPENSEA_TIMEOUT_MS`
    (default 5000), `OPENSEA_CACHE_TTL_MS` / `OPENSEA_STATS_CACHE_TTL_MS`
    (defaults 60000 / 300000), `OPENSEA_QUOTA_PER_ADDRESS` / `OPENSEA_QUOTA_GLOBAL`
    (defaults 60 / 300 per minute).
  - Frontend: none new (`VITE_RELAYER_URL` reused).
  Document in `services/relay-gateway/.env.example`, README env table, and
  `docs/runbooks/relayer-operations.md` (key rotation note).
- **Rationale**: Mirrors the `ENGINE_API_KEY`/paymaster optional-config precedent
  (route 503s when unset rather than failing boot); "never commit secrets"
  guardrail; no `cloudbuild.yaml` change needed for the SPA.
- **Alternatives considered**: required-at-boot key (rejected: would couple gateway
  boot to a non-critical feature, violating FR-011's isolation requirement).
