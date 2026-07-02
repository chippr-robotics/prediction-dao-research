# Contract: Pool Channel Message Protocol (`fwpc/1`)

All traffic on an established data channel **after** the in-band `fwpc-hs/1`
auth exchange completes (see [handshake-payload.md](./handshake-payload.md);
pre-auth, only `auth` messages are accepted). Implemented by
`frontend/src/lib/pools/channel/envelope.js`, `channelState.js`,
`creatorHub.js`, `memberClient.js`.

## Envelope (every message)

```json
{
  "v": "fwpc/1",
  "chainId": 80002,
  "pool": "0x…",
  "session": "0x…",          // sessionId from handshake (nonce pair hash)
  "from": "creator" | "<commitment>",
  "seq": 7,                   // strictly increasing per sender per session
  "type": "<message type>",
  "body": { … },
  "sig": "<base64 nacl.sign.detached over canonical(v‖chainId‖pool‖session‖from‖seq‖type‖body)>"
}
```

**Receiver MUST enforce, in order** (all violations → drop message; repeated
violations → drop session per rate rules):
1. serialized size ≤ 8192 bytes (checked before parse);
2. `v` supported; unknown `v` → drop session with version message;
3. `chainId`/`pool`/`session` match the live session (FR-001, FR-020a);
4. `sig` verifies under the peer's certified `sessionPubKey` (FR-004/FR-005);
5. `seq` > `lastSeq` for this peer (replay/tamper defense, FR-005);
6. `type` known — unknown types are silently ignored (forward compat, FR-024);
7. rate limit: token bucket 10 msgs/10 s sustained, burst 20 (FR-024).

## Message types

| Type | Direction | Body | Notes |
|---|---|---|---|
| `hello` | both, once | `{}` | first message post-connect; proves session key liveness |
| `ping` / `pong` | both | `{}` | heartbeat every 15 s; 2 missed → connState degraded, 4 → closed (R5) |
| `snapshot` | creator → member | `{standings, announcements, presence}` | sent on session open (FR-008); full docs with versions |
| `standings-update` | creator → member | full `StandingsDoc` | latest-wins by `version` (R10); recipients render interim badge (FR-009) |
| `announcement` | creator → member | full announcements doc | bounded list ≤ 20; text ≤ 280 chars plain text; optional `action` deep-link id (FR-015/016) |
| `presence` | creator → member | `{connected: [commitment…], version}` | deduped by commitment (FR-026); display-only (FR-019) |
| `claim-code` | member → creator | `{boxed}` = nacl.box(`{commitment, claimCode}`, creator boxPubKey) | never forwarded/broadcast (FR-011); collapses per commitment |
| `claim-code-ack` | creator → member | `{commitment}` | delivery confirmation (FR-013); member UI flips to "delivered" |
| `bye` | both | `{reason}` | clean teardown: pool concluded (FR-025), replaced session (R11), declined capacity (FR-027) |

**Authority matrix** (FR-004/FR-017): `snapshot`, `standings-update`,
`announcement`, `presence`, `claim-code-ack` are valid **only from the
creator session**; `claim-code` only **from a member session**. Wrong-role
messages are dropped and count against the rate limit.

## Versioned documents (single writer)

- The creator increments a per-doc `version` on every change; receivers apply
  a doc iff `incoming.version > current.version` (idempotent, out-of-order
  safe, no history replay).
- Snapshot-on-connect + full-doc updates = a reconnecting member converges in
  one message (SC-007).
- Received docs are cached device-locally for honest "last known (possibly
  stale)" rendering when disconnected; staleness is always labeled.

## Hub behavior (creator side)

- ≤ 50 concurrent sessions (FR-027); session 51 receives `bye{reason:
  "capacity"}` before close and the member UI explains it.
- Sessions keyed by commitment; a newer authenticated session for the same
  commitment replaces the older (`bye{reason:"superseded"}`) — FR-026/R11.
- Fan-out: doc changes broadcast to all open sessions; per-session send queues
  are independent so one slow peer cannot stall others.
- Claim-code table keyed by commitment feeds the payout-allocation auto-fill
  (pending creator review, FR-012); duplicates collapse.

## Security invariants (tested)

1. No message is accepted before mutual handshake verification completes.
2. No envelope from session A is accepted on session B (session binding).
3. Replayed envelopes (seq ≤ lastSeq) are always dropped.
4. `claim-code` bodies are unreadable without the creator's box secret key —
  including by other members and by anything that captured the wire bytes.
5. Creator-authority types verify against the creator-certified session key
  chain rooted in the on-chain `creator()` address.
6. Nothing in this protocol writes to chain, calls a server, or blocks any
  on-chain pool action (FR-022: channel loss = feature loss, never fund loss).
