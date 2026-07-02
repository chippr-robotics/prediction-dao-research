# Implementation Plan: Peer-to-Peer Pool Communication

**Branch**: `claude/webrtc-zk-pool-peers-5eudhx` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/038-webrtc-pool-comms/spec.md`

## Summary

Add a per-pool, real-time communication channel for ZK-Wager Pools using
**browser-native WebRTC data channels in a creator-hub (star) topology**, with
**strictly serverless connection establishment**: members and the creator pair
by exchanging a compact, signed connection payload out-of-band (copy-paste or
QR — both already supported by existing dependencies). The channel carries four
structured message flows — creator standings updates, creator announcements,
member→creator claim-code hand-off, and presence — authenticated with the
member's existing per-pool Semaphore identity (members) and the on-chain
creator address (creator). **Zero new runtime dependencies and zero contract
changes**: the entire feature is frontend modules + tests. The channel is
strictly additive; every existing manual flow remains the fallback.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 + Vite (existing frontend stack)

**Primary Dependencies**: Browser-native `RTCPeerConnection`/`RTCDataChannel`
(no wrapper library); existing deps only — `@semaphore-protocol/identity`
(peer auth), `tweetnacl` (session keys, claim-code boxing), `@noble/hashes`
(digests), `qrcode.react` (QR render), `html5-qrcode` (QR scan), `ethers`/
`wagmi` (creator signature + on-chain member-set reads). **No new packages.**

**Storage**: None server-side (strictly serverless). Device-local only:
in-memory session state; `localStorage` for non-secret display state (last
received standings/announcements per pool, channel consent flag), following the
`identityCache.js` safe-by-construction pattern.

**Testing**: Vitest (unit + integration via an in-memory loopback
`RTCPeerConnection` mock pair) in `frontend/src/test/`; `vitest-axe` for the
new UI; Cypress flow optional later. Protocol logic is pure functions,
testable without WebRTC.

**Target Platform**: Evergreen desktop + mobile browsers (Chrome, Firefox,
Safari ≥ 15) — same support envelope as the existing frontend. WebRTC data
channels are baseline in all of them.

**Project Type**: Web application (frontend-only feature; no contracts, no
subgraph, no services changes)

**Performance Goals**: Standings update visible to every connected member ≤ 5 s
(SC-001; direct DataChannel delivery is ms-scale); late-join snapshot ≤ 10 s
after session up (SC-007); claim-code hand-off end-to-end < 30 s including the
human out-of-band step (SC-002).

**Constraints**: No signaling/rendezvous/relay server of any kind (spec
Clarifications 2026-07-02); handshake payload must fit a scannable QR
(≤ ~1.8 KB after compaction); one wallet-signature prompt at most per channel
session per device; no TURN ever; STUN only per the flagged research decision
(user-toggleable, disclosed; see research.md R2); IP-exposure consent before
first connection (FR-021).

**Scale/Scope**: Design target 25–50 concurrently connected members per pool
(FR-027/SC-010; hard cap enforced at 50 hub sessions + graceful decline);
message size cap 8 KB; per-peer rate limit (research R9). The ~1,000-member
pool cap is unaffected — on-chain flows never depend on the channel.

## Constitution Check

*GATE: evaluated pre-Phase 0 and re-checked post-Phase 1 design — PASS (no
violations; no Complexity Tracking entries needed).*

- **I. Security-First Smart Contracts**: PASS (N/A + inherited). No `contracts/`
  changes — nothing on-chain is added, and the channel is explicitly barred
  from consensus-bearing actions (spec Out of Scope). The channel's own
  security surface (peer auth, replay, claim-code confidentiality) is treated
  with contract-grade rigor in `contracts/channel-protocol.md` and research
  R6–R8, and gets a security review before merge since it touches the
  claim-code flow.
- **II. Test-First / Coverage**: PASS. All protocol logic (SDP compaction,
  handshake build/parse/verify, envelope sign/verify/replay, state merge, rate
  limiting, hub session dedupe) ships as pure modules with Vitest tests,
  including failure/edge cases (bad signatures, replays, oversized messages,
  stale snapshots, full hub). A loopback integration test drives two in-memory
  peers end-to-end.
- **III. Honest State**: PASS. Channel data is rendered as interim/off-chain
  and creator-attributed (FR-009); connection state is truthful ("creator
  unreachable", "could not connect" — no fake connected states); everything is
  scoped by `(chainId, poolAddress)` so nothing leaks across networks
  (FR-001/spec assumption). The loopback WebRTC mock lives only in test scope.
- **IV. Fail Loudly in CI**: PASS. Standard lint/test/build gates; no
  `continue-on-error` additions.
- **V. Accessible, Consistent Frontend**: PASS. Pairing UI (copy + QR), consent
  dialog, live regions for standings updates, and announcement surfaces get
  axe coverage in `pools.axe.test.jsx` style; QR always has a copyable text
  equivalent (QR is never the only path).
- **Additional constraints — new core technology**: WebRTC is a browser
  platform API, not a new package; no new runtime dependency is introduced.
  Justification recorded anyway (research R1) per constitution.
- **Simplicity (YAGNI)**: Star topology + single-writer state documents avoid
  mesh routing, CRDTs, and gossip protocols the requirements don't need.

## Project Structure

### Documentation (this feature)

```text
specs/038-webrtc-pool-comms/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R12 (feasibility spike design)
├── data-model.md        # Phase 1: entities, validation, state machines
├── quickstart.md        # Phase 1: runnable validation guide
├── contracts/
│   ├── channel-protocol.md    # Message envelope + message-type contracts
│   └── handshake-payload.md   # Out-of-band pairing payload contract
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
frontend/src/lib/pools/channel/          # NEW: protocol core (pure modules first)
├── sdpCompact.js        # minimal-SDP encode/decode (offer/answer ⇄ compact form)
├── handshake.js         # pairing payload build/parse/verify (see contracts/handshake-payload.md)
├── envelope.js          # signed message envelopes: auth, seq/replay, size guards
├── channelState.js      # single-writer standings/announcements docs, snapshot + merge
├── rateLimit.js         # per-peer token bucket
├── creatorHub.js        # creator side: ≤50 sessions, per-commitment dedupe, fan-out
├── memberClient.js      # member side: single session to creator, snapshot intake
└── webrtc.js            # thin RTCPeerConnection/DataChannel adapter (injectable for tests)

