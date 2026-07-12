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

- **Register (US1)**: a Gold-tier caller commits → waits `minCommitmentAge` → register
  succeeds; duplicate / reserved / bad-format / **below-Gold-tier (None/Bronze/Silver)** /
  sanctioned / uncommitted / too-fresh / expired-commitment registrations revert
  (`InsufficientMembershipTier` for the tier case, FR-001); front-run of a committed name
  fails (FR-006). Also assert Platinum succeeds (Gold *and above*).
- **Eligibility & optionality (US1/FR-001/FR-001a)**: exhaustively drive the tier gate —
  None/Bronze/Silver revert, Gold/Platinum pass; and assert a **tagless** account completes a
  full wager create/accept, pool join, transfer, and address-book add with no tag required
  (SC-011), and that a Gold member who lets their tier lapse keeps the tag through grace but
  is refused a *new* register/change until Gold again while repoint still works (US4 edge).
- **Resolve (US2)**: `resolve` returns owner + ACTIVE; unknown tag → NONE (never a
  near-match); reverse `tagOf` matches forward (FR-008 invariant).
- **Lifecycle (US4)**: release → QUARANTINED (register by others reverts until
  `quarantinePeriod` elapses, then succeeds); `changeTag` inside `changeCooldown` reverts;
  repoint: REPOINTING during delay (resolve refuses value-bearing status), cancellable,
  finalizable by anyone after delay, reverse index moves atomically.
- **Lapse (US4/FR-021)**: Gold membership expired, `expiresAt + lapseGrace` not yet passed →
  still ACTIVE; past `expiresAt + lapseGrace` with tier < Gold → LAPSED_RECLAIMABLE →
  `reclaimLapsed` → QUARANTINED. Also assert the honesty rule: an account **downgraded** below
  Gold while its membership is still unexpired stays ACTIVE (honored to `expiresAt`, no early
  reclaim), matching research R5 / data-model.
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
  statuses are not committable (FR-011/FR-022); raw address entry unaffected and never
  required (FR-009).
- `WagerTagPanel` — register/change/release/repoint flows with windows surfaced; the panel is
  gated on Gold+ (`useRoleDetails('WAGER_PARTICIPANT').tier >= GOLD`) and shows an upgrade
  prompt (not a dead control) to below-Gold members; the `InsufficientMembershipTier` revert
  renders Gold-specific copy, not the Silver open-challenge wording; axe assertions
  (constitution V).

## 4. Manual end-to-end (dev chain)

```bash
npx hardhat node
npx hardhat run scripts/deploy/deploy.js --network localhost          # stack incl. membership
npx hardhat run scripts/deploy/deploy-wager-tag-registry.js --network localhost
npm run sync:frontend-contracts && npm run frontend
```

1. Buy/seed a **Gold (or Platinum)** membership for wallet A → account settings → register
   `%testbot` (two-step UI; second step enabled after the commit ages). Confirm a
   Bronze/Silver wallet sees the upgrade prompt and its register attempt reverts
   `InsufficientMembershipTier`; confirm a tagless wallet can still create a wager/transfer.
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
step 5; SC-009 → repoint tests + step 3; SC-010 → below-Gold tier-gate revert tests
(None/Bronze/Silver) + step 1 upgrade prompt; SC-011 → tagless-account flow tests +
step 1 tagless check.
