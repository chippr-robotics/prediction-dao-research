# Data Model: Earn Section — Lending & Rewards (spec 050)

All models are client-side normalized shapes (plain objects) produced by `lib/earn/*` and consumed
by hooks/components. Amounts are kept as `bigint` (raw units) alongside `decimals`; formatting
happens at the edge. Every model is scoped to one `chainId` — nothing crosses networks.

## EarnNetworkConfig (`networks.js` → `earn` block)

| Field | Type | Notes |
|---|---|---|
| `provider` | `{ name, url }` | `{ name: 'Morpho', url: 'https://app.morpho.org' }` — attribution + outbound link |
| `merklDistributor` | `address` | `0x3Ef3D8bA38EBe18DB133cEc00Dd9Ae…` canonical claim contract (config-fixed, never user input) |
| `legacyRewardsUrl` | `string` | `https://rewards-legacy.morpho.org/` |

Derived: `capabilities.earn === Boolean(this.earn)`. Helpers: `isEarnAvailable(chainId)`,
`getEarnConfig(chainId)`, `getEarnNetworks()` (earn-enabled network names for honest copy).
Validation: block present only on chains the Morpho API serves (1, 137 initially).

## Vault (normalized from Morpho GraphQL `vaults.items[]`)

| Field | Type | Source | Notes |
|---|---|---|---|
| `address` | address | `address` | vault contract (ERC-4626) |
| `chainId` | number | `chain.id` | must equal requested chain (guard) |
| `name` / `symbol` | string | `name`/`symbol` | display |
| `asset` | `{ address, symbol, decimals, name }` | `asset` | underlying token |
| `netApy` | number \| null | `state.netApy` | fraction (0.043 = 4.3%); null → "—" |
| `apy` | number \| null | `state.apy` | native APY (pre-rewards) for the breakdown InfoTip |
| `rewards` | `{ assetSymbol, supplyApr }[]` | `state.allRewards` | reward campaign breakdown |
| `totalAssetsUsd` | number \| null | `state.totalAssetsUsd` | "total deposits" display |
| `curator` | string \| null | `state.curator` | curator identity (FR-003) |
| `whitelisted`/`listed` | boolean | top-level | both must be true to surface (curation) |

State: fetched per chain; list status ∈ `loading | ready | unavailable` (fetch failure ⇒
`unavailable`, deposits disabled — never stale numbers as truth).

## Position (per member × vault)

| Field | Type | Source | Notes |
|---|---|---|---|
| `vault` | Vault ref | — | |
| `shares` | bigint | on-chain `balanceOf(account)` | source of truth for "has position" |
| `assets` | bigint | on-chain `convertToAssets(shares)` | current value in underlying units |
| `assetsUsd` | number \| null | API `state.assetsUsd` | enrichment; null → "—" (honest) |
| `pnlUsd` | number \| null | API `state.pnlUsd` | "earned so far"; omitted when unavailable |
| `maxWithdrawAssets` | bigint | on-chain `maxWithdraw(account)` | honest withdraw bound (liquidity) |

Transitions: deposit ⇒ shares↑; withdraw/redeem ⇒ shares↓ (0 ⇒ position closed). Poll 60s
(aligned with usePortfolio), scoped to active chain + connected account.

## RewardBalance (normalized from Merkl `/v4/users/{addr}/rewards?chainId=`)

| Field | Type | Source | Notes |
|---|---|---|---|
| `token` | `{ address, symbol, decimals }` | `rewards[].token` | |
| `amount` | bigint | `rewards[].amount` | cumulative earned (lifetime) |
| `claimed` | bigint | `rewards[].claimed` | cumulative claimed |
| `claimable` | bigint | derived | `amount − claimed`; claim passes cumulative `amount` |
| `pending` | bigint | `rewards[].pending` | accruing, not yet claimable (shown informatively) |
| `proofs` | `bytes32[]` | `rewards[].proofs` | Merkle proof for the distributor call |
| `fetchedAt` | number | client clock | drives the freshness copy |

Invariants: claim tx uses parallel arrays `(users[], tokens[], amounts[], proofs[][])` with
`users[i] = account`, `amounts[i] = amount` (cumulative — re-claiming is safe/no-op by design).
Rewards with `claimable === 0n && pending === 0n` are hidden. Status ∈
`loading | ready | unavailable` — `unavailable` is an explicit state, never rendered as zero.

## EarnActivityEntry (spec 031 entry shape, `domain: 'earn'`)

| Field | Value |
|---|---|
| `id` | stable: `earn:<chainId>:<type>:<vaultOrToken>:<txHash \| snapshotEpoch>` |
| `domain` | `'earn'` (new `DOMAIN_META` entry: label "Earn", feed tag) |
| `refId` | vault address (positions) or reward token address (claims) |
| `type` | `earn-deposit` \| `earn-withdraw` \| `earn-position-changed` \| `earn-rewards-claimed` |
| `message` | plain language incl. amount + asset + vault/reward name |
| `severity` | `info` |
| `actionable` | `false` |
| `link` | tx explorer URL (action rider) or earn tab path (poll-detected) |
| `createdAt` / `read` | per contract |

Source snapshots per (account, chain): `{ [vaultAddress]: sharesString }` and
`{ [rewardTokenAddress]: claimedString }`. Contract obligations (first-sight = baseline,
idempotent, `ok:false` on hard failure) per `sources/README.md`.

## Deep-link contract

`/wallet?tab=earn[&view=lend|rewards][&chain=<chainId>][&token=<symbol>]` — `chain` is a hint (UI
still operates on the active wallet network and shows a switch prompt when they differ); `token`
prefilters the vault list to vaults whose `asset.symbol` matches. Produced by the portfolio
AssetDetailSheet earn action.
