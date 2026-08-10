# Implementation Plan: Network Settings in the User Panel & Member RPC Endpoints

**Branch**: `claude/network-tab-user-panel-ih10ko` | **Spec**: [spec.md](./spec.md)

## Summary

Frontend-only. No contracts, no subgraph, no gateway changes.

The work is a seam plus a panel. The seam is one module pair —
`lib/network/endpointStore.js` (persist + validate + redact) and `lib/network/rpcEndpoints.js`
(resolve + probe) — that answers "which endpoint does chain X use right now?". Both existing
endpoint consumers are re-pointed at it: `utils/rpcProvider.js#makeReadProvider`, which every ethers
read in the app already funnels through (~20 call sites, unchanged), and `wagmi.js`'s transports. The
panel is the relocated `NetworkPanel` (was `components/wallet/NetworkSettings.jsx`) plus a per-network
`NetworkEndpointForm`.

Two decisions carry most of the risk, and both are made in favour of not lying to the member:

- **A wrong-chain endpoint is refused, an unreachable one is not.** Chain mismatch would poison every
  read for that network with another chain's state, silently. Unreachability is a legitimate transient
  state (offline, provider down, CSP), so it is reported and left to the member.
- **The CSP allowlist is part of the feature, not an afterthought.** The browser blocks unlisted
  hosts, so member endpoints are only real if the shipped `connect-src` admits them. The provider host
  patterns live in the store next to the warning logic and are asserted against both nginx configs.

## Technical Context

**Stack**: React 19 + Vite, ethers v6 (reads), wagmi v3 + viem (wallet), Vitest.

**Storage**: `utils/userStorage#saveGlobalPreference` — device-scoped, not wallet-keyed, because reads
happen with no wallet connected. Deliberately absent from `lib/backup/syncedObjects.js`: an entry may
carry a provider credential and the backup blob is exportable.

**Failover**: `ethers.FallbackProvider` at quorum 1 for reads; viem `fallback([...])` for transports.
Reads pass an explicit `ethers.Network` because a FallbackProvider requires its members to agree on
the network up front and ethers only knows the well-known chains by number.

**Credential transport**: `ethers.FetchRequest#setHeader` for reads, `fetchOptions.headers` for viem.
Never in a URL — that is the T148 leak class (a keyed URL printed into CI logs).

**Runtime invalidation**: `useEndpointsRevision()` (a `useSyncExternalStore` over the store) is added
to the memo dependencies of the memoized provider paths (`usePortfolio`, `useAccountAssets`,
`useEarnPositions`, `useTransfer`). Wallet transports are module-load-time; the panel discloses the
reload rather than faking immediacy.

## Constitution Check

| Principle | Assessment |
| --- | --- |
| I. Security-first contracts | No contract changes. The security surface here is credential handling: header-only transport, redaction at every boundary, excluded from backups, no logging. |
| II. Test-first | 4 Vitest suites (65 tests): store validation/persistence, resolution/probe, provider construction (URL + headers + fallback shape), panel behaviour. CSP sync asserted in `nginxCspConnectSrc.test.js`. |
| III. Honest state | Chain-mismatch refusal, CSP-block warning, unreachable reporting, "reload for wallet transactions" disclosure, redacted route display. No mocked "connected" state. |
| IV. Fail loudly in CI | The CSP↔store sync test fails the build on drift; no `continue-on-error` added. |
| V. Accessible frontend | Labelled inputs, `aria-invalid` + `role="alert"` on errors, `aria-expanded` on the editor toggle, `aria-pressed` on reveal, masked secret input. |

Also relevant: the spec-067 chains (Arbitrum/Base/Optimism) were missing from `connect-src`
entirely — their reads are CSP-blocked in production today. Fixed here since this change owns that
header's RPC section.

## Project Structure

### Documentation

```
specs/069-network-endpoints-user-panel/
├── spec.md
├── plan.md
└── tasks.md
docs/developer-guide/network-endpoints.md
```

### Source

```
frontend/src/
├── lib/network/
│   ├── endpointStore.js          # NEW: persist, validate, redact, CSP host patterns
│   └── rpcEndpoints.js           # NEW: resolve (member → default), auth headers, probe
├── hooks/
│   ├── useRpcEndpoints.js        # NEW: panel binding + useEndpointsRevision
│   ├── usePortfolio.js           # revision in provider memo deps
│   ├── useAccountAssets.js       # revision in provider memo deps
│   ├── useEarnPositions.js       # revision in provider memo deps
│   └── useTransfer.js            # revision in provider memo deps
├── utils/rpcProvider.js          # resolve member route, headers, failover; + getReadProvider
├── wagmi.js                      # transportFor(): member route → viem fallback
├── config/appNav.js              # 'network' removed from Tools
├── components/
│   ├── account/NetworkPanel.{jsx,css}   # MOVED from components/wallet/NetworkSettings.*
│   ├── account/NetworkEndpointForm.jsx  # NEW
│   └── wallet/WalletButton.jsx          # Network entry beside Preferences
├── pages/WalletPage.jsx          # hosts NetworkPanel (tab id unchanged)
└── test/network/                 # 4 suites
frontend/nginx.conf, nginx.conf.template   # connect-src: supported + provider hosts
```

## Complexity Tracking

- **A device-scoped global with a revision counter.** Non-React modules (wagmi transports, ~20 read
  paths) need synchronous resolution, which rules out context-only state. The counter keeps React
  consumers correct without threading settings through every hook.
- **`makeReadProvider(url, chainId)` keeps its signature** and lets the member's route override the
  passed URL. Rewriting 20 call sites to `getReadProvider(chainId)` would be cleaner but is churn
  with no behavioural gain; `getReadProvider` exists for new code and the doc names the rule.
