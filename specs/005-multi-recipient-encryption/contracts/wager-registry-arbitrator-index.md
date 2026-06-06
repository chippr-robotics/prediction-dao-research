# Contract: WagerRegistry — arbitrator discovery index

The single on-chain change. Additive; ships in the 004 draw-resolution **v3** redeploy. No new function, event, error, or storage variable — extends the existing per-user index.

## Change (in `createWager`, Effects section)

```solidity
// existing
_userWagerIds[msg.sender].add(wagerId);   // creator
_userWagerIds[opponent].add(wagerId);     // opponent
// NEW: make the assigned arbitrator able to discover this wager
if (w.arbitrator != address(0)) {
    _userWagerIds[w.arbitrator].add(wagerId);
}
```

`w.arbitrator` is non-zero only for `ThirdParty` wagers (existing create-time validation: `ArbitratorRequired` for ThirdParty; `ArbitratorDisallowed` for other types; arbitrator ≠ creator and ≠ opponent).

## Reads used (unchanged, already in the ABI)

- `getUserWagerIds(address user, uint256 offset, uint256 limit) → uint256[]`
- `getUserWagers(address user, uint256 offset, uint256 limit) → Wager[]`
- `getUserWagerCount(address user) → uint256`
- `getWager(uint256) → Wager` (exposes `arbitrator`, `metadataHash`, `metadataUri`)

## Behavioral contract (must hold)

1. After creating a `ThirdParty` wager naming arbitrator `A`, `getUserWagerIds(A, …)` includes that `wagerId`; `getUserWagerCount(A)` increments by 1.
2. Creator and opponent indexes are unchanged (both still include the wager).
3. For a non-`ThirdParty` wager (`arbitrator == 0`), no third index write occurs; behavior is byte-for-byte as before.
4. The arbitrator index is append-only (never removed on resolve/cancel/refund/draw) — same lifecycle as creator/opponent.
5. No funds move and no resolution authority changes from this addition.
6. Gas: at most one extra `SSTORE`/set-add when an arbitrator is present.

## Notes

- Pre-existing wagers (created before this deploys) are not retro-indexed; discovery applies to wagers created on/after the v3 cutover.
- Resolution itself is unchanged: `declareWinner` already authorizes the arbitrator for `ThirdParty`; 004 adds arbitrator-solo `declareDraw`.
