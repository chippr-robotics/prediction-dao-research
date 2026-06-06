# Contract: WagerRegistry v3 — Draw interface delta

The public on-chain surface added by this feature. This is the authoritative ABI contract for the frontend (`frontend/src/abis/WagerRegistry.js`), subgraph, and tests. Additions only — nothing existing is removed or reordered.

## Enum delta

```solidity
// IWagerRegistry.sol — APPEND ONLY (wire-stable ordering)
enum Status { None, Open, Active, Resolved, Cancelled, Refunded, Draw }
//                                                              ^^^^ new = 6
```

## Functions

```solidity
/// @notice Settle, or move toward settling, a wager as a DRAW (both stakes returned).
/// @dev Either/Creator/Opponent: records caller's consent; settles only once BOTH
///      participants have called it. ThirdParty: arbitrator settles immediately.
///      Oracle resolution types: reverts (a draw arises only from the oracle tie).
/// Requires: status == Active, block.timestamp <= resolveDeadline, caller not frozen.
function declareDraw(uint256 wagerId) external;

/// @notice Withdraw the caller's pending draw consent (participant types only).
/// Requires: status == Active, caller previously consented, caller not frozen.
function revokeDraw(uint256 wagerId) external;

/// @notice (optional view) Current draw-consent state for UI propose/confirm.
function drawConsent(uint256 wagerId) external view returns (bool creatorAgreed, bool opponentAgreed);

/// @notice EXTENDED: a Polymarket market that resolved as a tie now settles a DRAW
///         immediately; decisive markets resolve a winner as before; unresolved reverts.
function autoResolveFromPolymarket(uint256 wagerId) external; // signature unchanged; behavior extended
```

## Events

```solidity
event WagerDrawn(uint256 indexed wagerId, address indexed creator, address indexed opponent, address by);
event DrawProposed(uint256 indexed wagerId, address indexed proposer);
event DrawRevoked(uint256 indexed wagerId, address indexed proposer);
```

## Errors

```solidity
error NotParticipant();       // declareDraw/revokeDraw caller not creator/opponent (participant types)
error DrawNotApplicable();    // declareDraw on an oracle resolution type  (or reuse NotAuthorized)
error NoDrawProposal();       // revokeDraw with no prior consent from caller
// reused: NotActive, ResolveExpired, AccountFrozenError, ConditionNotResolved
```

## Behavioral contract (must hold)

1. `declareDraw` on `Either/Creator/Opponent` by one participant **does not** settle; emits `DrawProposed`; status stays `Active`.
2. `declareDraw` by the **second** participant settles: status → `Draw`, `creatorStake`→creator, `opponentStake`→opponent, `WagerDrawn` emitted, `_drawConsent` cleared.
3. `declareDraw` on `ThirdParty` by the arbitrator settles immediately (solo).
4. `declareDraw` by a non-participant / non-arbitrator → revert; by anyone on an oracle type → revert.
5. Σ transferred on a draw == `creatorStake + opponentStake` (no value created/lost), for equal **and** unequal stakes.
6. After `status == Draw`: `declareWinner`, `declareDraw`, `claimPayout`, `claimRefund` all revert.
7. A pending one-sided consent never blocks `declareWinner` / `autoResolveFromPolymarket` / `claimRefund`.
8. `revokeDraw` clears only the caller's bit; a subsequent `declareDraw` re-adds it.
9. `autoResolveFromPolymarket`: resolved-tie → `Draw`; resolved-decisive → `Resolved` (winner); unresolved → revert `ConditionNotResolved`.
10. Reentrancy-safe (CEI + `nonReentrant`); frozen accounts cannot drive `declareDraw`/`revokeDraw`; draw paths are callable while the contract is paused (exit path).
