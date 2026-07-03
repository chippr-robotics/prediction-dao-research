# Research: Peer-to-Peer Pool Communication (Phase 0)

**Feature**: specs/038-webrtc-pool-comms | **Date**: 2026-07-02

Each decision below resolves a Technical Context unknown or a spec constraint.
Format: Decision / Rationale / Alternatives considered.

> **Revision 2026-07-02**: after the [alternatives.md](./alternatives.md)
> deep-dive, the user superseded the strictly-serverless clarification and
> chose the Trystero model (signaling-only rendezvous over public networks
> and/or a FairWins Cloud Run ws-relay). R1, R3, R5, R6, and R12 were revised
> in place; the manual copy/QR handshake design they replaced is preserved in
> git history (commit `fc7967e`).

---

## R1. Transport: WebRTC data channels via Trystero (revised)

**Decision**: WebRTC data channels remain the transport; **Trystero**
(`trystero`, one new dependency, ~58 KB min / ~22 KB gz measured) manages
signaling and peer connection lifecycle, isolated behind `rendezvous.js` (the
injectable seam for tests). Data channels only — no audio/video, no media
stack.

**Rationale**: WebRTC is the only browser primitive for browser↔browser data
(re-verified in alternatives.md — WebTransport is client-server only, P2P
WebTransport dormant). With the posture change admitting signaling-only
infrastructure, Trystero replaces the manual copy/QR handshake with automatic
rendezvous while keeping all message content strictly peer-to-peer: nothing
is persisted on, or readable by, signaling infrastructure (its payloads are
encrypted with the room secret). It is actively maintained (v0.25.2, June
2026), tiny relative to full p2p stacks (13× smaller than js-libp2p's browser
bundle), and supports multiple interchangeable signaling strategies — which
directly satisfies the no-single-provider requirement (FR-020b).

**Alternatives considered** (full evaluation in
[alternatives.md](./alternatives.md), web-verified with measured bundle
sizes):
- Raw `RTCPeerConnection` + manual copy/QR signaling: the original decision
  under the strictly-serverless posture; superseded by the user's 2026-07-02
  choice — the per-member out-of-band handshake was the feature's biggest
  friction and Trystero removes it at ~22 KB.
- `js-libp2p`: needs a circuit relay v2 anyway, ~287 KB gz measured, solves
  mesh/gossip problems a ≤50-peer star doesn't have.
- **OrbitDB**: permanent content-addressed replication — incompatible with
  FR-014 (claim codes must be deletable/never stored) by design.
- **Gun**: relay peers persist all data; unaudited crypto (SEA) with known
  serious flaws; near-dormant maintenance.
- **Waku/Logos**: requires fleet nodes; packaging in flux mid-rebrand.
- `simple-peer` / `peerjs`: peerjs requires its cloud broker; simple-peer is
  effectively unmaintained and adds a dependency without solving signaling.
- WebSocket/SSE: require a server — excluded by clarification.
- On-chain messaging (events as transport): costs gas per message, seconds-to-
  minutes latency, permanently public — fails FR-011 and SC-001 and contradicts
  spec 034's "nicknames never on-chain".
- WebTransport: server-client only (needs an HTTP/3 server) — not p2p.

## R2. ICE servers: no TURN; STUN default-on, disclosed, toggleable (flag resolved by posture change)

**Decision**: Configure **no TURN servers** — TURN carries the actual traffic
(a content relay, still excluded), and the platform's GCP Cloud Run cannot
host TURN's UDP allocation model anyway; symmetric-NAT↔symmetric-NAT pairs
therefore still fail, degrade to manual flows (FR-022/FR-023). Public STUN
servers ship **enabled by default and user-toggleable**, disclosed in the
pre-connection consent alongside IP/rendezvous-metadata exposure (FR-021).
The earlier "is STUN compatible with strictly serverless?" flag is **moot**
under the revised posture (signaling infrastructure is now explicitly
admitted; STUN is strictly less privileged than the admitted rendezvous).

