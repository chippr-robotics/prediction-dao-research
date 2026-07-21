# When Nobody Wins and Anyone Can Play: Draw Resolution and Open-Challenge Wagers

*The two edge cases that make a peer-to-peer betting protocol feel finished: settling a wager that has no fair winner, and posting a wager that has no opponent yet*

| | |
|---|---|
| **Series** | Prediction Markets, part 3 |
| **Part** | 16 of 34 |
| **Audience** | Smart-contract developers |
| **Tags** | `prediction-markets`, `escrow`, `edge-cases`, `solidity` |
| **Reading time** | ~9 minutes |

---

> **Responsible-use note**: FairWins wagers concern publicly available information and legitimate forecasting between consenting parties. Nothing here is a mechanism for trading on material non-public information or evading applicable law. All participants remain fully subject to the laws, compliance requirements, and professional obligations that apply to them.

---

## Two Wagers That the Happy Path Can't Handle

Dana and Priya have 200 USDC each escrowed on whether a cup final ends in a home win. Mid-week, the match is abandoned — rescheduled outside the window their wager described. Neither of them should win. Under the original `WagerRegistry`, their only exit was to do nothing: wait for the `resolveDeadline` to pass, then call `claimRefund`, which returns both stakes on a timed-out Active wager. It works, but it is slow, and on-chain it is indistinguishable from two people who simply forgot about their bet. An indexer, a history view, or a dispute reviewer cannot tell a deliberate "we agree this is void" from abandonment.

The second gap is at the other end of the lifecycle. Marcus wants to post a wager to his group chat: 50 USDC on a Polymarket market, first taker wins the other side. But `createWager` binds a named `opponent` at creation, and only that exact address can accept. There is no way to say "whoever wants this, take it" — let alone to do so without broadcasting the private terms to every mempool scanner watching for fresh escrow.

These are the edge cases that separate a demo from a protocol. FairWins closed them with two features: **draw resolution** (spec 004) — a deliberate, distinctly-recorded "both stakes back" outcome — and **open-challenge wagers** (specs 024 and 041) — counterparty-less wagers gated by a four-word claim code. Both live in the same contracts: `contracts/wagers/WagerRegistry.sol` and the shared storage/logic base `contracts/wagers/WagerRegistryCore.sol`.

## A Seventh Terminal State

The wager state machine gained one enum member and one event:

```solidity
enum Status { None, Open, Active, Resolved, Cancelled, Refunded, Draw }

event WagerDrawn(uint256 indexed wagerId, address indexed creator,
                 address indexed opponent, address by);
```

(`contracts/interfaces/IWagerRegistryTypes.sol`.) `Draw` is terminal and distinct from `Refunded`, which is the whole point: the subgraph and the app can render "settled as a draw" differently from "timed out." Settlement itself is deliberately boring — it reuses the proven refund shape, checks-effects-interactions throughout:

```solidity
function _settleDraw(uint256 wagerId, Wager storage w, address by) internal {
    w.status = Status.Draw;
    delete _drawConsent[wagerId];
    membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
    membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);

    IERC20 token = IERC20(w.token);
    token.safeTransfer(w.creator, w.creatorStake);
    token.safeTransfer(w.opponent, w.opponentStake);

    emit WagerDrawn(wagerId, w.creator, w.opponent, by);
}
```

Each party gets back exactly their own stake — stakes need not be equal, and no value moves between participants. Status flips and consent state clears before any token transfer, and both parties' concurrency slots on the `MembershipManager` are released.

## Who Gets to Say "Draw"?

The interesting design question was authority. A unilateral draw is an attack: the losing side of an `Either`-resolved wager would declare a draw the moment the outcome went against them. Spec 004 splits authority three ways by resolution type, implemented in `_declareDraw`:

- **Participant-resolved wagers** (`Either`, `Creator`, `Opponent`) require *both* parties. The contract keeps a per-wager consent bitmask — `bit0` for the creator, `bit1` for the opponent — outside the `Wager` struct so `getWager`'s ABI is untouched:

```solidity
uint8 consent = _drawConsent[wagerId];
if ((consent & bit) == 0) {
    consent |= bit;
    _drawConsent[wagerId] = consent;
    emit DrawProposed(wagerId, actor);
}
if (consent == _CONSENT_BOTH) {
    _settleDraw(wagerId, w, actor);
}
```

  The first `declareDraw` records a proposal; the second party's call completes it. Crucially, a pending proposal never locks the wager — `declareWinner` and the timeout refund remain fully available, and the proposer can back out via `revokeDraw` (emitting `DrawRevoked`). "Declining" a draw needs no action at all: just don't confirm.

