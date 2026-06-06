# Phase 1 Data Model: Draw Resolution

This feature adds a new terminal **outcome** to the existing wager state machine. It does **not** add a resolution *type* and does not change the `Wager` struct's public ABI (draw-consent lives in a side mapping).

---

## 1. Status enum (on-chain) — append-only

`IWagerRegistry.Status` (`contracts/interfaces/IWagerRegistry.sol:8`) gains one value, appended to preserve wire-stable ordering:

| Value | Name | Meaning | New? |
|------:|------|---------|:---:|
| 0 | `None` | uninitialized | |
| 1 | `Open` | created, awaiting opponent acceptance | |
| 2 | `Active` | both stakes escrowed | |
| 3 | `Resolved` | a winner was declared; winner claims the pot | |
| 4 | `Cancelled` | creator cancelled an open wager | |
| 5 | `Refunded` | deadline timeout; both stakes returned | |
| **6** | **`Draw`** | **deliberately settled as a draw; each party's stake returned** | **✅** |

Mirrors to update in lock-step:
- Frontend `WagerStatus` (`frontend/src/constants/wagerDefaults.js:100-112`): add `DRAW: 'draw'`; add `'draw'` to `TERMINAL_STATUSES` (`:170-176`); map on-chain `6 → 'draw'` wherever the numeric status is decoded.
- Subgraph `WagerStatus` enum + status array (only if the subgraph indexes `WagerRegistry`; see research D6).

---

## 2. Draw-consent state (on-chain, side mapping)

```
mapping(uint256 => uint8) private _drawConsent;   // per wagerId bitmask
//   bit 0 (0x01) = creator has consented to a draw
//   bit 1 (0x02) = opponent has consented to a draw
```

- **Not** part of the `Wager` struct → `getWager` / `getUserWagers` return ABI is unchanged.
- Only meaningful while `status == Active` and only for participant resolution types.
- Cleared to `0` on `_settleDraw` and on `revokeDraw` (per-bit).
- A value of `0x03` (both bits) triggers settlement.

**Optional view** (for the frontend propose/confirm UX): `drawConsent(uint256 wagerId) returns (bool creatorAgreed, bool opponentAgreed)` reading the bitmask. Recommended so the UI can render "Propose" vs "Confirm" vs "Waiting" without scanning events.

---

## 3. New functions (WagerRegistry v3)

| Function | Auth | Pre-state | Effect |
|----------|------|-----------|--------|
| `declareDraw(uint256 wagerId)` | participant types: `msg.sender ∈ {creator, opponent}`; `ThirdParty`: `msg.sender == arbitrator`; oracle types: **revert** | `Active`, `now ≤ resolveDeadline`, not frozen | participant: set caller's consent bit → if both set, `_settleDraw`; arbitrator: `_settleDraw` immediately |
| `revokeDraw(uint256 wagerId)` | `msg.sender ∈ {creator, opponent}` (participant types) | `Active`, caller's consent bit set, not frozen | clear caller's consent bit; emit `DrawRevoked` |
| `autoResolveFromPolymarket(uint256 wagerId)` *(extended)* | anyone (not frozen-gated) | `Active`, type `Polymarket` | resolved+tie → `_settleDraw`; resolved+decisive → `_settleOracleWin` (unchanged); unresolved → revert `ConditionNotResolved` |

Internal:

```
function _settleDraw(uint256 wagerId, Wager storage w) internal {
    w.status = Status.Draw;                 // EFFECTS first
    delete _drawConsent[wagerId];
    membershipManager.recordClose(w.creator, WAGER_PARTICIPANT_ROLE);
    membershipManager.recordClose(w.opponent, WAGER_PARTICIPANT_ROLE);
    IERC20 token = IERC20(w.token);         // INTERACTIONS last
    token.safeTransfer(w.creator, w.creatorStake);
    token.safeTransfer(w.opponent, w.opponentStake);
    emit WagerDrawn(wagerId, w.creator, w.opponent, msg.sender);
}
```

All public entry points carry `nonReentrant`; `declareDraw`/`revokeDraw` also carry `notFrozen(msg.sender)`. None are `whenNotPaused` (settlement/exit paths stay open while paused, matching `declareWinner`/`claimRefund`).

