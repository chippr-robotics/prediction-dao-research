# Quickstart: Earn — Liquid & Delegated Staking (spec 065)

A validation/run guide proving the feature works end-to-end. Implementation details live in the plan,
data-model, contracts, and (Phase 2) `tasks.md`. Staking is a **view inside the Earn tab**:
`/wallet?tab=earn&view=stake`.

## Prerequisites

- Existing frontend dev environment (`npm run frontend`).
- A connected account on **Ethereum mainnet (chainId 1)** holding some **ETH** (for Lido liquid) and/or
  **POL** (for sPOL liquid and for Polygon delegation). Chain 1 is the launch staking network.
- `NETWORKS[1].staking` config populated: `liquid` = [Lido (addresses + `referral`), sPOL (token +
  controller)]; `delegated` = Polygon `stakeManager` + `stakingApi` + curated `validators[]` allowlist —
  see `contracts/staking-config.md`.

## Run / build commands

- `npm run frontend` — dev server.
- `npm run test:frontend` — Vitest suite (new tests under `frontend/src/test/staking/`).
- `npm run test:frontend -- staking` — just the staking tests.
- Axe: the `*.axe.test.jsx` files run inside the Vitest suite.

## Scenario 1 — Discover Staking and stake (liquid, US1)

1. Open `/wallet?tab=earn`. **Expect**: a live **Stake** area card (not "Coming later").
2. Click Stake. **Expect**: one card per option; the Lido card shows asset **ETH**, model **Liquid**,
   an APR estimate with "as of" freshness, total staked, "Powered by Lido", and that you receive
   **wstETH**. Every term has an InfoTip; a risk disclosure is present.
3. Open the Lido card, enter an amount (Max respects an ETH gas reserve), review the summary (wstETH
   received; value grows vs ETH; no fee line while fee-free), confirm in wallet.
4. **Expect**: success state with tx link; the position appears with staked value + wstETH held; an
   activity-feed entry and a `STAKING`-class ledger entry are recorded.
5. Repeat for the **sPOL** card (POL → Liquid): stake POL, hold **sPOL** (value-accruing). **Expect**
   the option discloses that its value grows vs POL, that Polygon (not FairWins) takes a reward-fee, and
   that exit is either a ~3–4 day unbonding **or** an instant DEX swap. On the sPOL exit flow, **expect**
   both paths presented honestly (the swap shows its price impact; the queue path is never called
   "instant"); a matured `sellSPOL` nonce enables `withdrawPOL`.

## Scenario 2 — Delegate + honest unbonding (delegated, US1/US2)

1. Stake area → a **Delegated** card for a curated Polygon validator: asset **POL**, commission, APR
   estimate, total staked, and an **unbonding period** line (e.g. "~2–4 days"). 
2. Delegate an amount → confirm. **Expect**: `buyVoucherPOL` executes; position shows delegated POL +
   claimable rewards (once accrued).
3. Choose **Unstake**. **Expect**: the UI shows the unbonding wait and requires acknowledgement before
   the wallet prompt (no implication of instant funds). After confirm, an `unstake-requested` entry is
   recorded and a pending `UnstakeRequest` (unbond nonce) is tracked.
4. Simulate the unbonding elapsing (test layer). **Expect**: a **"ready to withdraw"** state and an
   **actionable** notification that is delivered even under a focused notification profile.
5. Withdraw → `unstakeClaimTokens_newPOL`. **Expect**: POL returns; the request clears; a `withdraw`
   ledger entry is recorded.

## Scenario 3 — Rewards claim (delegated, US2)

1. With accrued delegated rewards, open the position → **Claim**. **Expect**: `withdrawRewardsPOL`
   transfers POL; claimable updates; a `rewards-claimed` entry is recorded. (Liquid options show **no**
   Claim action — rewards accrue into wstETH's value.)

## Scenario 4 — Portfolio + wiring (US3)

1. Portfolio → open an **ETH** (or **POL**) asset detail sheet. **Expect**: the **Stake** action is now
   enabled and deep-links to the Stake area scoped to that asset. For a non-stakeable asset/network it
   stays disabled with a plain reason.
2. Notification preferences → **Expect** a **Staking** category selectable alongside the others.
3. Financial activity ledger / tax report → **Expect** every stake/unstake/withdraw/claim present with a
   working tx link.

## Scenario 5 — Honest unavailable (edge)

1. Switch to Polygon (137), Ethereum Classic, or Bitcoin. Open Earn → Stake. **Expect**: an honest
   "not available on this network" explanation naming where staking is available (from
   `getStakingNetworks()`) — no mock options, no dead buttons. (Chain 137's native sPOL deposit path
   via `sPOLChild` is a documented follow-up; at launch staking runs on chain 1.)
2. Force the Lido APR API / Polygon staking API to fail (and sPOL rate reads). **Expect**: the affected
   option shows "temporarily unavailable" and new stakes are disabled — never fake zeros/APR.

## Done when

- Scenarios 1–5 pass in the dev app with real chain-1 providers (or simulated data at the test layer).
- `npm run test:frontend` green including new unit/component/axe tests.
- Docs published (`docs/user-guide/staking.md`) and linked from the Stake area.