- **`ThirdParty` wagers**: the named arbitrator settles a draw alone, consistent with their existing authority to declare a winner.

- **Oracle-resolved wagers** (Polymarket, Chainlink, UMA): no human — participant, arbitrator, or admin — can force a draw. `_declareDraw` reverts with `DrawNotApplicable()`. A draw on these wagers can only come from the oracle itself.

Manual draws are also rejected after the `resolveDeadline` (`ResolveExpired`) — past that point the timeout refund already returns both stakes, so a manual draw would only muddy the record.

## The Oracle Tie

Polymarket markets can resolve indecisively: a 50/50 split, or an "invalid" resolution after a UMA dispute. The `PolymarketOracleAdapter` (`contracts/oracles/PolymarketOracleAdapter.sol`) detects this as equal payout numerators from the Conditional Tokens Framework and returns its unresolved sentinel (`resolvedAt == 0`) rather than inventing a winner. That sentinel is ambiguous, though — it also means "not resolved yet." The resolve path disambiguates in `contracts/wagers/WagerRegistryIntents.sol`:

```solidity
(bool outcome, , uint256 resolvedAt) = polymarketAdapter.getOutcome(w.polymarketConditionId);
if (resolvedAt == 0) {
    if (polymarketAdapter.isConditionResolved(w.polymarketConditionId)) {
        _settleDraw(wagerId, w, msg.sender);   // resolved tie -> immediate draw
        return;
    }
    revert ConditionNotResolved();             // genuinely unresolved -> unchanged
}
_settleOracleWin(wagerId, w, outcome);
```

A resolved tie settles as a draw the moment anyone calls `autoResolveFromPolymarket` — no waiting out the deadline. A decisive market still produces a winner; an unresolved one still reverts.

## A Wager With No Opponent

Open challenges (spec 024) attack the second gap. `createOpenWager` creates a wager with `w.opponent` left as `address(0)`, escrows the creator's stake as usual, and binds one new thing: a `claimAuthority` address. That address is the on-chain face of a **four-word claim code** — four words from the BIP-39 English wordlist (2048⁴ = 2⁴⁴ combinations), generated client-side and never sent to any server.

The trick is that the code *is* a keypair. `frontend/src/utils/claimCode/deriveFromCode.js` derives, from the normalized four words, a secp256k1 private key (`keccak256("FairWins/claim/v1" || code)`) whose address becomes the on-chain `claimAuthority`, plus an independent domain-separated symmetric key that seals the private terms envelope. One shareable secret does triple duty:

1. **Discovery** — `openWagerIdForClaim(authority)` maps the derived address to the single live wager. Without the code, an open challenge is one indistinguishable entry among many.
2. **Accept authorization** — the taker proves knowledge of the code by presenting an EIP-712 signature *from the code-derived key*:

```solidity
bytes32 digest = _hashTypedDataV4(
    keccak256(abi.encode(OPEN_ACCEPT_TYPEHASH, wagerId, taker)));
if (digest.recover(signature) != authority) revert BadClaimSignature();
```

   The typed struct is `OpenAccept(uint256 wagerId, address taker)`. Binding `taker` into the signed digest is the front-running defense: a mempool observer who copies a pending `acceptOpenWager` transaction cannot replay the signature for their own address — re-signing requires the code.
3. **Readability** — the symmetric key opens the encrypted terms, replacing the usual recipient-key encryption that is impossible when the recipient is unknown at creation.

The first valid acceptance binds the taker as opponent, flips the wager to `Active`, and calls `_clearClaim`, which frees the commitment for reuse — uniqueness is enforced only among *currently open* challenges (`ClaimAuthorityInUse` on collision), so no unbounded state accumulates.

## Guardrails for an Unknown Counterparty

An unknown taker changes the threat model, and `createOpenWager` encodes the responses directly:

