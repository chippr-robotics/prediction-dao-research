# The Wager Lifecycle Contract: Anatomy of a Peer-to-Peer Escrow State Machine

*How FairWins' `WagerRegistry` turns a handshake bet into seven explicit states, two hard deadlines, and a payout nobody can strand*

---

| | |
|---|---|
| **Series** | Prediction Markets — Part 1 |
| **Audience** | Smart-contract developers |
| **Tags** | `escrow`, `state-machine`, `solidity`, `prediction-markets`, `p2p` |
| **Reading time** | ~9 minutes |

> **Responsible-use note.** FairWins wagers are peer-to-peer forecasts on publicly available information. Nothing here is a mechanism for trading on material non-public information or circumventing regulation; all participants remain fully subject to applicable law and compliance obligations in their jurisdiction.

---

## The bet that never pays out

Two engineers bet 200 USDC on whether a protocol upgrade ships before the end of the quarter. Both are good for it. Neither wants to hand the money to the other in advance, neither wants a third party holding it, and both have seen how this ends without structure: the outcome lands, the loser goes quiet, and the "bet" becomes an awkward memory.

The failure modes of an informal wager are surprisingly enumerable. The counterparty never actually commits their stake. The event resolves but nobody has authority to say who won. The event *doesn't* resolve — the upgrade is cancelled — and there's no agreed path to unwind. Or the money is committed somewhere and a bug, a dispute, or a disappearing party leaves it stuck forever.

An escrow contract worth deploying has to close every one of those holes explicitly. That is what FairWins' `WagerRegistry` (`contracts/wagers/WagerRegistry.sol`) does: it is less a "betting contract" than a state machine over other people's money, where every state has a defined set of exits and no state is a dead end. This post walks its anatomy — the states, the deadlines, the resolution paths, and the checks-effects-interactions discipline that holds it together.

## Seven states, no dead ends

Every wager is a `Wager` struct in proxy storage, and its position in the lifecycle is a single enum (`contracts/interfaces/IWagerRegistryTypes.sol`):

```solidity
enum Status { None, Open, Active, Resolved, Cancelled, Refunded, Draw }

enum ResolutionType {
    Either, Creator, Opponent, ThirdParty,
    Polymarket, ChainlinkDataFeed, ChainlinkFunctions, UMA
}
```

The happy path is short. `createWager` escrows the creator's stake and writes the wager as `Open`, emitting `WagerCreated`. The named opponent calls `acceptWager`, their stake is pulled in, the status flips to `Active`, and `WagerAccepted` fires. Once the outcome is known, the wager becomes `Resolved` with a recorded `winner`, and the winner calls `claimPayout` to receive both stakes in one transfer (`PayoutClaimed`).

The interesting design is in the unhappy paths, because each live state has an exit that requires no cooperation from the other side:

- **`Open`, opponent never shows.** The creator can `cancelOpen` (emits `WagerCancelled`), the opponent can `declineWager` — both refund the creator immediately — or anyone can call `claimRefund` after the accept deadline passes, emitting `WagerRefunded`.
- **`Active`, outcome never lands.** After the resolve deadline, `claimRefund` returns each side's own stake and marks the wager `Refunded`.
- **`Active`, the event genuinely ties.** Both participants consent to a draw (or the arbitrator declares one), each stake goes home, and `WagerDrawn` fires.

One subtlety for anyone reading the source: the pre-acceptance exits (`cancelOpen`, `declineWager`) don't set `Status.Cancelled` — they refund the creator and `delete` the wager record entirely, reclaiming storage. The enum value exists for ABI stability, but a cancelled offer simply ceases to be. Post-acceptance exits, by contrast, keep the record and mark it `Refunded` or `Draw`, because two parties' history now hangs off it.

## Two absolute deadlines

Every wager carries two Unix timestamps set at creation: `acceptDeadline` and `resolveDeadline`. They are absolute, not durations, and the contract validates their shape in one shared check (`contracts/wagers/WagerRegistryCore.sol`):

