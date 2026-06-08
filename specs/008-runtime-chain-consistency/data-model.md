# Phase 1 Data Model: Runtime Chain Consistency

This feature has no persistent schema of its own; it constrains how *existing*
chain-scoped values are resolved and cached. The "entities" are the conceptual
objects the resolution rule operates over.

## Entity: Connected Network

- **Represents**: the network the wallet is currently connected to.
- **Key attribute**: `chainId` (number). Supported values: `137` (Polygon
  mainnet), `80002` (Polygon Amoy testnet), `1337` (local dev).
- **Source**: `useWeb3().chainId` (wagmi connector). `null`/`undefined` while
  disconnected.
- **Role**: single source of truth for which `Deployment Set` and provider a
  view uses while a wallet is connected.
- **States**: `disconnected` → `connected(supported)` → `connected(unsupported)`;
  transitions on wallet connect/disconnect and network switch. Every transition
  to a new `chainId` invalidates currently-displayed chain-scoped values.

## Entity: Deployment Set

- **Represents**: the collection of contract addresses for one network, from the
  generated per-network sync artifacts (`config/contracts.js` → `NETWORK_CONTRACTS[chainId]`).
- **Attributes**: `chainId`; map of `contractName → address | undefined`.
- **Validation**: an entry is "available" only if the address is present *and*
  has bytecode on the connected chain. `undefined`/empty ⇒ unavailable.
- **Relationships**: selected by `Connected Network.chainId` via
  `getContractAddressForChain(name, chainId)`.
- **States per contract**: `available` | `unavailable` (absent for this network)
  → drives `NetworkUnavailableNotice`.

## Entity: Chain-Scoped Value

- **Represents**: any value shown or used that derives from a contract on a
  specific network — membership tier/status, tier price, tier limit, token
  balance, allowance, token identity, wager, role, stats, accrued fees.
- **Attributes**: the value; the `chainId` it was read from.
- **Invariant (the core rule)**: a Chain-Scoped Value MUST only be displayed or
  acted upon while `value.chainId === ConnectedNetwork.chainId`. On a network
  switch the prior value is discarded (loading state) until re-read for the new
  chain.
- **Derived/transient**: not persisted except via the cache below.

## Cache: Per-Network Local Records

- **Represents**: `localStorage` records of roles/purchases/preferences
  (`roleStorage.js`).
- **Current key**: `ROLE_STORAGE_KEY + '_' + walletAddress` (account only).
- **New key**: include `chainId` → `ROLE_STORAGE_KEY + '_' + chainId + '_' + walletAddress`.
- **Validation/migration**: a legacy account-only entry is treated as absent
  (re-read from chain); no automatic re-attribution to a network.
- **Invariant**: a cached value for `(chainIdA, account)` is never returned while
  connected to `chainIdB`.

## Relationships (summary)

```
ConnectedNetwork.chainId ──selects──▶ DeploymentSet(chainId)
                          ──reads──▶  Provider(chainId)
DeploymentSet + Provider ──produce──▶ Chain-Scoped Value (tagged with chainId)
Chain-Scoped Value ──displayed only if──▶ value.chainId === ConnectedNetwork.chainId
Cache key = (chainId, walletAddress)
```
