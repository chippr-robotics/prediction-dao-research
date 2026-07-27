# Tasks: Network Settings in the User Panel & Member RPC Endpoints

**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Status: all tasks complete on `claude/network-tab-user-panel-ih10ko`.

## Phase 1 — The seam

- [x] **T001** `lib/network/endpointStore.js`: device-scoped persistence over
      `saveGlobalPreference('network_endpoints')`, normalization (no token without a URL, no failover
      equal to primary), revision counter + subscribe, `redactRpcUrl`, `CSP_RPC_HOST_PATTERNS`,
      `isCspAllowedRpcUrl`. (FR-002, FR-007, FR-008, FR-010, FR-014)
- [x] **T002** `lib/network/rpcEndpoints.js`: `resolveRpcEndpoints` (member → default, default as
      implicit failover), `authHeadersFor` (primary only), `getRpcUrlForChain`, `describeRpcRoute`
      (redacted), `probeRpcEndpoint` (`eth_chainId`, redacted messages). (FR-003, FR-005, FR-006,
      FR-009)
- [x] **T003** Tests: `test/network/endpointStore.test.js` (20), `test/network/rpcEndpoints.test.js`
      (13) — including "no persisted token without an endpoint" and "no credential in any reported
      message".

## Phase 2 — Consumers

- [x] **T004** `utils/rpcProvider.js`: resolve the member route inside `makeReadProvider`, attach auth
      via `FetchRequest`, build a quorum-1 `FallbackProvider` when a failover exists, keep the
      ETC/Mordor unbatched workaround, add `getReadProvider(chainId)`. (FR-004, FR-005)
- [x] **T005** `wagmi.js`: `transportFor(chainId, defaultUrl)` — member endpoint (+ headers) → member
      failover → env/default, as a viem `fallback`. (FR-003, FR-005)
- [x] **T006** Revision wired into the memoized provider paths: `usePortfolio`, `useAccountAssets`,
      `useEarnPositions`, `useTransfer`. (FR-013)
- [x] **T007** Tests: `test/network/rpcProvider.endpoints.test.js` (5) — member URL overrides the
      caller's, key lands in a header not the URL, fallback order/quorum, batching preserved.

## Phase 3 — Relocation & panel

- [x] **T008** `config/appNav.js`: drop `network` from Tools (with the reasoning inline); tab id and
      route untouched. (FR-001)
- [x] **T009** `components/wallet/WalletButton.jsx`: Network entry directly above Preferences. (FR-001)
- [x] **T010** Move `components/wallet/NetworkSettings.{jsx,css}` →
      `components/account/NetworkPanel.{jsx,css}`; update `pages/WalletPage.jsx`. (FR-001)
- [x] **T011** `NetworkPanel`: per-network route summary (redacted, source badge, auth badge), editor
      toggle, reload disclosure, send-time-only framing of switching. (FR-013, FR-015)
- [x] **T012** `components/account/NetworkEndpointForm.jsx`: RPC URL, failover, auth mode + header
      name + masked key, read-only network facts, Test / Test failover / Save / Reset, chain-mismatch
      hard stop. (FR-002, FR-009, FR-010)
- [x] **T013** Tests: `test/network/NetworkPanel.test.jsx` (27 — the pre-existing selector cases plus
      the endpoint cases), `config/__tests__/appNav.test.js` (Network absent from every group,
      `groupForTab` null, route still resolves).

## Phase 4 — Policy & docs

- [x] **T014** `frontend/nginx.conf` + `nginx.conf.template`: add the three spec-067 chain RPC hosts
      (missing, so those reads were CSP-blocked) and the member provider host patterns. (FR-012)
- [x] **T015** `test/nginxCspConnectSrc.test.js`: assert every `CSP_RPC_HOST_PATTERNS` entry is in the
      shipped `connect-src`, in both configs. (FR-011)
- [x] **T016** `docs/developer-guide/network-endpoints.md` + the CLAUDE.md guardrail bullet.

## Verification

- `npx vitest run src/test/network/` — 65 passing.
- `npx vitest run` — full frontend suite.
- `npx eslint src` — clean for the touched files.