**Rationale**: The clarification excludes rendezvous, signaling, and relay
services. STUN is none of these *functionally*: it is a stateless mirror that
tells a device its own public address; it cannot introduce peers, store
anything, or see message content — peers still exchange every byte of
connection material manually. Without STUN, two peers behind different NATs
usually cannot produce usable candidates, and connectivity collapses to
same-LAN and end-to-end IPv6 — which would gut SC-001/SC-002 for the common
"friends on different home networks" case. The honest engineering trade:
default-on STUN (with disclosure that the STUN operator sees your IP) preserves
the feature's viability; the toggle preserves the maximum-privacy stance for
those who chose the serverless posture for privacy. Accepted residual gap:
**symmetric-NAT↔symmetric-NAT pairs will fail without TURN** — the spec already
accepts this ("no connection possible across networks that block direct
peer-to-peer traffic"); the UI reports it truthfully and falls back to manual
flows (FR-022/FR-023).

**Alternatives considered**:
- No STUN at all (purest reading): kept available via the toggle, but as a
  default it makes cross-network pools mostly unable to connect — an
  effectively dead feature for the primary use case.
- Self-hosted STUN/TURN: FairWins-operated infra — excluded by clarification.
- ICE-TCP / port-forwarding instructions: unrealistic UX for this audience.

## R3. Rendezvous: pool-scoped Trystero room, member-derived secret, strategy fallback (revised)

**Decision**: Each pool channel is a Trystero room. `roomSecret.js` derives
`{appId, roomId, password}` from the pool's four-word phrase entropy + pool
address + chainId, via `@noble/hashes` HKDF with domain separation. The room
password engages Trystero's built-in encryption of signaling payloads.
Signaling strategy is configured, in order: **Nostr (default, public
relays)** → **FairWins ws-relay on GCP Cloud Run** (Trystero's `ws-relay`
strategy, self-hosted, content-blind, non-persisting) — automatic failover
between them satisfies FR-020b. Trickle ICE now works normally (live
signaling path exists), so connection setup is seconds, not copy-paste
minutes.

**Honest scope of the room secret (speckit-analyze finding C1)**: the
phrase's word indices are **emitted on-chain** by the pool factory (they are
how phrase→pool discovery works; see `usePools.js` reading
`ev.args.wordIndices`), so every derivation input is public and the room
descriptor is **derivable by non-members**. The room secret therefore
provides *scoping and uniqueness*, and opacity toward signaling operators who
don't correlate with chain data — it is **not an access control**. Access
control is exclusively the in-band auth handshake (R6): a camper who derives
the room can attempt connections but never passes auth, is dropped on the
auth timeout, is bounded by pending-connection caps (R9), and never reads
channel content. The residual exposure — a camper can observe rendezvous
presence and member network addresses during attempts — is disclosed in the
FR-021 consent (spec edge case "Room camping").

**Rationale**: Removes the feature's largest UX cost (per-member manual
handshake) per the user's decision, while message content remains strictly
p2p. Deriving room identity from the phrase keeps derivation local and
deterministic for members in any UI language (the entropy, not rendered
words, is the input) with no extra secret to distribute. The Cloud Run relay
gives FairWins an availability lever (public Nostr relays come with no SLA)
without becoming a content backend.

**Alternatives considered**:
- Manual non-trickle copy/QR signaling (the superseded design — preserved in
  git history at `fc7967e`): zero infrastructure but per-member handshake
  friction; rejected by user decision after alternatives review.
- A creator-generated random channel secret distributed out-of-band alongside
  the phrase: would make rooms truly non-derivable, but reintroduces a second
  shared secret and breaks the "share only four words" product story;
  recorded as optional future hardening, not v1.
- Stopping the on-chain emission of word indices (spec 034 factory change):
  removes the public derivability at the root, but requires a contract
  upgrade and breaks phrase→pool discovery as built — out of scope here.
- FairWins relay as the *only* strategy: single-provider dependency, fails
  FR-020b and re-centralizes what can stay decentralized by default.

## R4. Topology: star with the creator as hub

**Decision**: Each member holds exactly one connection, to the creator. The
creator's device fans out standings/announcements/presence and receives claim
codes. Hub capacity: hard cap 50 concurrent sessions (FR-027), decline #51+
with a clear message.

