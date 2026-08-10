# Phase 1 Data Model: Universal Asset Selector

No persisted data and no on-chain schema. These are the in-memory shapes the
frontend selector operates on, all derived from existing sources (portfolio
holdings, network config, the send engine's quotes). Field names mirror what
`TransferForm`/`useTransfer`/`AssetLogo` already use so the extraction is a
straight generalization.

## SelectableAsset

One choosable option in the selector. Built by `useSelectableAssets` from held
holdings plus the connected network's always-present defaults.

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `key` | string | derived | Stable id `${chainId}:${registryId}` (registryId = `native`, lowercased token address, or `btc-native`'s `bitcoin:native`). Dedupe + selection key. |
| `chainId` | number \| string | holding / network | EVM numeric chainId, or a Bitcoin string network id (`'bitcoin'`). Consumers guard the string case with `isBitcoinNetworkId`. |
| `kind` | `'native'` \| `'erc20'` \| `'btc-native'` | holding | Drives routing branch + activity eligibility. |
| `address` | string \| null | holding | Token contract address; `null` for native and Bitcoin. |
| `symbol` | string | holding / config | e.g. `USDC`, `WBTC`, `BTC`. Always shown as text (a11y). |
| `name` | string | holding / config | Human name; used by the send engine's ledger record. |
| `decimals` | number | holding / config | For amount parsing at send time. |
| `networkName` | string | network config | Shown as the row's network label; e.g. `Polygon`, `Bitcoin`. |
| `balance` | number \| null | balances | Held amount; `null` = still loading (shown as pending, never fake-zero). |
| `gasless` | boolean | `quoteGaslessForAsset` (via `isGasless(option)`) | Per-asset gasless truth; Bitcoin is always `false`. Rendered as ⚡ marker. |

**Derivation rules** (from research R1/R7):
- Always include the connected chain's native + stablecoin (even at `balance: 0`)
  so a form is usable before balances load.
- Include native Bitcoin only when `useBitcoinWallet().status === 'ready'` and the
  acting account is personal (vaults/legacy EVM accounts can't hold BTC).
- Include every `native`/`erc20` holding from the acting source
  (`usePortfolio` personal, else `useAccountAssets(actingAddress)`); keep
  zero-balance only for native + the connected stablecoin, drop other zero rows.
- Sort connected-chain-first, then by descending balance.

**Validation / invariants**:
- An option is never emitted for a chain with no network config (edge case
  "unreachable/unsupported network").
- `key` is unique; later same-key inserts merge (defaults merge with their held row).
- When the currently-selected `key` is absent from the freshly computed list, the
  consumer falls back: connected stablecoin → connected native → first option
  (FR-013).

## ActivityCapabilityProfile

Pure policy (in `lib/assets/assetActivity.js`) describing which `SelectableAsset`
kinds an activity may offer. No data storage.

| Activity | Allowed kinds | Excludes | Default selection |
|----------|---------------|----------|-------------------|
| `pay` | `native`, `erc20`, `btc-native` | — | connected stablecoin → native → first |
| `request` | `native`, `erc20`, `btc-native` | — | connected stablecoin → native → first |
| `wager` | `erc20` only | `native`, `btc-native` (non-EVM) | connected stablecoin (USDC) → first erc20 |
| `transfer` | `native`, `erc20`, `btc-native` | — | connected stablecoin → native → first |

**Rules**:
- `filterAssetsForActivity(activity, options)` removes disallowed kinds so an
  unsupported asset never appears in that activity (FR-008). Exclusion is by list
  construction, not a submit-time error.
- `defaultAssetKey(activity, options, { connectedChainId, stableAddress })`
  returns the activity's default per the table (FR-011, FR-013).
- Wager excludes native because the escrow pulls the stake via ERC-20
  `transferFrom`; the on-chain `NotAllowedToken` allowlist is the backstop for a
  held ERC-20 the registry doesn't accept (surfaced as the existing friendly error).

## Relationships

```
usePortfolio / useAccountAssets ─┐
useChainTokens (native+stable) ──┤
useBitcoinWallet (BTC, personal) ┼─▶ useSelectableAssets({ activity, actingAddress })
config/networks + assetTaxonomy ─┘         │  applies ActivityCapabilityProfile
                                            ▼
                                     SelectableAsset[]  ──▶ UniversalAssetSelect (renders AssetLogo per row)
                                            │
                                            ▼  selected SelectableAsset
                        useTransfer.send({ asset }) / buildPaymentRequestUri / createOpenChallenge({ token })
```

Nothing here is new persisted state; every field traces to an existing source, and
the two new shapes are computed, not stored.