- **No self-resolution.** `Creator` and `Opponent` resolution types revert with `OpenResolutionTypeNotAllowed` — a lone unknown party must never be the sole resolver. Open challenges are restricted to oracle types, `Either`, and `ThirdParty`.
- **Equal stakes only.** One `stake` parameter sets both sides. A publicly shared code with asymmetric odds would invite adverse-selection sniping of the favorable side; symmetric stakes make the race merely about *who* takes the bet, not an economic edge.
- **Silver-and-above to create, any active tier to take.** Per `docs/system-overview/roles-and-tiers.md`, posting a code-gated wager is a higher-tier privilege (`getActiveTier(...) >= Silver`, else `InsufficientMembershipTier`), while accepting runs the same gauntlet as any named opponent — sanctions screening of both parties, active membership, concurrency limits — with no tier floor and no membership backdoor.
- **No decline.** `declineWager` on an open challenge reverts with `DeclineNotAllowedForOpenChallenge`; the creator's `cancelOpen` is the sole release for an unaccepted open challenge.
- **Party separation.** The creator cannot take their own challenge (`SelfWager`), and a taker who is the named arbitrator is refused (`ArbitratorCannotTake`) — a check that must run at accept because the opponent was unknown at creation.

Spec 041 then layered on oracle-settled open challenges: the creator picks a Polymarket market and the *event* defines the timeline — `frontend/src/lib/openChallenge/oracleTimeline.js` derives `acceptDeadline` from the market's end date and `resolveDeadline` from end-plus-settlement-buffer, both capped. Combined with the tie-handling above, the platform's most trustless combination falls out for free: a challenge anyone with the code can take, settled automatically by a public market, and refunding both sides if that market resolves invalid.

## Design Decisions

**Draw is a new outcome, not a new resolution type.** The eight resolution types (who resolves) are untouched; a draw is a ninth thing that can *happen*, gated per-type. That kept the accept, escrow, and payout paths byte-identical for every wager that never draws.

**Mutual consent over unilateral mercy.** Requiring both signatures on participant-resolved draws costs a second transaction, but removes the "losing side declares a draw" grief entirely — and because an unconfirmed proposal never locks anything, the worst a stalling counterparty can do is nothing.

**No admin override for stuck oracles.** A permanently unresolved oracle falls back to the deadline refund, which already returns both stakes. Adding a human draw override for oracle wagers would have created a trusted party where the whole point was not having one.

**A fast KDF, honestly scoped.** The v1 code derivation is two keccak passes — deliberately cheap. With the commitment public on-chain, a determined attacker with dedicated hardware could brute-force 2⁴⁴; spec 024 accepts this residual risk explicitly, scopes the guarantee to casual/indiscriminate guessing, and requires the UI to say so for meaningful stakes. The `v1` domain tags (`FairWins/claim/v1`, `FairWins/terms/v1`) leave room to swap in a memory-hard KDF without breaking existing wagers.

**Code-derived readability, forever.** Even after acceptance, the opponent reads terms via the code — there is no re-keying to their registered encryption key. Losing the code means "terms unavailable," never lost funds or blocked resolution.

Edge cases are where escrow protocols earn trust. A wager that can end with nobody winning, and begin with nobody on the other side, is a wager system that has met its users.

## Sources

- `specs/004-draw-resolution/spec.md` — draw resolution requirements and authority model
- `specs/024-open-challenge-wagers/spec.md` — claim-code open challenges, entropy floor, tier gating
- `specs/041-oracle-open-challenges/spec.md` — oracle-settled open challenges, event-derived timelines
- `contracts/wagers/WagerRegistry.sol` — `createOpenWager`, `acceptOpenWager`, `declareDraw`, `revokeDraw`
- `contracts/wagers/WagerRegistryCore.sol` — `_declareDraw`, `_settleDraw`, `_acceptOpenWager`, draw-consent bitmask
- `contracts/wagers/WagerRegistryIntents.sol` — `autoResolveFromPolymarket` tie disambiguation
- `contracts/oracles/PolymarketOracleAdapter.sol` — equal-payout-numerator tie detection
- `contracts/interfaces/IWagerRegistryTypes.sol` — `Status` enum, `WagerDrawn` / `DrawProposed` / `DrawRevoked` events
- `frontend/src/utils/claimCode/deriveFromCode.js`, `frontend/src/utils/claimCode/wordlist.js` — code→keypair derivation, BIP-39 wordlist
- `frontend/src/lib/openChallenge/oracleTimeline.js` — event-derived deadlines
- `docs/system-overview/roles-and-tiers.md` — Silver+ creation gate, tier limits
- EIP-712: Typed structured data hashing and signing — https://eips.ethereum.org/EIPS/eip-712
- BIP-39: Mnemonic code for generating deterministic keys — https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki
- Polymarket / Conditional Tokens documentation — https://docs.polymarket.com
