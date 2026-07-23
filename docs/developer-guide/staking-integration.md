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

## Fees

FairWins charges **no** platform fee on staking in this release (byte-identical
to fee-free). None of Lido `submit`, sPOL `buySPOL`, or Polygon `buyVoucher` are
ERC-4626 deposits, so the spec-060 FeeRouter `depositToVaultWithFee` entrypoint
does not fit; a fee-on-input staking router is a new value-bearing contract and
is **deferred to its own spec** (research.md R6). Provider protocol fees (Lido's
~10% of rewards, sPOL's on-chain `rewardFee`) are the provider's and disclosed as
such.

## Adding a network or provider

Add a `staking` block to the target network in `networks.js` (only where a real,
deposits-open provider exists) with the provider's addresses; the capability and
helpers pick it up automatically. A follow-up is the Polygon-PoS-native sPOL
deposit path via `sPOLChild` (chainId 137, cross-chain settle) — see research.md
R2.
