# Implementation Plan: Peer-to-Peer Pool Communication

**Branch**: `claude/webrtc-zk-pool-peers-5eudhx` | **Date**: 2026-07-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/038-webrtc-pool-comms/spec.md`

## Summary

Add a per-pool, real-time communication channel for ZK-Wager Pools using
**WebRTC data channels in a creator-hub (star) topology**, with **automatic,
content-blind signaling via Trystero** (clarified 2026-07-02, superseding the
strictly-serverless posture): peers rendezvous in a pool-scoped room over
public decentralized signaling (Nostr strategy by default), with a
**lightweight FairWins-operated ws-relay on GCP Cloud Run** as a configured
alternative/fallback strategy. Room discovery is gated by pool-member
knowledge (phrase-derived room secret); peers then authenticate **in-band**
with the member's existing per-pool Semaphore identity (members) and the
on-chain creator address (creator) before any channel traffic is accepted.
The channel carries four structured message flows — creator standings updates,
creator announcements, member→creator claim-code hand-off, and presence.
**One new runtime dependency (`trystero`, ~22 KB gz — justified in
alternatives.md) and zero contract changes**: the feature is frontend modules
+ tests, plus an optional tiny signaling relay service. The channel is
strictly additive; every existing manual flow remains the fallback.

## Technical Context

**Language/Version**: JavaScript (ES2022), React 18 + Vite (existing frontend stack)

**Primary Dependencies**: **`trystero` (NEW, ~58 KB min / ~22 KB gz)** for
room-based WebRTC signaling (Nostr strategy default, `ws-relay` strategy for
the FairWins Cloud Run relay); browser-native `RTCPeerConnection`/
`RTCDataChannel` underneath. Existing deps for everything else —
`@semaphore-protocol/identity` (peer auth), `tweetnacl` (session keys,
claim-code boxing), `@noble/hashes` (room-secret derivation, digests),
`ethers`/`wagmi` (creator signature + on-chain member-set reads). Optional
`services/signaling-relay/`: Trystero-compatible WebSocket relay (Node, no
framework beyond the existing `services/` conventions) on GCP Cloud Run.

**Storage**: No server-side content storage — the optional signaling relay is
stateless and non-persisting by contract (FR-020). Device-local only:
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

**Project Type**: Web application — frontend feature (no contracts, no
subgraph) plus an **optional** minimal signaling relay under `services/`
(Cloud Run), which the frontend treats as one interchangeable signaling
strategy among several.

**Performance Goals**: Standings update visible to every connected member ≤ 5 s
(SC-001; direct DataChannel delivery is ms-scale); late-join snapshot ≤ 10 s
after session up (SC-007); claim-code hand-off end-to-end < 30 s (SC-002);
rendezvous to open data channel in seconds (measured in the R12 spike).

**Constraints**: Signaling-only, content-blind, non-persisting rendezvous
(FR-020) — signaling payloads are already encrypted by Trystero with the
room secret, and our auth/envelope layer runs on top; no single-provider hard
dependency (FR-020b: strategy fallback Nostr ⇄ FairWins ws-relay); room
secrets derived from pool-member knowledge, never enumerable (FR-020a); one
wallet-signature prompt at most per channel session per device; **no TURN /
media relay** (Cloud Run cannot host TURN's UDP anyway — accepted NAT-pair
failure mode remains); STUN per research R2 (default-on, disclosed,
toggleable); IP/metadata-exposure consent before first connection (FR-021).

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
- **Additional constraints — new core technology**: One new runtime dependency,
  `trystero` (~22 KB gz, actively maintained), justified by the full
  alternatives evaluation in [alternatives.md](./alternatives.md) and the
  2026-07-02 posture clarification: it removes the manual-handshake friction
  while keeping content strictly peer-to-peer, and it is 13× smaller than the
  nearest full-stack alternative (js-libp2p). WebRTC itself remains a browser
  platform API. The optional Cloud Run signaling relay is signaling-only and
  content-blind by contract (FR-020) — it is not a content backend.
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
├── roomSecret.js        # pool-scoped room id + secret derivation (FR-020a)
├── rendezvous.js        # Trystero room join: strategy config (nostr default,
│                        #   ws-relay fallback), peer lifecycle events
├── sessionAuth.js       # in-band signed auth handshake (see contracts/handshake-payload.md)
├── envelope.js          # signed message envelopes: auth, seq/replay, size guards
├── channelState.js      # single-writer standings/announcements docs, snapshot + merge
├── rateLimit.js         # per-peer token bucket
├── creatorHub.js        # creator side: ≤50 sessions, per-commitment dedupe, fan-out
└── memberClient.js      # member side: single session to creator, snapshot intake

frontend/src/hooks/
└── usePoolChannel.js    # React surface: role detection, session lifecycle, state

frontend/src/components/pools/channel/   # NEW: UI
├── ChannelConnectPanel.jsx   # consent (IP/metadata exposure) + connect + signaling status
├── LiveStandingsPanel.jsx    # interim standings feed (marked off-chain), integrates PoolParticipants
├── PoolAnnouncements.jsx     # creator announcements + action deep-links
└── SendClaimCodeAction.jsx   # member→creator hand-off; extends PoolResolutionActions flow

services/signaling-relay/                 # NEW (optional deploy): Trystero-compatible
├── src/server.js         # ws-relay: content-blind, non-persisting, room-scoped fanout
└── test/                 # relay behavior tests (follows services/relayer/ conventions)

frontend/src/test/                        # Vitest (existing convention)
├── poolChannelRoomSecret.test.js
├── poolChannelSessionAuth.test.js
├── poolChannelEnvelope.test.js
├── poolChannelState.test.js
├── poolChannelHub.test.js               # incl. loopback integration pair (fake rendezvous)
└── poolChannel.axe.test.jsx
```

