# Quickstart: Validate Open-Challenge Wagers

End-to-end validation that the feature works and stays backward compatible. Details live in
[data-model.md](./data-model.md) and [contracts/](./contracts/); this is the run/verify guide.

## Prerequisites

```bash
npm install
npm run compile           # contracts compile with the new functions/events
```

## 1. Contract unit + fuzz (primary gate)

```bash
npm test -- --grep "OpenChallenge"     # test/WagerRegistry.openChallenge.test.js
npm run test:coverage                  # resolution/claim/refund/timeout paths incl. open branch
```

Expected behavior to assert:

- **Create**
  - Allowed resolution types (`Either`, `ThirdParty`, `Polymarket`, `Chainlink*`, `UMA`) succeed; an
    open wager with `Creator` or `Opponent` reverts `OpenResolutionTypeNotAllowed` (FR-016a).
  - Unequal stakes are impossible by construction (single `stake` param) — assert `creatorStake ==
    opponentStake` on the created wager (FR-016b).
  - Zero `claimAuthority` reverts `ZeroClaimAuthority`; a second open wager with the same authority while
    the first is `Open` reverts `ClaimAuthorityInUse` (FR-006a).
  - Creator stake escrowed; `recordCreate` charged; `opponent == address(0)`, `status == Open`;
    `openWagerIdForClaim(authority) == wagerId`; `OpenWagerCreated` emitted.
- **Accept** (taker holds the code; signs with the code key)
  - Valid signature from a member taker → `opponent == taker`, `status == Active`, opponent stake
    escrowed, `openWagerIdForClaim(authority) == 0` (slot freed), `WagerAccepted` emitted (FR-010/FR-012).
  - Wrong-key signature → `BadClaimSignature`; signature for a *different* `taker`/`wagerId` (replay /
    front-run attempt) → `BadClaimSignature` (FR-011, SC-006).
  - Creator accepting own challenge → `SelfWager` (FR-014); named arbitrator accepting a ThirdParty open
    challenge → `ArbitratorCannotTake` (FR-015).
  - Non-member or sanctioned taker → `MembershipDenied` / sanctions revert (FR-013); frozen taker → revert.
  - Two members race with valid signatures → exactly one binds; the second reverts `NotOpenChallenge`
    (status no longer `Open`), no funds taken from the loser (SC-005).
- **Lifecycle / slot release**
  - `cancelOpen` (creator) before accept → stake refunded, `openWagerIdForClaim == 0`, code reusable.
  - After `acceptDeadline` with no taker → `claimRefund` / `batchExpireOpen` refunds creator, releases
    membership slot, clears claim mappings (FR-022).
  - After accept, `declareWinner` / oracle auto-resolve / `declareDraw` / `claimPayout` / `claimRefund`
    behave identically to a named-opponent wager (FR-016, SC-009).
- **Backward compatibility**: the full existing suite passes unchanged (FR-024, SC-008):

```bash
npm test                 # named-opponent create/accept/cancel/decline/resolve/draw/refund/claim green
```

## 2. Fuzz / static analysis

```bash
npm run slither          # no new high/critical findings
# Medusa: open-path invariants — escrow conservation, single-binding, slot-release,
# no accept without a matching claim signature.
```

## 3. Frontend crypto + flows

```bash
npm run test:frontend -- claimCode
```

Assert:
- `deriveFromCode` is deterministic across calls and independent of device; `claimAddress` and `symKey`
  are domain-separated.
- `signOpenAccept` produces a signature that `ECDSA.recover` (mirrored in a JS check) maps back to
  `claimAddress` for the bound `(wagerId, taker)` and **fails** for any other taker.
- `encryptEnvelopeCode` → `decryptEnvelopeCode` round-trips; a tampered ciphertext throws (FR-019); a
  wrong code fails to decrypt and never reveals terms (FR-009/SC-003).
- Wordlist: `generateCode` yields 4 valid words; `isValidCode` rejects wrong length / unknown words.

## 4. Subgraph

```bash
cd subgraph && npm test  # handleOpenWagerCreated: opponent null, status "open"; accept backfills opponent
```

## 5. Manual end-to-end (two browsers / two accounts)

1. **Account A** (member): create an open challenge (oracle or `Either`), copy the four words, note the
   residual-risk + save-the-code notices.
2. **Account B** (member) in a separate session: open "Take a challenge", paste the words → the wager and
   its decrypted terms appear; accept; confirm B is now the opponent and the wager is active.
3. **Account C** without the code: confirm it cannot find or read the wager, and a wrong code is rejected.
4. **Non-member** taker with the code: confirm the buy-membership prompt (Q2) instead of acceptance.
5. Resolve via the wager's configured path and confirm the winner claims the full pot — identical to a
   named-opponent wager.

## Done when

- Contract unit + fuzz + Slither gates pass with no new high/critical findings.
- Frontend `claimCode` + envelope tests pass; subgraph test passes.
- The full pre-existing suite is green (no regression).
- Manual two-account run shows discover → read → accept → resolve works, and non-holders/non-members are
  correctly blocked.
