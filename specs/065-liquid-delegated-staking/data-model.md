# Data Model: Earn — Liquid & Delegated Staking (spec 065)

All models are client-side normalized shapes (plain objects) produced by `lib/staking/*` and consumed
by hooks/components. Amounts are kept as `bigint` (raw units) alongside `decimals`; formatting happens
at the edge. Every model is scoped to one `chainId` — nothing crosses networks. Launch chain: `1`.

## StakingNetworkConfig (`networks.js` → `staking` block)

| Field | Type | Notes |
|---|---|---|
| `liquid` | `{ provider: {name,url}, referral: address, contracts: {steth, wsteth, withdrawalQueue}, aprApi: url }` \| null | Lido config; null ⇒ no liquid option on this chain |
| `delegated` | `{ provider: {name,url}, stakeManager: address, stakingApi: url, validators: ValidatorAllowlistEntry[] }` \| null | Polygon delegation config; null ⇒ no delegated option |

Derived: `capabilities.staking === Boolean(this.staking)`. Helpers: `isStakingAvailable(chainId)`,
`getStakingConfig(chainId)`, `getStakingNetworks()` (staking-enabled network names for honest copy).
Validation: block present only on chains with a real, deposits-open provider (chain `1` at launch).

## ValidatorAllowlistEntry (`config/staking.js`, curated — the hard boundary, FR-008)

| Field | Type | Notes |
|---|---|---|
| `validatorId` | number | Polygon validator id |
| `validatorShare` | address | per-validator ValidatorShare contract (the `buyVoucherPOL` target) |
| `name` | string | display name |

Live `commissionPercent`, `totalStaked`, `status`, `delegationEnabled`, computed APR are fetched from
the Polygon staking API at runtime and merged **only onto allowlisted entries** — the API decorates,
never expands, the list.

## StakingOption (normalized; one card in the Stake list)

| Field | Type | Source | Notes |
|---|---|---|---|
| `id` | string | derived | `liquid:lido` or `delegated:<validatorId>` |
| `chainId` | number | config | must equal active chain (guard) |
| `model` | `'liquid' \| 'delegated'` | config | drives layout + copy |
| `asset` | `{ symbol, decimals, name, address? }` | config | staked asset (ETH / POL) |
| `provider` | `{ name, url }` | config | attribution + outbound link |
| `validatorName` | string \| null | API | delegated only |
| `rewardRateApr` | number \| null | API/Lido | fraction (0.034 = 3.4%); null → "—" (honest) |
| `totalStaked` | `{ raw: bigint, usd: number \| null }` | on-chain/API | "total staked" display |
| `lstSymbol` | string \| null | config | liquid only (e.g. `wstETH`) |
| `unbondingLabel` | string \| null | on-chain | delegated only, e.g. "~2–4 days (80 checkpoints)" from `withdrawalDelay()` |
| `commissionPct` | number \| null | API | delegated only |
| `minStakeRaw` / `maxStakeRaw` | bigint \| null | config | Lido queue bounds; provider minimums |
| `status` | `'accepting' \| 'closed'` | config/API | closed ⇒ shown read-only (exit-only) |

List status ∈ `loading | ready | unavailable` (fetch failure ⇒ `unavailable`, new stakes disabled —
never stale numbers as truth).

## StakingPosition (per member × option)

| Field | Type | Source | Notes |
|---|---|---|---|
| `option` | StakingOption ref | — | |
| `model` | `'liquid' \| 'delegated'` | — | |
| `stakedRaw` | bigint | on-chain | liquid: wstETH→underlying via `stEthPerToken`; delegated: `getTotalStake` |
| `lstBalanceRaw` | bigint \| null | on-chain `balanceOf` | liquid only (wstETH held) |
| `currentValueUsd` | number \| null | price feed | null → "—" (honest) |
| `rewardsClaimableRaw` | bigint \| null | on-chain `getLiquidRewards` | delegated only; null when N/A (liquid accrues into LST) |
| `pendingUnbonds` | UnstakeRequest[] | store + on-chain | in-flight exits |
| `hasReadyWithdrawal` | boolean | derived | any `UnstakeRequest.ready === true` |
| `fetchedAt` | number | client clock | drives freshness copy |