---

## 4. New events

| Event | Signature | Emitted when | Indexed for subgraph/UI |
|-------|-----------|--------------|--------------------------|
| `WagerDrawn` | `(uint256 indexed wagerId, address indexed creator, address indexed opponent, address by)` | a draw settles (manual or auto) | terminal draw record; `by` = settling caller (oracle path = caller/relayer) |
| `DrawProposed` | `(uint256 indexed wagerId, address indexed proposer)` | first participant consents (participant types) | drives "waiting for counterparty" UX |
| `DrawRevoked` | `(uint256 indexed wagerId, address indexed proposer)` | a participant withdraws consent | clears pending UX |

`WagerDrawn` mirrors `WagerRefunded`'s 3-indexed shape (`IWagerRegistry.sol:44`) plus a non-indexed `by` for provenance.

---

## 5. New errors

- `NotParticipant()` — `declareDraw`/`revokeDraw` caller is neither creator nor opponent (participant types). *(Distinct from `WinnerNotParticipant`, which is about the winner arg.)*
- `DrawNotApplicable()` — `declareDraw` called on an oracle resolution type. *(Or reuse `NotAuthorized` for parity with `declareWinner:309`; pick one and document.)*
- `NoDrawProposal()` — `revokeDraw` called with no prior consent from the caller.
- Reused: `NotActive`, `ResolveExpired`, `AccountFrozenError`, `ConditionNotResolved`.

---

## 6. State transitions (additions in **bold**)

```
                         declareWinner / autoResolve(decisive)
                       ┌──────────────────────────────► Resolved ──claimPayout──► (paid)
                       │
Open ──acceptWager──► Active ──┤ now>resolveDeadline + claimRefund ─► Refunded
                       │
                       └─ **declareDraw (both consent, now<=resolveDeadline) /**   ──► **Draw** ──(stakes pushed to both at settle)
                          **declareDraw (arbitrator solo, now<=resolveDeadline) /**
                          **autoResolveFromPolymarket (tie)**  (oracle path: status==Active, no deadline gate)
```

`Draw` is terminal: from `Draw`, `declareWinner`, `declareDraw`, `claimPayout`, and `claimRefund` all revert (status guards: `NotActive` / `NotResolved` / `NotRefundable`). A pending (one-sided) `_drawConsent` never changes status, so the wager stays fully `Active`-resolvable until something terminal happens (FR-008b).

---

## 7. Authorization & Polymarket-tie decision matrices

**Who may settle a draw**

| ResolutionType | Manual draw allowed by | Consent required |
|----------------|------------------------|------------------|
| `Either` (0) | creator or opponent | **both** participants |
| `Creator` (1) | creator or opponent | **both** participants |
| `Opponent` (2) | creator or opponent | **both** participants |
| `ThirdParty` (3) | arbitrator only | arbitrator alone |
| `Polymarket` (4) | — (no manual draw) | oracle tie only |
| `ChainlinkDataFeed/Functions`, `UMA` (5–7) | — (no manual draw) | out of scope (no tie→draw this feature) |

**Polymarket resolve outcome** (`autoResolveFromPolymarket`)

| `isConditionResolved` | `getOutcome().resolvedAt` | Result |
|:---:|:---:|---|
| false | 0 | revert `ConditionNotResolved` (unchanged) |
| true | `!= 0` | settle **winner** via `_settleOracleWin` (unchanged) |
| true | 0 | settle **Draw** via `_settleDraw` (**new**) |

---

## 8. Frontend & subgraph display contract

- `WagerStatus.DRAW = 'draw'`; terminal (shows under History).
- Status label "Draw"; badge visually distinct from "Refunded" and "Resolved" (not color-only — distinct text). Plain-language detail: "Settled as a draw — both parties' stakes returned."
- Resolution modal: a "Draw — both parties refunded" option gated by §7 auth + `Active` + `now <= resolveDeadline` (manual-draw deadline gate, consistent with §3 and FR-005) + non-oracle; participant types render Propose → Waiting/Withdraw → (counterparty) Confirm. Past the deadline the control is hidden and the timeout refund applies.
- Invariant surfaced to users: a draw returns *your own* stake (equal or unequal), never the counterparty's.