**Rationale**: Every required flow is creator-centric (US1–US4): creator is the
single writer for standings/announcements, sole recipient of claim codes, and
natural presence authority. A star needs n connections and one auth
verification path, whereas a mesh needs O(n²) links, buys nothing the
requirements ask for, and multiplies the IP-exposure surface (each member's
address visible to every member instead of only the creator). Claim-code
confidentiality (FR-011) becomes topological: the message only ever exists on
the member↔creator link. 50 `RTCPeerConnection`s with idle data channels is
well inside browser per-tab limits (hundreds) and trivial bandwidth (KB-scale
messages).

**Alternatives considered**:
- Full mesh: O(n²) links and full-pool IP exposure; nothing requires
  member↔member links (member chat is out of scope).
- Supernode relay (members relay to members): adds forwarding logic and trust
  analysis for zero required functionality; violates YAGNI. Revisit only if a
  future feature needs creator-offline broadcast.

## R5. Reconnection: automatic re-rendezvous (revised)

**Decision**: A dropped session reconnects **automatically**: the client stays
joined to (or rejoins) the Trystero room and re-runs the in-band auth
handshake when the peer reappears; heartbeat ping/pong every 15 s detects
death fast, and the creator hub's per-commitment state (nickname row, last
claim-code state) means a reconnecting member converges instantly via
snapshot (FR-008). The UI shows truthful intermediate states ("reconnecting…",
"creator unreachable") — automatic retry with honest status, never a fake
connected state (constitution III).

**Rationale**: The live signaling path is exactly what the posture change
buys; the superseded manual re-pairing flow was this design's biggest
operational weakness.

**Alternatives considered**: manual re-pairing (superseded design); unbounded
silent retry without status (spinner theater, against constitution III —
retry backs off and surfaces state transitions).

## R6. Peer authentication: Semaphore identity (members), on-chain creator address (creator)

**Decision**: Auth is an **in-band handshake** — the first and only messages
accepted on a freshly connected data channel (`sessionAuth.js`); the room
secret grants rendezvous only, never channel access. The handshake binds,
under a signature, the tuple
`(chainId, poolAddress, role, sessionNonce, sessionPubKey[, boxPubKey])`:
- **Member → creator**: signed with the member's Semaphore identity secret
  (`Identity.signMessage`, EdDSA); payload carries the public commitment. The
  creator verifies the signature against the commitment
  (`Identity.verifySignature`) and requires the commitment ∈ the pool's
  on-chain member set (Joined events already read by `usePools`). Nickname
  attribution then reuses `nickname.js` — peers are nickname-identified,
  wallets never appear (FR-003).
- **Creator → member**: one EIP-191 wallet signature over the same tuple;
  members verify the recovered address equals the pool's on-chain `creator()`.
  The creator's address is already public pool metadata, and spec attribution
  is "by role", so this discloses nothing new.