```solidity
uint64 public constant MAX_ACCEPT_WINDOW = 30 days;
uint64 public constant MAX_RESOLVE_WINDOW = 180 days;

function _checkDeadlines(uint64 acceptDeadline, uint64 resolveDeadline) internal view {
    if (acceptDeadline <= block.timestamp) revert BadDeadlines();
    if (resolveDeadline <= acceptDeadline) revert BadDeadlines();
    if (acceptDeadline > block.timestamp + MAX_ACCEPT_WINDOW) revert BadDeadlines();
    if (resolveDeadline > block.timestamp + MAX_RESOLVE_WINDOW) revert BadDeadlines();
}
```

The ordering constraint (`accept < resolve`) means the machine can never enter `Active` with its resolution window already closed. The caps mean no wager can hold funds hostage indefinitely: an offer goes stale within 30 days, and even a fully active wager has a guaranteed exit within 180. Deadlines are the liveness half of the design — the state machine guarantees *which* transitions are legal, and the deadlines guarantee that *some* transition is always eventually available to a single, unilateral caller.

Notice also who may trigger the timeout path. `claimRefund` deliberately pays the original participants regardless of who calls it, so a neutral third party — or an automated keeper via `batchExpireOpen` — can sweep expired wagers without being able to redirect a cent.

## Eight ways to decide a winner

`ResolutionType` is fixed per wager at creation and determines exactly one authority that can settle it. The first four are human paths, checked in `_declareWinner`:

- **`Either`** — either participant may declare. This is mutual-trust settlement, and the contract restricts it to equal-stakes wagers (`EitherRequiresEqualStakes`): on an asymmetric wager, the side risking less could self-declare and seize the larger stake, so leveraged offers must name a single settler, an arbitrator, or an oracle.
- **`Creator` / `Opponent`** — exactly one named party declares.
- **`ThirdParty`** — an arbitrator, named at creation and required to be neither participant, declares alone.

The remaining four are oracle paths — `Polymarket`, `ChainlinkDataFeed`, `ChainlinkFunctions`, `UMA` — where `declareWinner` reverts outright and anyone may instead call the auto-resolve entrypoints, which read the linked condition through an `IOracleAdapter` (`contracts/oracles/IOracleAdapter.sol`) and map the boolean outcome to a winner via the `creatorIsYes` flag recorded at creation. Creation-time validation (`_checkOracleLinkage`) refuses an oracle wager whose condition is missing, whose adapter is unwired, or whose condition has *already resolved* — a stale-condition bet is a bet on a known answer.

Draws follow the same authority split. For the participant types, `declareDraw` accumulates consent in a two-bit mask — the first call emits `DrawProposed`, the second settles — and either side can `revokeDraw` before the other agrees, so a one-sided proposal never locks anything. An arbitrator settles a draw solo. Oracle types can't be drawn manually at all; a draw there arises only from the oracle reporting a tie.

## Checks-effects-interactions, everywhere it counts

The registry escrows allowlisted ERC-20 stakes — USDC and WMATIC in practice, with amounts as `uint128` and the allowlist admin-controlled via `setTokenAllowed`. Every function that moves tokens follows the same shape, and the payout path is the cleanest illustration:

```solidity
function _claimPayout(address actor, uint256 wagerId) internal {
    Wager storage w = _wagers[wagerId];
    if (w.status != Status.Resolved) revert NotResolved();
    if (actor != w.winner) revert NotWinner();
    if (w.paid) revert AlreadyPaid();

    w.paid = true;
    // Compute as uint256 to avoid uint128 overflow on sum
    uint256 payout = uint256(w.creatorStake) + uint256(w.opponentStake);
    IERC20(w.token).safeTransfer(w.winner, payout);

    emit PayoutClaimed(wagerId, w.winner, payout);
}
```

