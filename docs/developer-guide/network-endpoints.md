# Network settings & member RPC endpoints (spec 069)

FairWins is a multi-network control plane. Every asset carries its own `chainId`, reads fan
out across all supported networks at once, and the connected chain matters only when a
transaction is actually signed. Two consequences shaped this feature:

1. **Network settings are member configuration, not a tool.** The panel moved out of the
   Tools nav group onto the account button beside Preferences.
2. **The RPC route belongs to the member.** A member with their own Alchemy/QuickNode/
   Chainstack endpoint can point any network at it, with a failover behind it and whatever
   credential their provider expects — and every read in the app takes that route.

## Where things live

| Concern | File |
| --- | --- |
| Persistence, validation, redaction, CSP host list | `frontend/src/lib/network/endpointStore.js` |
| Resolution (`member → build default`), probe | `frontend/src/lib/network/rpcEndpoints.js` |
| React binding (`useRpcEndpoints`, `useEndpointsRevision`) | `frontend/src/hooks/useRpcEndpoints.js` |
| Every ethers read provider | `frontend/src/utils/rpcProvider.js` |
| Wallet transports | `frontend/src/wagmi.js` |
| UI | `frontend/src/components/account/NetworkPanel.jsx` + `NetworkEndpointForm.jsx` |
| Panel host (tab id `network`, unchanged) | `frontend/src/pages/WalletPage.jsx` |

## Resolution order

Per chain, highest precedence first:

1. the member's endpoint for that chain (Network settings)
2. `NETWORKS[chainId].rpcUrl` — itself `VITE_RPC_URL_*` or a curated public endpoint

With a member endpoint configured the route becomes a failover chain:

```
member primary  →  member failover (if set)  →  build default
```

`makeReadProvider(url, chainId)` returns an `ethers.FallbackProvider` at quorum 1 in that
case, so a rate-limited or down provider hands over instead of taking the network with it.
`getReadProvider(chainId)` is the preferred entry point in new code — it resolves the
endpoint itself and cannot be called with a URL that contradicts the member's settings.

**Never read `NETWORKS[chainId].rpcUrl` and build a provider by hand.** That bypasses the
member's route, and the bypass is invisible in review. Go through `makeReadProvider` /
`getReadProvider`, or `getRpcUrlForChain(chainId)` when a service client needs a bare URL.

## Rules that are not negotiable

- **Credentials never enter a URL that could be logged.** Header/bearer keys ride on an
  ethers `FetchRequest` (or viem `fetchOptions.headers`). Anything rendered or logged goes
  through `redactRpcUrl` first — protocol + host, with `/…` stating that a credential
  exists. This is the T148 leak class (a keyed URL printed into CI logs); do not reintroduce it.
- **The API key goes to the primary endpoint only.** A failover is usually a different
  provider; fanning the member's credential out to a second host is a decision we do not
  make on their behalf. A failover that needs its own key carries it in its URL.
- **Endpoint settings are device-scoped and never backed up.** They live in the non-wallet
  global preference blob (`fw_global_prefs.network_endpoints`) because reads happen with no
  wallet connected. They are deliberately absent from `lib/backup/syncedObjects.js` (spec
  032) so a provider credential never rides into an exportable backup — do not add an entry
  there.
- **A wrong-chain endpoint cannot be saved.** The panel's "Test" asks the endpoint for
  `eth_chainId`; a mismatch is blocked, because such an endpoint would silently serve
  another network's state into every balance, position and policy read for this one. An
  *unreachable* endpoint saves with the failure shown — a member may be configuring ahead of
  a provider or CSP change — but nothing claims it works.
- **HTTPS only** (plus `http://localhost` for dev). WebSocket endpoints are rejected with a
  reason: the read providers are HTTP.

## The CSP allowlist is part of this feature

The browser blocks `fetch` to any host missing from the production `connect-src`
(`frontend/nginx.conf` + `nginx.conf.template`), so an unlisted endpoint is a dead network
however correct it is. `CSP_RPC_HOST_PATTERNS` in `endpointStore.js` mirrors the header's
RPC hosts (exact hosts + `*.provider` wildcards for the major providers) and is what the
panel uses to warn a member up front. `src/test/nginxCspConnectSrc.test.js` asserts the two
stay in sync — when you add a provider, add it in **both** places, in both nginx files.

## Changing an endpoint at runtime

- **Reads** pick up a change on the next lookup. Provider instances are memoized, so read
  hooks include `useEndpointsRevision()` in their memo dependencies (`usePortfolio`,
  `useAccountAssets`, `useEarnPositions`, `useTransfer`). A new memoized provider path
  should do the same.
- **Wallet transports** are built once at module load in `wagmi.js` (localStorage is
  synchronous, so member endpoints apply from the first render of a session). A change
  therefore needs an app reload before wallet-signed transactions use it — the panel says
  so plainly rather than implying an instant switch.

## Network switching

Switching remains a wallet action via `wagmi.switchChain`, but it is framed as optional in
the panel: assets carry their own chain, reads span all of them, and only *sending* on a
network the wallet is not currently on requires a switch — which the sending surfaces
(Transfer, Pay, Earn, ClearPath, custody) already prompt for at submit time. Bitcoin (spec
061) has no wallet switch at all and stays display-only here.