**Structure Decision**: Web-app structure. Protocol core lives beside the
other pool modules in `frontend/src/lib/pools/channel/` (flat,
dependency-light, pure-function-first so Vitest covers it without a browser —
`rendezvous.js` is the only module touching Trystero and is injectable in
tests); UI components join the existing `frontend/src/components/pools/`
tree; tests follow the existing `frontend/src/test/*.test.js` convention. The
optional signaling relay follows the existing `services/relayer/` layout and
deploys to the platform's GCP Cloud Run. No `contracts/` or `subgraph/`
changes.

## Design Overview

**Topology (research R4)**: Star, creator = hub. Members connect only to the
creator. Standings, announcements, and presence fan out creator→members;
claim codes travel member→creator on that member's own DTLS-encrypted link and
are never forwarded — FR-011 falls out of the topology. 25–50 concurrent
`RTCPeerConnection`s in one tab is comfortably within browser limits.

**Rendezvous (research R3 revised, contracts/handshake-payload.md)**: Each
pool maps to a Trystero room whose `roomId` and room secret are derived
(`roomSecret.js`) from pool-member knowledge — the four-word phrase entropy +
pool address + chainId (FR-020a) — so outsiders cannot enumerate or camp pool
rooms, and Trystero encrypts signaling payloads with the room secret, keeping
the signaling path (public Nostr relays by default; the FairWins Cloud Run
ws-relay as configured alternative/fallback, FR-020b) blind to everything but
opaque rendezvous blobs. Joining is automatic on channel opt-in — no manual
handshake — and reconnection after a drop is automatic re-rendezvous, with
heartbeats detecting dead sessions quickly.

**Authentication (research R6)**: The room only brings peers *together* —
trust comes from the in-band auth handshake (`sessionAuth.js`), the only
messages accepted on a fresh data channel. Members authenticate with their
existing per-pool Semaphore identity — the handshake embeds the member's
public commitment plus an identity signature over
`(chainId, poolAddress, role, sessionNonce, ephemeralPubKey)`;
the creator verifies the signature and checks the commitment against the
pool's on-chain member set. The creator authenticates the same tuple with one
EIP-191 wallet signature verified against the pool's on-chain `creator`
address (already public pool metadata; members are never wallet-identified,
FR-003). Each side certifies an **ephemeral session keypair** (tweetnacl) in
the handshake; all subsequent envelopes are signed by session keys — at most
one wallet prompt per session per device (members' identity derivation is
itself one wallet signature they already perform for pool actions).
Unauthenticated room peers are dropped after a short timeout: the room secret
grants rendezvous, never channel access.

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

**Feasibility spike (research R12, quickstart.md)**: The riskiest assumptions —
Trystero rendezvous reliability across strategies (public Nostr vs the Cloud
Run ws-relay), cross-network connect rates without TURN, and room-secret
gating — are validated first by a spike task (two real devices/networks)
before UI work begins; the STUN default (R2) and the default signaling
strategy are confirmed or revisited with measured data from that spike.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
