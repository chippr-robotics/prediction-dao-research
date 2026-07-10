# Data Model: Connected Account Portfolio

**Feature**: 044-connected-account-portfolio | **Date**: 2026-07-10

All entities are client-side view/config models — nothing is persisted.

## TaxonomyCategory (config, `assetTaxonomy.js`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | `digital-commodities` \| `digital-securities` \| `payment-stablecoins` \| `digital-tools` \| `digital-collectibles` \| `unclassified` |
| `label` | string | Display name (e.g. "Digital Commodities") |
| `description` | string | Member-facing plain-language regulatory definition (from spec FR-004) |
| `order` | number | Display order; `unclassified` always last |

Validation: exactly five regulatory categories + the `unclassified` fallback; ids are
stable (used in tests, CSS hooks, aria wiring).

## RegistryAsset (config, produced by `getPortfolioRegistry(chainId)`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable per-chain key: `native` or lowercased contract address |
| `chainId` | number | Owning network — entries never cross chains (FR-007) |
| `kind` | string | `native` \| `erc20` \| `nft` (nft = balanceOf item count, FR-011) |
| `address` | string\|null | Contract address; `null` for native |
| `symbol` | string | e.g. `MATIC`, `USDC`, `FWMV` |
| `name` | string | e.g. `USD Coin` |
| `decimals` | number\|null | Fungibles only; `null` for `nft` |
| `categoryId` | string | TaxonomyCategory id (may be `unclassified`) |
| `source` | string | `sec-baseline` \| `curated-registry` \| `app-config` (FR-006) |

Rules:
- Merge precedence when the same address appears in more than one source:
  `sec-baseline` > `curated-registry` > `app-config` (FR-006); the winning source is
  reported on the row.
- Addresses resolve from `config/networks.js` (`stablecoin`, `dex.wnative`,
  `nativeCurrency`) and `config/contracts.js#getContractAddressForChain('wmatic'|'membershipVoucher', chainId)`;
  curated entries are bundled config data with provenance comments.
- Unresolvable entries (e.g. no `membershipVoucher` deployed on the chain) are omitted —
  never emitted with an empty address.

## Holding (runtime, `usePortfolio`)

| Field | Type | Notes |
|-------|------|-------|
| `asset` | RegistryAsset | — |
| `balance` | number | Human units (`formatUnits`); item count for `nft` |
| `balanceRaw` | bigint | Raw chain value |
| `usd` | number\|null | `null` = price unavailable → excluded from totals (FR-010) |

Rules: only assets with `balanceRaw > 0n` become holdings (zero-balance registry assets
are not "held"); a failed read produces **no** Holding — the failure is reported via
`failedAssets`, never rendered as zero.

## PortfolioSnapshot (runtime, `usePortfolio` return)

| Field | Type | Notes |
|-------|------|-------|
| `holdings` | Holding[] | All discovered holdings for `address`@`chainId` |
| `categories` | CategoryGroup[] | Ordered; every regulatory category always present, `unclassified` only when non-empty |
| `totalUsd` | number | Sum of priced holdings only |
| `isPartial` | boolean | true when any holding is unpriced OR any read failed |
| `failedAssets` | string[] | Symbols of registry assets whose read failed |
| `status` | string | `disconnected` \| `loading` \| `ready` \| `error` (FR-014) |
| `error` | string\|null | Set when every read failed / provider unavailable |
| `lastUpdated` | number\|null | Epoch ms of last successful load |
| `refresh` | function | Manual reload (FR-015) |

### CategoryGroup (derived)

| Field | Type | Notes |
|-------|------|-------|
| `category` | TaxonomyCategory | — |
| `holdings` | Holding[] | Possibly empty (explicit empty state) |
| `subtotalUsd` | number | Priced holdings only |
| `isPartial` | boolean | Any unpriced holding in the group |

## State transitions

```
disconnected ──connect──▶ loading ──all reads settle──▶ ready (isPartial?)
     ▲                        │
     │                        └──every read fails──▶ error ──retry──▶ loading
     └──disconnect (from any state; snapshot cleared)

chainId/address change (any state) ──▶ snapshot cleared ──▶ loading   (SC-004)
```
