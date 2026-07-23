# Quickstart: Staking Fee Router, Admin Controls & Emergency Pause (spec 066)

A validation/run guide. Implementation details live in the plan, data-model, and contract docs; task
breakdown in `tasks.md` (Phase 2).

## Prerequisites

- Spec 065 staking merged (it is). The spec-060 `FeeRouter` deployed on the target network with a `treasury`
  set.
- `StakingRouter` deployed on the target network (`scripts/deploy/deploy-staking-router.js`) and
  `stake.lido` + `stake.polygon` registered on the FeeRouter; `npm run sync:frontend-contracts` run so
  `getContractAddressForChain('stakingRouter', chainId)` resolves.
- A `STAKING_ADMIN_ROLE` and `GUARDIAN_ROLE` grantee; a `FEE_ADMIN_ROLE` grantee (existing) to set the rate.

## Commands

- Contracts: `npm run compile` · `npm test` (unit) · `npm run test:fork` (Lido/sPOL fee-and-forward) ·
  `npx slither .` / Medusa · `npm run check:storage-layout`.
- Frontend: `npm run test:frontend` · `npm run test:frontend -- staking-admin`.
- Deploy (per network): `node scripts/deploy/deploy-staking-router.js --network <net>` then
  `npm run sync:frontend-contracts:<net>`.

## Scenario 1 — Treasury grows on a liquid stake (US1)

1. As `FEE_ADMIN`, set the `stake.lido` (or `stake.polygon`) rate (e.g. 50 bps) in the AdminPanel **Fees** tab.
2. As a member, open Earn → Stake, pick the Lido (ETH) or sPOL (POL) option. **Expect** a fee line showing
   the rate and the net amount to be staked, before signing.
3. Confirm. **Expect** (fork/manual): the treasury balance increased by exactly the disclosed fee, the net
   was staked with the provider, the member received wstETH/sPOL, and the member was charged no more than the
   quoted rate. A `LiquidStaked` event is emitted.
4. Set the rate to 0. **Expect** no fee line and byte-identical fee-free staking (SC-003).

## Scenario 2 — Emergency pause never traps funds (US2)

1. As `GUARDIAN`, open the AdminPanel **Staking** tab and pause the network. **Expect** the member Stake
   area stops offering new stakes and shows the honest unavailable state within one refresh, no redeploy.
2. As a member with an existing position, **expect** unstake/withdraw/claim still work (a liquid stake
   entrypoint reverts `Paused`; exits are unaffected because they never touch the router).
3. Resume. **Expect** new stakes offered again. **Expect** both actions in the tab’s on-chain history.

## Scenario 3 — Provider address + validator lifecycle (US3/US4)

1. As `STAKING_ADMIN`, change a provider address (e.g. `setSpolContracts`) — invalid/zero input is rejected
   before the wallet prompt. **Expect** the member flow uses the new address; the change is in history.
2. Add and remove a validator. **Expect** a removed validator is no longer offered for **new** delegations
   while a member already delegated to it can still unstake; a duplicate/absent entry is rejected. Changes
   appear in history.

## Scenario 4 — Least privilege + audit (US5)

1. A no-role account: **expect** no Staking tab and no control action possible.
2. A `GUARDIAN`-only account: **expect** pause/resume but no address/allowlist edits.
3. A `STAKING_ADMIN` account: **expect** address/allowlist edits but the fee rate is read-only (edited in the
   Fees tab by `FEE_ADMIN`). **Expect** every action attributable in history.

## Scenario 5 — Safe fallback (edge)

1. On a network with **no** `StakingRouter` deployed, open Earn → Stake. **Expect** staking works exactly as
   spec 065 (fee-free, direct, availability as configured) — no broken screen, no fee line.
2. Force the fee/router read to fail on a network that HAS a router. **Expect** the fee-bearing path is
   blocked with an honest message (never a guessed/lower rate); exits remain available.

## Done when

- Scenarios 1–5 pass (fork + dev app / test layer).
- `npm test` + `npm run test:fork` + Slither/Medusa + `check:storage-layout` green; smart-contract security
  review complete. `npm run test:frontend` green (admin tab, config→router read, stake branch, fee line, axe).
- Operator runbook (`docs/runbooks/staking-operations.md`) published incl. the emergency pause procedure.
