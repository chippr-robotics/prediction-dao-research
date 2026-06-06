# Phase 1 Data Model: test states & per-flow matrix

## State entities (on chain 1337)

- **Wager**: `{ creator, opponent, token, creatorStake, opponentStake, acceptDeadline, resolveDeadline, resolutionType, status, winner, paid }`. Status: `Open → Active → Resolved|Refunded` (terminal). Created via UI; identified per-test by the id returned in `WagerCreated`.
- **Membership**: per-account entitlement gating creation: `active | expired | none`. Active when `expiresAt > now`. Driven via grant + `advanceTime`.
- **AccountModeration**: per-account `frozen | normal` (WagerRegistry `_frozen`). Blocks create/accept/declare/claim/refund-by-self.
- **ProtocolState**: `paused | active` (WagerRegistry Pausable). Paused blocks create/accept/batchExpire; settlement/claim/refund remain open.
- **OracleCondition** (Polymarket mock): `unresolved | YES [1,0] | NO [0,1] | tie [1,1]`. Set via `MockPolymarketCTF.resolveCondition`.

## Actors (fixed Hardhat accounts)

| # | Address | Role in specs |
|---|---|---|
| 0 | 0xf39F…2266 | Admin / Guardian / Moderator / Creator |
| 1 | 0x7099…79C8 | Opponent |
| 2 | 0x3C44…93BC | Arbitrator / third party |
| 3 | 0x90F7…b906 | Secondary guardian |
| 4 | 0x15d3…6A65 | Bystander / non-admin |

## Per-flow matrix (precondition → action → assertion)

### 19-paused-protocol (P1)
- Pause (setup) → as creator, open create modal → **assert** create is blocked / paused message (`assertToast`/disabled CTA).
- Paused + open wager exists → switch to opponent, attempt accept → **assert** blocked.
- Active wager (created+accepted before pause) → pause → resolve + claim via UI → **assert** success.
- Unpause (afterEach/step) → create → **assert** success.

### 18-frozen-accounts (P1)
- Freeze account #1 → as #1, attempt create/accept → **assert** blocked (frozen message).
- Resolved wager with frozen winner → as winner, claim → **assert** blocked.
- Unfreeze → retry → **assert** success. (afterEach unfreezes any frozen account.)

### 11-refund-timeout (P2)
- Open wager, never accepted → `advanceTime(> acceptDeadline)` → claimRefund (creator) → **assert** creator refunded, status Refunded; and **assert** refund blocked before deadline.
- Active oracle wager, unresolved → `advanceTime(> resolveDeadline)` → claimRefund → **assert** both parties refunded.

### 08-oracle-resolution (P2)
- Polymarket wager (creator YES), accepted → `resolveMockCondition(id, [1,0])` → trigger resolve via UI → **assert** creator wins + can claim.
- Polymarket wager, accepted → `resolveMockCondition(id, [1,1])` (tie) → trigger resolve → **assert** does NOT settle; after `advanceTime(> resolveDeadline)` both refunded.
- (If Chainlink/UMA mocks are wired locally) resolve to an outcome → **assert** correct winner. Else mark explicitly skipped with a reason (no silent gap).

### 20-expired-membership (P3)
- Grant membership to #1, `advanceTime(> duration)` → as #1, attempt create → **assert** blocked + renewal prompt.
- Renew (purchase/grant) → retry create → **assert** success.

### 15-admin-panel (P3)
- As admin (#0): open AdminPanel → **assert** tier-config, grant/revoke, freeze/unfreeze, treasury-withdrawal controls present; withdrawal recipient defaults to configured treasury.
- As non-admin (#4): reach admin area → **assert** controls hidden / access denied.

## Validation rules surfaced to the UI (asserted)

- Create blocked when: paused, caller frozen, membership inactive/expired, concurrent-limit reached.
- Accept blocked when: paused, caller frozen, not the invited opponent, past acceptDeadline, caller membership inactive.
- Claim blocked when: caller frozen, not the winner, already paid.
- Refund blocked when: before the relevant deadline, or wager already terminal.
- Tie (Polymarket `pass==fail`) never settles a winner → refund path only.
