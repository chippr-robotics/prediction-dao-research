# Phase 1 Data Model: My Wagers Refinements

This feature adds **no on-chain or subgraph schema**. The "entities" here are client-side view
models and one reused local-storage record. All are scoped to the connected wallet and the active
`chainId`.

## Entity: ResolvedOpponent (view model)

The display identity for a counterparty address, produced by `useOpponentName(address)`.

| Field | Type | Notes |
|---|---|---|
| `address` | string (0x…) | The real on-chain counterparty address (source of truth). |
| `source` | `'addressBook' \| 'ens' \| 'generated'` | Which resolver produced `displayName`. |
| `displayName` | string | Address-book nickname, ENS name, or generated two-word label. |
| `isSelf` | boolean | True when `address` is the connected wallet → render "You". |
| `revealed` | boolean (UI state) | Whether the full address is currently shown (toggled by tap). |

**Resolution order (validation rule)**: address book → ENS reverse → generated. First non-empty wins.
The generated name is **deterministic**: same address ⇒ same `displayName` (FR-002). Never blocks on
ENS — an in-flight/failed ENS lookup falls straight through to `generated`.

**Derivation**: `generated` = `deriveAddressName(address)` → `{ adjective, noun, label }` from the
64×64 `nicknameWords` vocabulary keyed by `keccak256(checksum(address))`.

## Entity: DrawSubmissionState (view model)

Per-wager draw progress, derived from indexed state; attached to the card view model.

| Field | Type | Notes |
|---|---|---|
| `phase` | `'proposed' \| 'settled' \| 'none'` | `proposed` = `status==='draw_proposed'`; `settled` = `status==='draw'`. |
| `proposer` | string (0x…) \| null | From subgraph `drawProposer` via `fetchDrawProposals`; null if not proposed. |
| `mySubmitted` | boolean | `phase!=='none'` AND (`proposer===me` OR `phase==='settled'`). |
| `opponentSubmitted` | boolean | `proposer===opponent` OR `phase==='settled'`. |
| `label` | string | e.g. "You proposed · awaiting opponent" / "Opponent proposed · your turn" / "Both agreed · stakes returned". |

**Validation rules**: `phase` and `proposer` come only from on-chain/subgraph reads (honest state). If
the proposer read fails (`ok:false`), prior state is retained rather than cleared (no fabricated
revoke) — same guarantee `drawProposalScan` already enforces.

**State transitions**: `none → proposed` (one party submits) → `settled` (both agree, `WagerDrawn`
event). A `proposed → none` transition is a revoke. `settled` is terminal (History tab).

## Entity: OpenChallengeCodeVaultEntry (reused local storage — spec 024)

Already defined in `lib/openChallenge/codeVault.js`; this feature only changes **when** it is
read/written (auto-decrypt instead of manual recovery).

| Field | Type | Notes |
|---|---|---|
| `code` | string (4 words) | The open-challenge claim code (dedupe key). |
| `savedAt` | number (epoch ms) | Set on save; newest-first ordering. |
| `label`/`challengeId` | string (optional) | Reference to the challenge, for display. |

**Storage**: `localStorage` key `fairwins.ocCodeVault.<wallet>`, envelope encrypted with
ChaCha20-Poly1305 under a key derived from a one-time wallet signature (`CODE_VAULT_SIGN_MESSAGE`).
Per-wallet; never plaintext; never cross-wallet (FR-010).

**New in-memory companion — `SessionVaultKey`** (not persisted): the derived 32-byte vault key cached
for the session so items auto-decrypt without re-signing per item. Cleared on wallet change / session
end.

## Entity: PoolListItem (reused view model — spec 037)

Produced by `useMyPools()` / `aggregateMyItems`; this feature filters it by `bucket` per active tab.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Pool identifier. |
| `title` | string | Pool display title (client-side two-word nickname allowed). |
| `status` | string | Human pool status label. |
| `bucket` | `'active' \| 'history'` | `history` when pool state ∈ `TERMINAL_POOL_STATES` (2 Resolved, 3 Cancelled). |
| `route` | string | Deep link to the pool page. |

**Placement rule (FR-015/016)**: History tab renders `bucket==='history'` pools; all other tabs render
`bucket==='active'` pools. The per-row Active/Past chip is removed (the tab conveys it).

## Entity: StatusFilterOption (UI enumeration)

The status `<select>` option list. After this feature:

| Value | Label | Kept? |
|---|---|---|
| `all` | All Status | ✅ |
| `pending_acceptance` | Pending Acceptance | ✅ |
| `active` | Active | ✅ |
| `pending_resolution` | Pending Resolution | ✅ |
| `disputed` | Disputed | ❌ removed (FR-018) |
| `resolved` | Resolved | ✅ |
| `expired` | Expired | ❌ removed (FR-017) |

**Rule**: Removing options does not alter categorization; expired wagers remain hidden from the default
view (FR-019). Underlying `WagerStatus` enum values are unchanged.