- Both handshakes certify an **ephemeral tweetnacl keypair** (`sessionPubKey`,
  plus the creator's `boxPubKey` for claim-code encryption); all subsequent
  envelopes are signed with session keys (R7), so neither side is prompted per
  message. **Key-reuse policy (analyze finding C2)**: the certified keypair is
  generated once per app session per (account, pool), held in memory only, and
  **reused across automatic reconnects with fresh nonces** — the wallet/
  identity prompt happens on first channel use in an app session (or on
  account/network switch), never on every reconnect. Peers that fail (or never
  complete) the handshake within a short timeout are dropped. **MITM analysis**: a hostile peer holding the room
  secret cannot forge either signature, so it can never impersonate the
  creator or a member; at worst it passively relays already-signed envelopes,
  which exposes only data every pool member receives anyway
  (standings/announcements/presence) and never claim codes (boxed to the
  wallet-certified creator key). Injecting or tampering fails signature
  verification (FR-005).

**Rationale**: Reuses exactly the identity material members already hold
(spec assumption "Identity reuse"); no registration step, no new trust roots.
Membership verification is against on-chain truth, not a list a peer asserts.
Presence-by-nickname (US4) requires knowing *which* commitment connected — so
commitment-revealing auth to the creator is the designed behavior, not a leak
(votes remain protected by Semaphore proofs, untouched by this feature).

**Alternatives considered**:
- Anonymous Semaphore *proof* of membership (not revealing which member):
  contradicts nickname presence/attribution requirements (FR-012 hand-off
  binding, US4), and proof generation is seconds-slow for zero requirement.
- Wallet signatures for members: violates FR-003 (wallet disclosure).
- TOFU (trust the out-of-band channel alone): fails FR-002/FR-005 —
  impersonation via a leaked payload would be undetectable.

## R7. Message envelopes: session-key signatures, monotonic sequence, size caps

**Decision**: Every message is a versioned envelope
`{v:"fwpc/1", chainId, pool, session, from, seq, type, body, sig}` signed by
the sender's certified session key (nacl `sign.detached`). Receivers enforce:
known session, strictly increasing `seq` per sender-session (replay defense,
FR-005), 8 KB max serialized size, known `type` (unknown → ignored per FR-024).
Session binding (`session` = the handshake nonce pair) prevents cross-session
and cross-pool replay (FR-020a).

**Rationale**: DTLS already gives transport confidentiality/integrity per
link, but application-layer signatures give **attribution** (creator-authority
messages verifiable as creator, FR-004) and survive any future multi-hop
forwarding. Monotonic seq is sufficient replay protection on an ordered
reliable channel — no timestamp clocks needed (and `Date`-free logic stays
unit-testable).

**Alternatives considered**: Per-message identity/wallet signatures (identity
is fine for members but wallet prompts per message for the creator are
unusable); MLS/group encryption (massive machinery; the star topology plus
DTLS already scopes readability per-link).

## R8. Claim-code hand-off: boxed to creator session key + explicit ack

**Decision**: The `claim-code` message body is `nacl.box`-encrypted to the
creator's certified session public key before enveloping (defense in depth on
top of DTLS), carries the sender's commitment + claim code, auto-fills the
creator's payout allocation for that nickname (pending creator review, FR-012),
and is acknowledged with a signed `claim-code-ack` so the member sees delivery
confirmation (FR-013). Duplicate sends from the same commitment collapse
(FR-026). The existing copy-paste flow in `PoolResolutionActions.jsx` remains
untouched as the fallback (FR-022).

**Rationale**: Boxing makes "readable by creator only" (FR-011) hold even if a
future change ever forwards envelopes; ack is required by FR-013 and trivially
cheap. Claim codes are deliberately-revealed-to-creator values (spec
assumption), so this is defense in depth, not load-bearing secrecy.

**Alternatives considered**: DTLS-only (fails defense-in-depth posture for the
one message class the spec singles out); on-chain hand-off (already rejected —
claim codes must never be on-chain, FR-014).

## R9. Abuse resistance: token bucket per peer + fixed caps

**Decision**: Hub enforces per-session token-bucket rate limits (e.g. 10
messages / 10 s sustained, burst 20), 8 KB size cap pre-parse, and drops
sessions that exceed limits repeatedly; members apply the same limits to the
creator link. Presence and standings rendering are O(members) with capped list
sizes.

**Rationale**: FR-024. On a star, a flooding member can only hurt the creator
link — limits + drop confine the blast radius; other members are unaffected by
construction.

## R10. State sync: single-writer versioned documents, snapshot + latest-wins

