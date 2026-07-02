# Data Model: Peer-to-Peer Pool Communication (Phase 1)

**Feature**: specs/038-webrtc-pool-comms | **Date**: 2026-07-02

All state is device-local (in-memory session state; `localStorage` for
display-only caches). Nothing here is written on-chain or to any server.
Scoping key throughout: `(chainId, poolAddress)` — cross-network and
cross-pool isolation by construction (FR-001, FR-020a).

## Entity: PoolChannel

The per-pool channel as seen by one device.

| Field | Type | Notes |
|---|---|---|
| chainId | number | active network; must match app's active network |
| poolAddress | address | the ZKWagerPool clone |
| role | `creator` \| `member` | derived: wallet == on-chain `creator()` → creator |
| lifecycle | enum | see state machine below |
| consent | boolean | member acknowledged IP/rendezvous-metadata exposure disclosure (FR-021); persisted per (account, pool) |
| stunEnabled | boolean | R2 toggle; persisted per account; disclosed in consent |
| signalingStrategy | enum | active rendezvous path: `nostr` (default) \| `wsRelay` (FairWins Cloud Run); auto-failover per FR-020b; surfaced in status UI |

**Validation**: channel may only be offered for pools in an active lifecycle
(joining-open / resolving / claiming); never for resolved-and-claimed or
cancelled pools (FR-025).

**State machine (channel lifecycle)**:

```
idle → consented → rendezvous (room join + in-band auth) → connected
                        ↑              |                       |
                        └── auto-reconnect (backoff, honest status) ┘
connected → degraded (creator unreachable / signaling lost) → rendezvous
any state → closed (pool concluded | user declined | network switched)
```

## Entity: PeerSession

One authenticated WebRTC link. Creator holds ≤ 50 (FR-027); member holds ≤ 1
(to the creator).

| Field | Type | Notes |
|---|---|---|
| sessionId | string | `hash(memberNonce ‖ creatorNonce)` from in-band auth; binds envelopes (FR-020a) |
| peerRole | `creator` \| `member` | |
| commitment | bigint \| null | member peers only; must be ∈ on-chain member set (FR-002) |
| nickname | string | derived via existing `nickname.js` from commitment (FR-003) |
| peerSessionPubKey | bytes32 | certified in in-band auth; verifies envelope sigs (R6/R7) |
| peerBoxPubKey | bytes32 \| null | creator peers only; claim-code encryption target (R8) |
| lastSeq | number | highest accepted `seq` from this peer (replay guard, FR-005) |
| sendSeq | number | next outbound `seq` |
| connState | enum | `awaiting-auth → open → closed/failed`; 10 s auth timeout; heartbeat-driven (R5) |

**Validation rules**:
- Handshake signature MUST verify against commitment (member) or on-chain
  creator address (creator) over the exact tuple in
  `contracts/handshake-payload.md`; otherwise the session never opens (FR-002).
- A new authenticated session for an existing commitment replaces the old one
  (newest-wins, R11/FR-026).
- Session 51+ on the hub → declined with reason (FR-027).

## Entity: RoomDescriptor + AuthMessage (transient)

See `contracts/handshake-payload.md`. **RoomDescriptor** `{appId, roomId,
password}` is derived on demand from phrase entropy + pool + chain (never
persisted, never displayed); the password keeps signaling content-blind
(FR-020). **AuthMessage** is the in-band `fwpc-hs/1` first message on a fresh
data channel: single-use nonce, pool- and session-scoped (FR-020a); member
auth MUST NOT contain wallet addresses; nothing in either ever contains claim
codes.

## Entity: Envelope (every channel message)

See `contracts/channel-protocol.md`. `{v, chainId, pool, session, from, seq,
type, body, sig}`; ≤ 8 KB serialized; unknown `type` ignored (FR-024).

## Entity: StandingsDoc (single-writer: creator)

| Field | Type | Notes |
|---|---|---|
| version | number | monotonic; receivers apply iff greater (R10, FR-008) |
| rows | array | ≤ pool member count; each `{commitment, rank?, score?, eliminated?, label?}` |
| updatedNote | string? | optional creator note, ≤ 280 chars |

**Validation**: rows keyed by commitment (nicknames derived locally, never
transmitted as authority); rendered with the interim/off-chain badge
(FR-009); persisted to `localStorage` display cache with `staleness = version
+ receivedAt(injected clock)` for honest "possibly stale" rendering.

## Entity: Announcement (single-writer: creator)

| Field | Type | Notes |
|---|---|---|
| id | number | per-pool monotonic |
| version | number | shares the announcements-doc version counter (R10) |
| text | string | ≤ 280 chars, plain text (no markup — XSS surface stays closed) |
| action | enum? | `approve-payout` \| `view-pool` \| null → deep-link target (FR-016) |

**Validation**: announcements list bounded (keep latest 20); creator-signed by
envelope; rendered attributed "Creator" by role (FR-015).

## Entity: ClaimCodeHandoff

| Field | Type | Notes |
|---|---|---|
| commitment | bigint | sender's in-pool identity (binding, FR-012) |
| claimCode | string | claim-scope nullifier; boxed to creator session key (R8, FR-011) |
| state | enum | `sent → delivered (ack) → filled (creator UI)` / `failed → fallback-manual` |

**Validation rules**:
- Body encrypted (`nacl.box`) to creator's certified session pub key before
  enveloping; never broadcast; never forwarded; never written to `localStorage`
  on the member side beyond the existing `identityCache` value it came from
  (FR-014).
- Creator side: keyed by commitment — duplicates collapse (FR-026); auto-fills
  the payout allocation row for that nickname **pending creator review**
  (FR-012); ack (`claim-code-ack`) returned on receipt (FR-013).
- If no ack within timeout → member shown "not delivered" + manual fallback
  path (FR-013/FR-022).

## Entity: PresenceRoster (derived, creator-broadcast)

| Field | Type | Notes |
|---|---|---|
| connected | array<commitment> | deduped by commitment (FR-026); rendered as nicknames (FR-003) |
| version | number | latest-wins like other docs |

**Validation**: display-only; never touches on-chain logic (FR-019).

## Relationships

```
PoolChannel 1 ──── * PeerSession            (hub: ≤50; member: 1)
PoolChannel 1 ──── 1 StandingsDoc           (creator-authored)
PoolChannel 1 ──── * Announcement           (creator-authored, bounded list)
PeerSession 1 ──── 0..1 ClaimCodeHandoff    (member→creator only)
PoolChannel 1 ──── 1 PresenceRoster         (derived from live PeerSessions)
StandingsDoc.rows[].commitment ─→ nickname.js ─→ two-word nickname (client-side only)
PeerSession.commitment ─→ on-chain Joined events (membership check, FR-002)
```

## localStorage keys (display-only, safe-by-construction — pattern of identityCache.js)

| Key | Contents |
|---|---|
| `fairwins_pool_channel_consent_v1_<account>_<pool>` | `{consented, stunEnabled}` |
| `fairwins_pool_channel_docs_v1_<account>_<pool>` | last received `{standings, announcements, receivedAt}` (marked stale on load) |

Never stored: identity secrets, session private keys, room descriptors
(re-derived on demand), auth messages, claim codes (beyond the pre-existing
`identityCache` entry), wallet addresses of peers.