frontend/src/hooks/
└── usePoolChannel.js    # React surface: role detection, session lifecycle, state

frontend/src/components/pools/channel/   # NEW: UI
├── ChannelPairingPanel.jsx   # consent (IP exposure) + copy/QR offer-answer exchange
├── LiveStandingsPanel.jsx    # interim standings feed (marked off-chain), integrates PoolParticipants
├── PoolAnnouncements.jsx     # creator announcements + action deep-links
└── SendClaimCodeAction.jsx   # member→creator hand-off; extends PoolResolutionActions flow

frontend/src/test/                        # Vitest (existing convention)
├── poolChannelSdpCompact.test.js
├── poolChannelHandshake.test.js
├── poolChannelEnvelope.test.js
├── poolChannelState.test.js
├── poolChannelHub.test.js               # incl. loopback integration pair
└── poolChannel.axe.test.jsx
```

**Structure Decision**: Frontend-only web-app structure. Protocol core lives
beside the other pool modules in `frontend/src/lib/pools/channel/` (flat,
dependency-light, pure-function-first so Vitest covers it without a browser);
UI components join the existing `frontend/src/components/pools/` tree; tests
follow the existing `frontend/src/test/*.test.js` convention. No `contracts/`,
`subgraph/`, or `services/` changes.

## Design Overview

**Topology (research R4)**: Star, creator = hub. Members connect only to the
creator. Standings, announcements, and presence fan out creator→members;
claim codes travel member→creator on that member's own DTLS-encrypted link and
are never forwarded — FR-011 falls out of the topology. 25–50 concurrent
`RTCPeerConnection`s in one tab is comfortably within browser limits.

**Pairing (research R3, contracts/handshake-payload.md)**: Member's device
creates an offer with full ICE gathering (non-trickle), compacts it
(`sdpCompact.js`), wraps it in a signed payload, and the member sends it to the
creator over any channel they already use (the same place the four words were
shared). Creator ingests (paste or QR scan), the app emits a signed answer
payload back the same way. Two out-of-band messages per member; the creator can
process them in batch. Reconnection after a drop requires a fresh pairing
(no signaling path exists to renegotiate) — sessions are kept alive with
heartbeats to make drops rare, and the UX keeps the "re-pair" path one tap away.

**Authentication (research R6)**: Members authenticate with their existing
per-pool Semaphore identity — the handshake payload embeds the member's public
commitment plus an identity signature over
`(chainId, poolAddress, role, sessionNonce, DTLS-fingerprint, ephemeralPubKey)`;
the creator verifies the signature and checks the commitment against the
pool's on-chain member set. The creator authenticates the same tuple with one
EIP-191 wallet signature verified against the pool's on-chain `creator`
address (already public pool metadata; members are never wallet-identified,
FR-003). Each side certifies an **ephemeral session keypair** (tweetnacl) in
the handshake; all subsequent envelopes are signed by session keys — at most
one wallet prompt per session per device (members' identity derivation is
itself one wallet signature they already perform for pool actions).

**Message protocol (contracts/channel-protocol.md)**: Versioned envelopes
(`fwpc/1`) with `(chainId, pool, session, seq, type, body, sig)`; strictly
increasing per-sender `seq` for replay resistance (FR-005); 8 KB size cap and
per-peer rate limits (FR-024); unknown types ignored. State is **single-writer**
(creator) versioned documents — standings doc + announcements list — delivered
as snapshot-on-connect then incremental updates with latest-wins versions
(FR-008, no history replay). Claim-code bodies are additionally boxed to the
creator's session public key (defense in depth over DTLS) and acked back to the
sender (FR-013). Presence derives from live hub sessions, deduped by
commitment (FR-026), and is broadcast by the creator.

**Feasibility spike (research R12, quickstart.md)**: The riskiest assumption —
WebRTC connects with manual signaling and no TURN under the serverless posture —
is validated first by a spike task (two real devices/networks) before UI work
begins; the STUN toggle decision (R2) is confirmed or revisited with measured
data from that spike.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
