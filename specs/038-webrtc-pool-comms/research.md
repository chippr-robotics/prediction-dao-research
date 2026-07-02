# Research: Peer-to-Peer Pool Communication (Phase 0)

**Feature**: specs/038-webrtc-pool-comms | **Date**: 2026-07-02

Each decision below resolves a Technical Context unknown or a spec constraint.
Format: Decision / Rationale / Alternatives considered.

---

## R1. Transport: browser-native WebRTC data channels, no wrapper library

**Decision**: Use the platform `RTCPeerConnection` + `RTCDataChannel` APIs
directly, behind a thin injectable adapter (`webrtc.js`). Data channels only —
no audio/video, no media stack.

**Rationale**: WebRTC is the only browser-native transport that allows two
browsers to exchange data directly without any server carrying the traffic —
which the strictly-serverless clarification demands. Data channels give
ordered/reliable delivery (SCTP over DTLS) with built-in transport encryption.
Using the raw API adds **zero runtime dependencies** (constitution: new core
tech must be justified; a platform API with no package is the minimal
footprint). Our needs (star topology, one data channel per pair, manual
signaling) don't benefit from a wrapper.

**Alternatives considered**:
- `simple-peer` / `peerjs`: convenience wrappers; peerjs requires its cloud
  broker (excluded — serverless), simple-peer is effectively unmaintained and
  adds a dependency for what is ~200 lines of adapter code here.
- `libp2p` (js): full p2p stack; heavy bundle, and its useful transports
  (circuit relay, rendezvous) all require infrastructure we're barred from.
- WebSocket/SSE: require a server — excluded by clarification.
- On-chain messaging (events as transport): costs gas per message, seconds-to-
  minutes latency, permanently public — fails FR-011 and SC-001 and contradicts
  spec 034's "nicknames never on-chain".
- WebTransport: server-client only (needs an HTTP/3 server) — not p2p.

## R2. ICE servers: no TURN ever; STUN optional, disclosed, default-on — FLAGGED for user confirmation

**Decision**: Configure **no TURN servers** (a TURN relay carries traffic — a
"relay service" the clarification excludes). For STUN: ship with a small set of
well-known public STUN servers **enabled by default but user-toggleable**, and
disclose STUN in the same pre-connection consent as IP exposure (FR-021).
Disabling STUN leaves host/mDNS/IPv6 candidates only. The Phase-1 feasibility
spike (R12) measures both modes; this decision is **flagged** as an
interpretation of "strictly serverless" for the user to confirm or veto at
`/speckit-tasks` or in PR review.

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

## R3. Serverless signaling: non-trickle offer/answer, compacted, copy/QR carried

**Decision**: Manual signaling with **complete (non-trickle) ICE gathering**:
the app waits for `icegatheringstatechange → complete` (with a 5 s cap) before
emitting the payload, so one payload carries everything. The SDP is **compacted
to a minimal field set** — ICE ufrag/pwd, DTLS fingerprint, and candidate list
(with mDNS hostnames preserved) — then the full SDP is deterministically
reconstructed on the receiving side (`sdpCompact.js`). Payload is wrapped per
`contracts/handshake-payload.md` (versioned, checksummed, base64url) and
carried by copy-paste or QR. Target ≤ ~1.8 KB so `qrcode.react` renders a
scannable code; `html5-qrcode` (already used for wallet-address QR, spec 011)
scans it back.

**Rationale**: Trickle ICE requires a live signaling path — we don't have one;
non-trickle is the standard "manual signaling" pattern. Raw browser SDP runs
1–3 KB of mostly-constant lines; compaction keeps QR codes at a scannable
density and copy-paste blobs short. Deterministic reconstruction (not SDP
munging on live objects) keeps the module pure and unit-testable.

**Alternatives considered**:
- Shipping raw SDP: works but QR density becomes marginal on low-end cameras;
  compact form is strictly better and testable.
- Trickle with progressive QR frames: complexity without benefit at our scale.
- Encoding into a BIP-39 word phrase (brand-consistent): ~1.5 KB → hundreds of
  words; unusable.

## R4. Topology: star with the creator as hub

**Decision**: Each member holds exactly one connection, to the creator. The
creator's device fans out standings/announcements/presence and receives claim
codes. Hub capacity: hard cap 50 concurrent sessions (FR-027), decline #51+
with a clear message.

**Rationale**: Every required flow is creator-centric (US1–US4): creator is the
single writer for standings/announcements, sole recipient of claim codes, and
natural presence authority. A star needs exactly one manual pairing per member
(the minimum possible under serverless signaling), whereas a mesh needs
O(n²) pairings — absurd with manual handshakes. Claim-code confidentiality
(FR-011) becomes topological: the message only ever exists on the member↔
creator link. 50 `RTCPeerConnection`s with idle data channels is well inside
browser per-tab limits (hundreds) and trivial bandwidth (KB-scale messages).

