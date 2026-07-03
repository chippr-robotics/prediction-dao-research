# Contract: Rendezvous & In-Band Session Auth (`fwpc-hs/1`)

> Revised 2026-07-02 for the Trystero posture change (see spec Clarifications
> and research R3/R6). The previous version of this contract — an out-of-band
> copy/QR SDP payload — is preserved in git history (commit `fc7967e`).

How a device goes from "pool member with the app open" to "authenticated peer
session". Two layers, implemented by `frontend/src/lib/pools/channel/
roomSecret.js`, `rendezvous.js`, and `sessionAuth.js`.

## Layer 1 — Rendezvous (room derivation + join)

Room identity is derived deterministically from pool identifiers:

```
seed     = HKDF-SHA256(ikm = phraseEntropy ‖ poolAddress ‖ chainId,
                       info = "fairwins/pool-channel/v1")
appId    = "fairwins-pool-channel"
roomId   = hex(seed[0..16])
password = base64(seed[16..48])     // engages Trystero signaling encryption
```

- `phraseEntropy` is the pool's four-word-phrase entropy (language-independent
  form; available to members locally and recoverable from the pool summary's
  on-chain `wordIndices`) — NOT the rendered words of any one language.
- **Honest scope (FR-020a)**: the phrase's word indices are emitted on-chain
  by the pool factory, so all derivation inputs are public and the room
  descriptor is derivable by non-members. The `password` keeps signaling
  blobs opaque to signaling operators (FR-020) and scopes rooms — it is
  **not an access control**. Access control is Layer 2 exclusively.
- Signaling strategy order (FR-020b): `nostr` (public relays, default) →
  `wsRelay` (FairWins signaling relay on GCP Cloud Run). Failover is
  automatic and surfaced in the connection status UI. Strategy endpoints come
  from frontend config/sync artifacts — never hardcoded (constitution V).
- Rooms are joined only while the pool is in an active lifecycle (FR-025) and
  after the member's consent to IP/metadata exposure (FR-021).

**Security property**: reaching the room grants *rendezvous only* — peers
discover each other and open data channels, but nothing is trusted or
readable at the channel level until Layer 2 completes. **Camper containment**
(spec edge case "Room camping"): the hub caps concurrent pending-auth
sessions (≤10) separately from the 50 authenticated-session cap, drops peers
at the 10 s auth timeout, and never fans out any channel data pre-auth; the
residual exposure — a non-member observing rendezvous presence and member
network addresses during attempts — is disclosed in the FR-021 consent.

## Layer 2 — In-band session auth (first messages on a new data channel)

Until auth completes, a session accepts exactly one message kind: `auth`.
Anything else → immediate drop. Auth not completed within 10 s → drop.

### `auth` message fields

| Field | Type | Purpose |
|---|---|---|
| `v` | `"fwpc-hs/1"` | version; mismatch → drop with clear reason |
| `chainId` | number | scope; MUST match active network |
| `pool` | address | scope; MUST match the room's pool |
| `role` | `"member"` \| `"creator"` | asserted role; drives verification path |
| `nonce` | hex(16B) | fresh per session attempt; `sessionId = keccak(memberNonce ‖ creatorNonce)` |
| `sessionPubKey` | base64(32B) | tweetnacl signing pub key (envelope auth) — generated once per app session per (account, pool), memory-only, **reused across automatic reconnects with fresh nonces**, so the wallet/identity prompt happens once per app session, never per reconnect (analyze C2) |
| `boxPubKey` | base64(32B) | tweetnacl box pub key (creator only; claim-code encryption); same lifetime as `sessionPubKey` |
| `auth` | object | signature block, per role (below) |

### Signed tuple (byte layout fixed in `sessionAuth.js`)

```
"FairWins Pool Channel v1" ‖ chainId ‖ pool ‖ role ‖ nonce ‖ sessionPubKey [‖ boxPubKey]
```

- **Member**: `auth = {commitment, sig}` — a Semaphore identity signature
  (`Identity.signMessage`). Verifier (creator) MUST:
  1. verify `sig` against `commitment` (`Identity.verifySignature`);
  2. require `commitment` ∈ the pool's on-chain member set (Joined events);
  3. reject a `nonce` already seen this app session.
  Member auth MUST NOT contain any wallet address (FR-020a/FR-003).
- **Creator**: `auth = {sig}` — an EIP-191 wallet signature. Verifier
  (member) MUST recover the address and require it equals the pool's on-chain
  `creator()`.

A session opens only when both directions verified. After that, only
`fwpc/1` envelopes signed by the certified `sessionPubKey`s are accepted
(see [channel-protocol.md](./channel-protocol.md)).

### Why this is sufficient without transport-fingerprint binding

A hostile room peer (someone who obtained the room secret) cannot forge
either signature, so it can never impersonate the creator or a member, inject
messages, or read claim codes (boxed to the wallet-certified creator
`boxPubKey`). Its worst case is passively relaying already-signed envelopes —
exposing only data every authenticated pool member receives anyway. Room
secrets derive from the phrase members already guard; leaking it leaks
rendezvous presence, not channel authority (analysis in research R6).

## Failure handling (edge cases from spec)

| Condition | Required behavior |
|---|---|
| Signaling unreachable (all strategies) | fast, visible "can't reach signaling" + manual-flow fallback; auto-retry with backoff and honest status (FR-020b/FR-023) |
| Version mismatch | explicit incompatible-version message |
| Wrong pool/network scope | named mismatch (which pool/network the peer was on) |
| Signature invalid / non-member commitment | drop; creator UI never lists the peer (FR-002) |
| Auth timeout (10 s) | drop silently; peer may retry via re-rendezvous |
| Nonce replayed | drop session attempt |
| Hub at capacity (50) | `bye{reason:"capacity"}` after auth, clear member-side message (FR-027) |
