# Quickstart & Validation Guide: ZK-Wager Pools

**Feature**: 034-zk-wager-pools | Phase 1

A runnable validation guide proving the feature works end-to-end. Implementation details live
in `tasks.md` / the implementation phase; this is the **what to run and what to expect** guide.

## Prerequisites

- Repo deps installed (`npm install`); add `@semaphore-protocol/contracts` (Solidity) and
  `@semaphore-protocol/identity` `/group` `/proof` (frontend).
- Local Hardhat node, or Amoy (80002) with: the canonical Semaphore V4 singleton (verify the
  address on-chain first — research §3), native USDC `0x41E9…`, and the shared
  `sanctionsGuard` + `membershipManager` from `deployments/polygon-amoy-*-v2.json`.
- For tests, the local mocks: `MockERC20`/`MockUSDCPermit`, `MockSemaphoreVerifier`,
  `MockSanctionsOracle`.
- Pin `evmVersion: "shanghai"` for any Mordor/ETC build.

## P1 — Core pool lifecycle (contracts)

```bash
npm run compile
npm test                     # unit: factory, pool, lifecycle, resolution, refund
npm run test:coverage        # resolution/claim/refund/timeout paths covered (constitution II)
npm run check:storage-layout # factory registered & append-only
npx hardhat test test/zkpools/ --grep "gas"   # confirm validateProof ~const, addMember cost
```

**Expected**:
1. `createPool` screens the creator (sanctions+membership), assigns a unique 4-word index
   tuple, creates a Semaphore group, and clones an immutable pool → `PoolCreated` emitted with
   `wordIndices`.
2. Two+ members `join` (after USDC approve): stake escrowed, `addMember` inserts the
   commitment, `memberCount` increments; a sanctioned or over-limit wallet is rejected with no
   fund movement.
3. Joining closes on full / `closeJoining` / `joinDeadline` → `frozenDenominator` captured.
4. Creator `proposeOutcome(proposalId)`; members `approve` with valid Semaphore proofs;
   a reused nullifier reverts; at `ceil(frozenDenominator * thresholdBips / 10000)` approvals
   the outcome locks (`OutcomeLocked`).
5. A winner `claim`s to a fresh address (unlinkable to their join wallet); double-claim
   reverts.
6. A pool that never locks within `resolutionWindow` lets every member `refund` their buy-in;
   a pre-fill `cancel` refunds all. No escrow path exists outside claim/refund.

## P1 — Gateway, nicknames, settings (frontend)

```bash
npm run test:frontend        # gateway parse/resolve, nickname derivation, language selector
npm run frontend             # manual: dashboard → "Group Pool" quick action
```

**Expected**:
- The new **Group Pool** quick action routes to `/pools/create`; creating returns a 4-word
  phrase.
- Entering the 4 words on another session resolves the same pool and shows buy-in / members /
  slots before funds; an invalid or stale phrase shows a clear message.
- Joining shows a stable two-word nickname; the same identity yields the same nickname.
- **My Account** word-list language selector changes the language of generated/parsed phrases;
  a phrase made in one language resolves the same pool under another (SC-008).

## P2 — Gasless join (additive)

```bash
npm test -- --grep "joinWithAuthorization"   # EIP-3009 path, replay, expiry
# Payload Packer + relayer validated against Amoy (manual / integration env)
```

**Expected**: a wallet holding only USDC (no native gas) joins with a single signature; the
packer refuses joins from sanctioned/over-limit wallets; expired authorizations are rejected;
a relayer outage moves no funds and informs the client; a replayed authorization does not
double-charge.

## P3 — Live leaderboard (additive)

```bash
npm run test:frontend -- --grep "leaderboard"
```

**Expected**: creator updates scores / eliminations by nickname; members see standings update
in near real time with no transaction; interim standings are clearly marked non-final.

## Subgraph

```bash
cd subgraph && npm run codegen && npm run build:amoy
npm test                     # matchstick: handlePoolCreated spins up Pool template
```

**Expected**: a `PoolCreated` event instantiates a dynamic `ZKWagerPool` data source that
indexes that clone's joins/proposals/approvals/payouts into GraphQL entities, scoped to the
active network.

## Deploy (Amoy first; ETC deferred)

```bash
npx hardhat run scripts/deploy/deploy-zk-wager-pool-factory.js --network amoy
# authorize the factory/pool on MembershipManager (setAuthorizedCaller) — runbook step
npm run sync:frontend-contracts -- --network amoy --chainId 80002
```

**Expected**: `deployments/polygon-amoy-*-v2.json` gains `zkWagerPoolFactory`,
`zkWagerPoolFactoryImpl`, `poolImpl`; the frontend resolves
`getContractAddressForChain('zkWagerPoolFactory', 80002)`.

## Acceptance ↔ Success criteria

| Validation step | Spec criteria |
|-----------------|---------------|
| Create → 4 words shared/resolved | SC-001, SC-002, SC-003 |
| Vote unlinkable, one-per-member | SC-004, SC-005 |
| Quorum locks, winner claims, no double-claim | SC-006, SC-013 |
| Timeout always refunds | SC-007 |
| ≥4 languages, cross-language resolve | SC-008 |
| Gasless single-signature join (P2) | SC-009 |
| Live standings, no tx (P3) | SC-010 |
| Bounded state, constant verify cost | SC-011, SC-012 |