**Alternatives considered**:
- Full mesh: O(n²) manual handshakes; nothing requires member↔member links
  (member chat is out of scope).
- Supernode relay (members relay to members): adds forwarding logic and trust
  analysis for zero required functionality; violates YAGNI. Revisit only if a
  future feature needs creator-offline broadcast.

## R5. Reconnection under serverless signaling

**Decision**: A dropped session requires a fresh pairing (new offer/answer).
Mitigations: (a) heartbeat ping/pong every 15 s keeps NAT bindings and detects
death fast; (b) sessions survive transient stalls via SCTP retransmission —
only ICE failure/close tears down; (c) the UI keeps "re-pair with creator" one
tap away and pre-fills everything except the out-of-band exchange; (d) the
creator's hub keeps the member's row (nickname, last claim-code state) so a
re-pair restores context instantly via snapshot (FR-008).

**Rationale**: ICE restart needs a signaling path — by construction we have
none once the link is dead. Honest-state principle (constitution III) means we
show a truthful "disconnected — re-pair to reconnect" rather than pretending.
While a channel is still open, in-band renegotiation over the data channel is
possible (perfect-negotiation pattern) and is noted as a future enhancement for
network-change survival, not required for v1.

**Alternatives considered**: Persisting ICE credentials for silent reconnect
(doesn't survive NAT rebinding; false hope), background retry loops (spinner
theater against constitution III).

## R6. Peer authentication: Semaphore identity (members), on-chain creator address (creator)

**Decision**: The handshake payload binds, under a signature, the tuple
`(chainId, poolAddress, role, sessionNonce, dtlsFingerprint, sessionPubKey)`:
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
- Both handshakes certify an **ephemeral tweetnacl keypair** (`sessionPubKey`);
  all subsequent envelopes are signed with session keys (R7), so neither side
  is prompted per message. DTLS fingerprint binding defeats
  man-in-the-middle-at-pairing: a tampered payload fails signature; a swapped
  fingerprint fails DTLS.

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

**Alternatives considered**: CRDTs (no concurrent writers exist), event-log
replay (violates "converge, don't replay" edge case; unbounded growth).

## R11. Multi-tab / multi-device sessions

**Decision**: Hub keys sessions by commitment; a new authenticated session for
an already-connected commitment **replaces** the old one (newest wins, old link
closed with a reason). Presence counts commitments, not sockets. Claim-code
state keys by commitment, so duplicates collapse regardless of which device
sent them (FR-026).

**Rationale**: Newest-wins matches user intent ("my other tab died, I opened a
new one") and avoids ghost sessions inflating presence.

## R12. Feasibility spike (first implementation task) + test strategy

**Decision**: Before UI work, a spike validates on real devices/networks:
(1) manual copy/QR offer-answer connects two browsers on different home
networks with STUN on; (2) the same with STUN off (expect LAN/IPv6-only);
(3) payload size after compaction fits QR; (4) 50 loopback sessions on one tab
stay responsive. Results are recorded in `research.md` as an addendum; if (1)
fails materially, the R2 STUN default and the spec's serverless trade-offs go
back to the user before further work. Automated testing: protocol modules are
pure (no `Date.now` in logic paths — versions and nonces injected) with Vitest
unit tests; an in-memory `RTCPeerConnection` fake (pair of linked adapters)
drives hub+client integration tests; axe tests cover the new UI.

**Rationale**: The spec names this the riskiest assumption; constitution II
demands tests alongside behavior — pure-core design makes the protocol
testable without a browser, and the injectable `webrtc.js` adapter is the seam.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| Transport & library | R1: native WebRTC data channels, zero new deps |
| NAT traversal under serverless posture | R2: no TURN; STUN default-on, toggleable, disclosed (**flagged**) |
| Handshake mechanics & payload size | R3: non-trickle, compacted SDP, copy/QR ≤ ~1.8 KB |
| Topology & scale (FR-027) | R4: creator-hub star, hard cap 50 |
| Reconnection | R5: re-pair; heartbeats; honest disconnect UX |
| Peer auth (FR-002/003/004) | R6: Semaphore identity / on-chain creator address + session keys |
| Replay/tamper (FR-005) | R7: signed envelopes, monotonic seq, session binding |
| Claim-code confidentiality (FR-011/013) | R8: nacl.box to creator + signed ack |
| Flooding (FR-024) | R9: token bucket + size caps + drop |
| Late-join catch-up (FR-008) | R10: snapshot + latest-wins versioned docs |
| Multi-tab (FR-026) | R11: per-commitment newest-wins |
| Riskiest-assumption validation | R12: device spike before UI; pure-core Vitest strategy |