Transitions: stake ⇒ staked↑ / lst↑; unstake ⇒ opens an `UnstakeRequest` (staked↓ for delegated);
withdraw ⇒ request cleared, funds returned. Poll 60s (aligned with `useEarnPositions`), scoped to
active chain + connected account. "Has position" = `stakedRaw > 0n || pendingUnbonds.length > 0`.

## UnstakeRequest (pending exit — persisted in `lib/staking/pendingUnbonds.js`)

| Field | Type | Source | Notes |
|---|---|---|---|
| `optionId` | string | — | which option this exit belongs to |
| `model` | `'liquid' \| 'delegated'` | — | |
| `handle` | `{ requestId }` \| `{ unbondNonce }` | on-chain | Lido ERC-721 id OR Polygon unbond nonce |
| `amountRaw` | bigint | tx | amount exiting |
| `initiatedAt` | number | tx receipt | device time |
| `readyAt` | number \| null | derived | estimated ready time (for copy) |
| `ready` | boolean | on-chain | Lido: `isFinalized && !isClaimed`; Polygon: `withdrawEpoch + withdrawalDelay() <= epoch()` |
| `claimed` | boolean | on-chain/store | cleared after withdraw |

Persisted per (account, chain) so "ready to withdraw" survives reloads. Idempotent: re-adding a known
handle is a no-op; a claimed request is pruned.

## StakingRewardBalance (delegated, where separately claimable)

| Field | Type | Source | Notes |
|---|---|---|---|
| `optionId` | string | — | |
| `rewardAsset` | `{ symbol, decimals }` | config | POL |
| `claimableRaw` | bigint | on-chain `getLiquidRewards` | |
| `fetchedAt` | number | client clock | freshness |

Liquid staking has **no** separate reward claim (rewards accrue into the LST's value) — the UI shows
no Claim action for liquid options. Status ∈ `loading | ready | unavailable`.

## StakingActivityEntry (spec 031 entry shape, `domain: 'staking'`)

| Field | Value |
|---|---|
| `id` | stable: `staking:<chainId>:<type>:<optionId>:<txHash \| handle \| snapshotEpoch>` |
| `domain` | `'staking'` (new `DOMAIN_META` entry: label "Staking") |
| `refId` | option id (positions) or validatorShare/wsteth address |
| `type` | `stake` \| `unstake-requested` \| `withdraw` \| `rewards-claimed` \| `unbond-ready` \| `position-changed` |
| `message` | plain language incl. amount + asset + provider/validator + model |
| `severity` | `info` |
| `actionable` | `true` **only** for `unbond-ready` (breaks through notification profiles, FR-012); else `false` |
| `link` | tx explorer URL (action rider) or the stake view path (poll-detected) |
| `createdAt` / `read` | per contract |

Source snapshots per (account, chain): `{ [optionId]: stakedString }` and the persisted
`UnstakeRequest[]` ready-state — first-sight = baseline, idempotent, `ok:false` on hard failure
(per `sources/README.md`).

## StakingLedgerRecord (spec 051, `class: 'staking'`, provenance `client`)

`captureStakingAction(account, chainId, { type, txHash, at, optionId, model, amountRaw, tokenSymbol,
tokenDecimals, counterparty, description })` maps action types to ledger kind + direction:

| action `type` | `kind` | `direction` |
|---|---|---|
| `stake` | `stake` | `out` |
| `unstake-requested` | `unstake_request` | `none` |
| `withdraw` | `unstake_withdraw` | `in` |
| `rewards-claimed` | `reward_claim` | `in` |

`entryId = clientEntryId('staking:<chainId>:<type>:<txHash>')` (idempotent). Records carry the real
`txHash` (chain-verifiable), `class: LEDGER_CLASS.STAKING`, and travel in the encrypted backup.
`createStakingLedgerSource()` filters client records by `LEDGER_CLASS.STAKING`. Positions changed
outside this app are a disclosed gap (the notification snapshot-diff backstop still surfaces them).

## Deep-link contract

`/wallet?tab=earn&view=stake[&chain=<chainId>][&token=<symbol>]` — `chain` is a hint (the UI operates
on the active wallet network and shows a switch prompt when they differ); `token` prefilters the
option list to options whose `asset.symbol` matches (ETH → liquid; POL → delegated). Produced by the
portfolio `AssetDetailSheet` stake action; built by `stakingPath()` in `config/staking.js`.
