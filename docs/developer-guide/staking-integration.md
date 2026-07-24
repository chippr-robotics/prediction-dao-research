# Staking Integration (spec 065)

Liquid & delegated staking is a **frontend-only** feature (no `contracts/`
changes) inside the Earn section, mirroring the lending integration (spec 050).
It calls audited third-party protocols from the member's own wallet via the
spec-041 unified send rail. Launch network: **Ethereum mainnet (chainId 1)**.

## Architecture

Config-gated capability → lib → hooks → a view + bottom sheet hosted at
`/wallet?tab=earn&view=stake`, plus a notification source and a ledger source.

- **Config** — `frontend/src/config/staking.js` (provider addresses, curated
  validator allowlist, `stakingPath()`), and a `staking` block on chain 1 in
  `frontend/src/config/networks.js` with `capabilities.staking` and the helpers
  `isStakingAvailable` / `getStakingConfig` / `getStakingNetworks`.
- **ABIs** — `abis/LidoStETH.js`, `LidoWstETH.js`, `LidoWithdrawalQueue.js`,
  `SPOLController.js`, `PolygonValidatorShare.js`, `PolygonStakeManager.js`.
- **Libs** — `lib/staking/`: `lidoStaking.js`, `spolStaking.js`,
  `polygonDelegation.js` (build `{target,data,value}` call batches + on-chain
  reads), `stakingActions.js` (validation + gas reserve + provider dispatch),
  `pendingUnbonds.js`, `stakingCopy.js`, `stakingActivityBuffer.js`.
- **Hooks** — `useStakingOptions` (normalized option list + best-effort
  enrichment), `useStakingPositions` (on-chain positions + exit/ready detection,
  60s poll), `useStakingActions` (stake/unstake/withdraw/claim via `useEarnSend`).
- **UI** — `components/earn/StakeView.jsx`, `StakeSheet.jsx`,
  `StakingPositionsList.jsx`; the Earn hub's Stake area is now live.
- **Wiring** — notification domain/category + `data/notifications/sources/stakingSource.js`;
  ledger `STAKING` class + `data/ledger/sources/stakingLedgerSource.js`
  (`captureStakingAction`); the portfolio asset sheet's Stake action.

## Providers

| Model | Asset | Provider | Where | Exit |
|---|---|---|---|---|
| Liquid | ETH | Lido (wstETH) | L1 | Withdrawal Queue (finalized → claim) |
| Liquid | POL | sPOL (Polygon official LST) | L1 mint | sellSPOL → unbond → withdrawPOL, or instant DEX swap |
| Delegated | POL | Polygon ValidatorShare | L1 | sellVoucherPOL → unbond → unstakeClaimTokens_newPOL |

sPOL and Polygon delegation execute on Ethereum L1 (the Polygon staking
contracts live there). See `specs/065-liquid-delegated-staking/contracts/` for
the exact methods and status-detection.

## Curated validator allowlist (FR-008)

Delegated targets are a fixed, curated allowlist in
`config/staking.js#CURATED_POLYGON_VALIDATORS` — never free-form. The Polygon
staking API only **decorates** allowlisted entries (commission/status); it never
expands the list.

**Build-time revalidation (required):** commission and validator state are live
per-checkpoint. Before shipping a config change, re-read
`https://staking-api.polygon.technology/api/v2/validators` for each `validatorId`
and confirm it is still `HEALTHY` + `delegationEnabled` with unchanged
commission; each `validatorShare` is run through `getAddress()` at load. Verify
the Lido/sPOL/POL/StakeManager addresses against the Lido deployed-contracts page
and `0xPolygon/spol-contracts` too.

## Fees & admin controls (spec 066 — StakingRouter)

Spec 066 adds the **StakingRouter** — a per-network UUPS control surface
(`contracts/staking/StakingRouter.sol`, deployment keys `stakingRouter` /
`stakingRouterImpl`) — that both governs the staking service and charges the
platform fee on **liquid** staking.

**Fee (liquid only).** The fee **rate** stays the single spec-060 `FeeRouter`
source of truth: per-provider services `stake.lido` / `stake.polygon`
(`FEE_SERVICES.STAKE_LIDO` / `STAKE_POLYGON`), each ConfigOnly, cap **250 bps**,
rate 0 until set from the Fees tab (`FEE_ADMIN_ROLE`). None of Lido `submit` /
sPOL `buySPOL` are ERC-4626 deposits, so the FeeRouter's `depositToVaultWithFee`
doesn't fit; instead the StakingRouter reads `quoteFee` / `feeBps` / `treasury()`
and does the fee-and-forward itself — skim to the treasury, forward the net to the
provider, return the LST — atomically, with a `maxFeeBps` consent ceiling
(`FeeAboveQuoted`) and a no-residual invariant (`ResidualFunds`). A zero/unset rate
is byte-identical to fee-free (SC-003).

**Delegated is fee-free in v1.** Polygon `buyVoucherPOL` binds the delegation to
`msg.sender`, so a router call would make the router the (custodial, un-exitable)
delegator. Delegated staying a direct member call is the only non-custodial option,
so it ships **fee-free**; the router still governs its allowlist + pause. Provider
protocol fees (Lido's ~10% of rewards, sPOL's `rewardFee`) are the provider's and
disclosed as such.

**Runtime read + fallback.** `useStakingOptions` overlays the router's provider
addresses, validator allowlist, `paused` flag, and the per-provider fee onto the
spec-065 options (`lib/staking/stakingRouter.js`, `overlayRouterConfig`). When the
router is undeployed or unreadable it keeps the spec-065 build-time constants
verbatim — fee-free, direct staking — never a broken or fee-guessing screen
(FR-009). `stakingActions.buildStakeForOption` routes through the router only when a
fee applies; otherwise it emits the byte-identical direct calls.

**Governance & ops.** `STAKING_ADMIN_ROLE` (provider addresses + validator
allowlist) and `GUARDIAN_ROLE` (emergency pause) are held by a **multisig** with
**no timelock** (FR-018). Operators drive it from the AdminPanel **Staking** tab;
the fee rate is read-only there and edited in the **Fees** tab. See
`docs/runbooks/staking-operations.md`.

## Adding a network or provider

Add a `staking` block to the target network in `networks.js` (only where a real,
deposits-open provider exists) with the provider's addresses; the capability and
helpers pick it up automatically. A follow-up is the Polygon-PoS-native sPOL
deposit path via `sPOLChild` (chainId 137, cross-chain settle) — see research.md
R2.