Checks first (right state, right caller, not yet paid), then the effect (`w.paid = true`), then the interaction (the transfer). Even with OpenZeppelin's `ReentrancyGuard` wrapping every external entrypoint, the ordering stands on its own: a reentrant or misbehaving token sees the wager already marked paid. The same pattern repeats in `_settleDraw` and `_claimRefund`, where status flips and consent state is cleared before any `safeTransfer` runs.

The checks phase is also where the compliance and membership layers live, uniformly across create and accept: a sanctions screen (`ISanctionsGuard.checkBlocked`) on the acting parties, then a membership gate (`IMembershipManager.checkCanCreate`) — all evaluated before a single token moves.

## Design decisions

**Exits stay open when the machine is paused.** A `GUARDIAN_ROLE` pause halts *new* activity — `createWager` and `acceptWager` carry `whenNotPaused` — but `declareWinner`, `declareDraw`, `claimPayout`, and `claimRefund` deliberately do not. An emergency stop must never become a mechanism for stranding escrowed funds; only per-account freezes (an explicitly moderated state) block an individual's exits.

**Absolute timestamps over durations.** Storing `acceptDeadline`/`resolveDeadline` as absolute `uint64` values makes every timeout check a single comparison against `block.timestamp`, makes deadlines legible off-chain without reconstruction, and lets the frontend, subgraph, and keepers all agree on expiry without knowing creation time.

**One authority per wager, chosen up front.** There is no fallback chain from oracle to arbitrator to participant. A wager's resolution path is a creation-time commitment both sides accepted; ambiguity about who settles is precisely the failure mode of the handshake bet, so the contract refuses to reintroduce it.

**Events as the integration surface.** `WagerCreated`, `WagerAccepted`, `WagerResolved`, `PayoutClaimed`, `WagerRefunded`, `WagerCancelled`, and `WagerDrawn` mirror every transition, and an append-only per-user index (`getUserWagers`) gives O(user) lookups without log scans. The subgraph and frontend never need to reconstruct state transitions from storage diffs.

**A state machine at a stable address.** Since spec 025 (`specs/025-upgradeable-registry/`), the registry is a UUPS proxy: wager state lives at a permanent address while logic ships as in-place upgrades, gated by a storage-layout compatibility check so an upgrade can extend the machine but never scramble the wagers already inside it. The behavior in this post — every state, every exit — survives an upgrade because the upgrade process is not allowed to touch the storage that encodes it.

The result is an escrow contract you can audit as a graph: seven states, a bounded clock on every edge that holds money, and no node without an exit. That shape — not any single clever line — is what makes it safe to lock 400 USDC between two people who trust the outcome more than they trust each other.

## Sources

- `contracts/wagers/WagerRegistry.sol` — external entrypoints, admin surface, pause/freeze semantics
- `contracts/wagers/WagerRegistryCore.sol` — shared state, `_checkDeadlines`, `_createWager`, `_declareWinner`, `_declareDraw`, `_claimPayout`, `_claimRefund`
- `contracts/interfaces/IWagerRegistryTypes.sol` — `Status` / `ResolutionType` enums, `Wager` struct, event definitions
- `contracts/oracles/IOracleAdapter.sol` — oracle resolution interface
- `docs/developer-guide/smart-contracts.md` — state-machine diagram, resolution-type table, deployed addresses
- `specs/025-upgradeable-registry/spec.md` — UUPS migration rationale and storage-layout guarantees
- `test/WagerRegistry.test.js`, `test/WagerRegistry.draw.test.js` — lifecycle, deadline, refund, and draw-consent behavior
- OpenZeppelin Contracts: ReentrancyGuard, SafeERC20, AccessControl, UUPS — https://docs.openzeppelin.com/contracts
- EIP-712 (typed structured data signing, used by the open-challenge accept path) — https://eips.ethereum.org/EIPS/eip-712
- ERC-1822 / UUPS proxiable standard — https://eips.ethereum.org/EIPS/eip-1822