**Decision**: Two creator-owned documents per pool channel: `standings`
(ordered rows keyed by commitment, plus display metadata) and `announcements`
(bounded list, each with optional action deep-link id). Each carries a
monotonically increasing `version`. On connect/re-pair the hub sends a
`snapshot` (both docs); afterwards incremental `standings-update` /
`announcement` messages carry full replacement docs (they're small) with the
next version; receivers apply iff `version` is greater (FR-008, idempotent,
no history replay). Received docs are cached in `localStorage`
(display-only, safe-by-construction pattern from `identityCache.js`) so a
member who reopens the app sees last-known state marked "possibly stale"
(honest-state) until re-paired.

**Rationale**: Exactly one writer (the creator, FR-017) means no CRDT/merge
problem exists; latest-wins versions are the simplest correct model
(constitution: YAGNI). Full-document updates dodge diff/patch bugs at our
sizes (≤50 rows).

**Creator persistence (analyze finding C4)**: the creator persists their
authored docs *and version counters* device-locally (same display-cache key
family as the member cache) and resumes the monotonic sequence after a page
reload — otherwise a reloaded creator restarts at version 0 and members
holding higher versions would correctly reject every subsequent update.

**Alternatives considered**: CRDTs (no concurrent writers exist), event-log
replay (violates "converge, don't replay" edge case; unbounded growth).

## R11. Multi-tab / multi-device sessions

**Decision**: Hub keys sessions by commitment; a new authenticated session for
an already-connected commitment **replaces** the old one (newest wins, old link
closed with a reason). Presence counts commitments, not sockets. Claim-code
state keys by commitment, so duplicates collapse regardless of which device
sent them (FR-026).

**Creator hub leadership (analyze finding C3)**: at most **one active hub**
per (account, pool) per device: hub tabs coordinate via a `BroadcastChannel`
leadership claim (newest claim wins; the superseded tab closes its sessions
with `bye{reason:"superseded-hub"}` and downgrades to a passive view). A
creator opening a second *device* is the same newest-wins rule from the
members' perspective: they follow whichever hub authenticated most recently,
and doc versions stay monotonic because the creator persists version counters
(R10).

**Rationale**: Newest-wins matches user intent ("my other tab died, I opened a
new one") and avoids ghost sessions inflating presence — and, for the hub
role, prevents two live hubs forking standings state.

## R12. Feasibility spike (first implementation task) + test strategy

**Decision**: Before UI work, a spike validates on real devices/networks:
(1) Trystero **Nostr strategy** connects two browsers on different home
networks and measures time-to-data-channel; (2) **failover** to a locally run
`ws-relay` instance when Nostr relays are blocked/unreachable (FR-020b), and
the same relay containerized for Cloud Run; (3) **room-secret gating** — a
client with the wrong secret never rendezvouses with the pool room; (4) STUN
off mode (expect LAN/IPv6-only); (5) 50 sessions against one hub tab stay
responsive. Results are recorded in `research.md` as an addendum; if (1)
fails materially, the default-strategy ordering (Nostr vs FairWins relay)
flips with measured justification. Automated testing: protocol modules are
pure (no `Date.now` in logic paths — versions and nonces injected) with Vitest
unit tests; a fake rendezvous (in-memory linked pair behind the
`rendezvous.js` seam) drives hub+client integration tests without touching
the network; axe tests cover the new UI.

**Rationale**: The spec names connectivity the riskiest assumption;
constitution II demands tests alongside behavior — pure-core design makes the
protocol testable without a browser, and the injectable `rendezvous.js`
adapter is the seam.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| Transport & library | R1 (revised): WebRTC data channels via Trystero (one new dep, ~22 KB gz) |
| NAT traversal | R2: no TURN (Cloud Run can't host it; accepted gap); STUN default-on, toggleable, disclosed |
| Rendezvous/signaling | R3 (revised): pool-scoped Trystero room, phrase-derived secret, Nostr default → FairWins Cloud Run ws-relay fallback |
| Topology & scale (FR-027) | R4: creator-hub star, hard cap 50 |
| Reconnection | R5 (revised): automatic re-rendezvous + honest status UX |
| Peer auth (FR-002/003/004) | R6 (revised): in-band handshake — Semaphore identity / on-chain creator address + session keys |
| Replay/tamper (FR-005) | R7: signed envelopes, monotonic seq, session binding |
| Claim-code confidentiality (FR-011/013) | R8: nacl.box to creator + signed ack |
| Flooding (FR-024) | R9: token bucket + size caps + drop |
| Late-join catch-up (FR-008) | R10: snapshot + latest-wins versioned docs |
| Multi-tab (FR-026) | R11: per-commitment newest-wins |
| Riskiest-assumption validation | R12 (revised): strategy/connectivity spike before UI; fake-rendezvous Vitest strategy |
| Alternative stacks (libp2p/OrbitDB/Gun/Trystero/Waku) | [alternatives.md](./alternatives.md): evaluated; **Trystero adopted** after posture change (2026-07-02); others rejected |
