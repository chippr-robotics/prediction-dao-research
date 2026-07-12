# Quickstart Validation: Wager Tag Naming Registry (spec 054)

Runnable scenarios proving the feature end-to-end. Interfaces:
[contracts/wager-tag-registry-interface.md](./contracts/wager-tag-registry-interface.md);
entities/transitions: [data-model.md](./data-model.md).

## Prerequisites

```bash
npm install
npm run compile
```

## 1. Contract suite

```bash
npx hardhat test test/wagerTagRegistry.test.js test/wagerTagRegistry.intents.test.js
npm run check:storage-layout        # must include the new wagerTagRegistry pair
npm test                            # full suite stays green
```

Expected coverage (must all pass):

- **Register (US1)**: commit → wait `minCommitmentAge` → register succeeds; duplicate /
  reserved / bad-format / no-membership / sanctioned / uncommitted / too-fresh / expired-
  commitment registrations revert; front-run of a committed name fails (FR-006).
- **Resolve (US2)**: `resolve` returns owner + ACTIVE; unknown tag → NONE (never a
  near-match); reverse `tagOf` matches forward (FR-008 invariant).
- **Lifecycle (US4)**: release → QUARANTINED (register by others reverts until
  `quarantinePeriod` elapses, then succeeds); `changeTag` inside `changeCooldown` reverts;
  repoint: REPOINTING during delay (resolve refuses value-bearing status), cancellable,
  finalizable by anyone after delay, reverse index moves atomically.
- **Lapse (US4/FR-021)**: membership expired < grace → still ACTIVE; expired > grace →
  LAPSED_RECLAIMABLE; `reclaimLapsed` → QUARANTINED.
- **Moderation (US5)**: reserved-term registration reverts; suspend stops resolution
  without touching ownership; verification flag round-trips; no code path moves a tag to a
  non-owner-authorized address (attempted-admin-transfer test).
- **Intents**: each `…WithSig` twin executes for a valid signature and reverts on replay,
  expiry, and signer≠owner (spec 035 conventions).

## 2. Static analysis / fuzzing (constitution I)

```bash
npm run slither          # no new high/critical findings
# Medusa fuzz targets: register/release/repoint/reclaim state machine invariants:
#   - one owner per tag, one tag per owner, forward==reverse,
#   - no resolution while QUARANTINED/REPOINTING/SUSPENDED,
#   - quarantine and delay timestamps never shortened by any call sequence.
```

## 3. Frontend

```bash
npm run test:frontend    # includes new suites below
```

- `lib/tags/normalizeTag` — normalization/validation table tests (mirrors on-chain rules,
  including `%` stripping, casing, hyphen edge cases).
- `useWagerTag` + `useOpponentName` — priority chain: book > tag > ENS > generated
  (FR-014); registry error → chain falls through (FR-013).
- `AddressInput` — `%tag` entry resolves and shows full address + badge; non-ACTIVE
  statuses are not committable (FR-011/FR-022); raw address entry unaffected.
- `WagerTagPanel` — register/change/release/repoint flows with windows surfaced; axe
  accessibility assertions (constitution V).

## 4. Manual end-to-end (dev chain)

```bash
npx hardhat node
npx hardhat run scripts/deploy/deploy.js --network localhost          # stack incl. membership
npx hardhat run scripts/deploy/deploy-wager-tag-registry.js --network localhost
npm run sync:frontend-contracts && npm run frontend
```

1. Buy/seed a membership for wallet A → account settings → register `%testbot`
   (two-step UI; second step enabled after the commit ages).
2. Wallet B: create a wager, type `%testbot` in the opponent field → confirmation shows
   A's full address; complete the flow.
3. Wallet A: request repoint to a new address → B's resolution of `%testbot` now refuses
   with "address changing"; cancel → resolves again.
4. Release the tag from A → wallet B registering `%testbot` fails ("quarantined").
5. Kill the local RPC → address fields still accept raw addresses; counterparty cards fall
   back to book/ENS/generated names (FR-013).

## Success criteria mapping

SC-001/002 → scenario 4 steps 1–2 (timed); SC-003 → reserved/confusable revert tests;
SC-004 → quarantine tests + step 4; SC-005 → exact-match tests; SC-006 → priority-chain
tests; SC-007 → AddressInput confirmation tests + step 2; SC-008 → degradation tests +
step 5; SC-009 → repoint tests + step 3.
