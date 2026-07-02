# Transport Alternatives Analysis: libp2p, OrbitDB, Gun (and adjacent options)

**Feature**: specs/038-webrtc-pool-comms | **Date**: 2026-07-02 |
**Extends**: [research.md](./research.md) R1/R2

Requested follow-up research: evaluate libp2p, OrbitDB, and Gun as
alternatives to raw WebRTC for the pool channel. Ecosystem facts below were
web-verified 2026-07-02 (versions from the npm registry, architecture claims
from current official docs/source, bundle sizes measured with esbuild
`--bundle --minify`, not vendor-quoted).

## The framing that matters: there is no alternative *transport*

Browsers expose exactly one primitive that lets two browsers exchange data
directly: **WebRTC**. This was re-verified against 2026 platform status:

- **WebTransport** reached cross-browser Baseline in March 2026, but the API
  is strictly client↔server ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API)).
- **P2P WebTransport** ([w3c/p2p-webtransport](https://w3c.github.io/p2p-webtransport/))
  is a dormant draft with no browser implementation.
- **Direct Sockets** shipped in Chromium only inside Isolated Web Apps
  (effectively ChromeOS installed apps), not the open web
  ([Chrome docs](https://developer.chrome.com/docs/iwa/direct-sockets)).

So libp2p, OrbitDB, Gun, Trystero, and Waku are not alternative transports —
in a browser they are **signaling/sync layers that either ride WebRTC or ride
WebSockets to servers**. The real question they answer is: *what do we depend
on for the SDP handshake, and do we want a database/sync layer above the
pipe?* Our design (research R3) answers "the members themselves" (manual
copy/QR) and "no — single-writer versioned docs suffice" (R10).

## Evaluation criteria

From the spec, clarifications, and constitution:

| # | Criterion | Source |
|---|---|---|
| C1 | Strictly serverless: no rendezvous/signaling/relay service, FairWins-operated **or third-party** | Clarification 2026-07-02, FR-020 |
| C2 | Content confinement: message content only ever on member devices; claim codes never stored anywhere | FR-011, FR-014, SC-004 |
| C3 | Real-time: ≤ 5 s delivery to connected members | SC-001 |
| C4 | Browser envelope: evergreen desktop + mobile Safari, no extensions | plan Technical Context |
| C5 | Dependency footprint: bundle size; new core tech must be justified | constitution Additional Constraints |
| C6 | Auth fit: Semaphore identity + on-chain member-set verification | FR-002/FR-003, research R6 |
| C7 | Security auditability: surface we can reason about at contract-grade rigor | constitution I |
| C8 | Pairing friction: cost of the manual out-of-band handshake | spec edge case "Handshake friction" |

## Candidate-by-candidate

### js-libp2p (`libp2p@3.3.4`, June 2026 — actively maintained)

- **Browser↔browser requires a Circuit Relay v2 server.** The current official
  guide is unambiguous: the WebRTC transport signals SDP **over a circuit
  relay connection**, and the relay typically also hosts GossipSub peer
  discovery ([libp2p WebRTC browser connectivity](https://libp2p.io/docs/webrtc-browser-connectivity/)).
  `webrtc-direct` (relay-free) is browser→server only — browsers can't listen.
  There is **no supported manual-signaling path**; we'd have to hand-roll raw
  `RTCPeerConnection` signaling *around* libp2p, i.e. build our R3 design and
  then feed it into a framework that no longer adds value.
- **Measured bundle** (webrtc + noise + yamux + gossipsub + identify):
  **~987 KB min / ~287 KB gz** — an order of magnitude over our current
  footprint of ~0 KB (platform API).
- **Verdict**: fails C1 (relay required), heavy C5, C7 surface large
  (transport + muxer + pubsub + peer store). Its strengths — multi-transport
  abstraction, gossip at scale, peer routing — solve problems a ≤50-member
  creator-hub star doesn't have. **Rejected** under current constraints.

### OrbitDB (`@orbitdb/core@4.0.0`, May 2026 — maintained, small team)

- A CRDT **database** on Helia (IPFS) + js-libp2p — so it inherits everything
  above: official docs state a relay server is required because "a connection
  cannot be made directly to a browser node"
  ([CONNECTING_PEERS.md](https://github.com/orbitdb/orbitdb/blob/main/docs/CONNECTING_PEERS.md)).
- **Data-model mismatch, and a disqualifying one**: the oplog is an immutable,
  append-only, content-addressed Merkle-DAG replicated to every peer that
  opens the database; `del()` writes a tombstone but the entry persists —
  **you cannot globally delete data**
  ([OPLOG.md](https://github.com/orbitdb/orbitdb/blob/main/docs/OPLOG.md)).
  Putting claim codes, standings, or any wager-adjacent traffic into a
  permanent replicated log directly violates FR-014/C2 and the spirit of spec
  034's "nicknames never leave the client".
- Its actual strength — multi-writer offline-first replicated state — is the
  opposite of our model (single writer, ephemeral, converge-don't-replay, R10).
- **Verdict**: fails C1 and C2 *by design*; **rejected**. Strongest of the
  three at what *it* does, wrongest fit for what *we* need.

### Gun (`gun@0.2020.1241`, one npm release since Apr 2024)

- Browser peers sync via WebSocket **relay peers**; the WebRTC adapter does
  its signaling **through those relays** (verified in
  [lib/webrtc.js](https://github.com/amark/gun/blob/master/lib/webrtc.js));
  and default relays **replicate and persist everything** written to the
  graph (Radisk) — pool traffic would land on whatever community relays are
  configured. Fails C1 and C2 outright.
- **Maintenance risk**: ~3 commits in 2026, ~5 in 2025, single primary
  maintainer — effectively low-maintenance mode for a security-bearing
  dependency (constitution I concern).
- **Crypto**: SEA has **no formal audit**; the best-known public analysis
  found a serious signature-verification flaw (2020,
  [joonas.fi](https://joonas.fi/2020/01/20/serious-security-vulnerability-in-gundb-and-new-ones/)).
  We would also still need our Semaphore-identity auth layer on top (C6) —
  SEA's user model doesn't map to pool commitments.
- **Verdict**: weakest candidate on every axis that matters here; **rejected**.

### Trystero (`trystero@0.25.2`, June 2026 — actively maintained) — *the one genuinely interesting middle path*

Not in the original request but it is the category the request is really
looking for: **serverless-ish automatic signaling**.

- Piggybacks the SDP handshake on **existing public networks** — Nostr relays
  (default), MQTT brokers, BitTorrent trackers, IPFS — then all app data flows
  browser↔browser over WebRTC, E2E-encrypted. **No operated server, nothing
  persisted on third parties**; signaling messages are ephemeral.
- **Measured bundle**: ~58 KB min / **~22 KB gz** (13× smaller than the
  libp2p stack). Rooms are joined by a shared secret — our four-word phrase +
  pool address would slot in naturally, and our R6 identity auth and R7
  envelopes would run unchanged on top (Trystero replaces R3's manual
  handshake, not our protocol).
- **The catch**: public Nostr/MQTT/BitTorrent infrastructure is still
  *third-party rendezvous infrastructure*. The 2026-07-02 clarification
  ("strictly serverless — no FairWins-operated **or third-party** rendezvous,
  signaling, or relay service of any kind") **excludes it as specified**. It
  also broadcasts connection metadata (encrypted room presence, IP visibility
  to relays/trackers) to public networks — a different privacy surface than
  "only my pool-mates ever see anything".
- **Verdict**: rejected under the current clarification, but recorded as the
  **ranked escape hatch**: if the R12 feasibility spike shows manual-handshake
  friction is unacceptable in practice, adopting Trystero-style public-infra
  signaling is a spec-level decision (one clarification revision), not a
  redesign — every other layer of the plan (auth, envelopes, star topology,
  state docs, claim-code boxing) carries over unchanged.

### Waku / Logos (brief)

Browser use requires light-node connections to serving fleet nodes (servers);
the project is mid-rebrand (waku-org → logos-messaging) with npm packaging in
flux. Fails C1; churn risk on C7. Not pursued.

## Scorecard

✅ satisfies · ⚠️ partial/conditional · ❌ fails

| Criterion | Raw WebRTC (plan R1–R3) | js-libp2p | OrbitDB | Gun | Trystero |
|---|---|---|---|---|---|
| C1 strictly serverless | ✅ (⚠️ STUN, flagged R2) | ❌ relay required | ❌ relay required | ❌ relay peers | ❌ public 3rd-party signaling |
| C2 content confinement | ✅ | ✅ (transport only) | ❌ permanent replicated log | ❌ persists on relays | ✅ (data p2p; metadata public) |
| C3 ≤5 s delivery | ✅ | ✅ | ⚠️ (log sync, not push) | ⚠️ | ✅ |
| C4 browser envelope | ✅ | ✅ | ✅ | ✅ | ✅ |
| C5 footprint | ✅ 0 new deps | ❌ ~287 KB gz | ❌ libp2p + Helia | ⚠️ | ✅ ~22 KB gz |
| C6 Semaphore-auth fit | ✅ designed-in | ⚠️ parallel identity (peer IDs) | ⚠️ + access-controller mapping | ❌ SEA mismatch | ✅ our layer on top |
| C7 auditability/maintenance | ✅ platform API | ⚠️ large surface, active | ⚠️ small team | ❌ unaudited, dormant | ⚠️ small, active |
| C8 pairing friction | ❌ manual copy/QR per member | ✅ | ✅ | ✅ | ✅ automatic |

The table makes the shape of the trade explicit: **every row where an
alternative beats raw WebRTC on C8 is paid for by failing C1** — automatic
signaling is precisely the thing the strictly-serverless clarification
forbids. There is no candidate that wins C1 *and* C8; that trade-off is
inherent to browser networking, not to our design.

## Decision

**Keep the plan's choice: raw browser WebRTC with manual (copy/QR) signaling**
(research R1–R3), unchanged. It is the only option that satisfies the
strictly-serverless clarification and the content-confinement requirements,
and it carries zero new dependencies.

**Recorded escape hatch (in priority order), should the R12 spike or real
usage show the manual handshake kills adoption:**
1. **Trystero-style public-infra signaling** (Nostr default) — requires
   revising the 2026-07-02 serverless clarification to re-admit third-party
   *signaling-only* infrastructure; everything else in the plan survives.
2. Self-hosted or third-party dedicated signaling service — the original
   clarification Options A/B, a bigger posture change.
3. libp2p — only if a future feature genuinely needs mesh/gossip scale
   (e.g. creator-offline broadcast to hundreds); accept relay operation then.

**Not viable regardless of posture:** OrbitDB (permanent replicated storage
contradicts FR-014 by design) and Gun (unaudited crypto, relay persistence,
dormant maintenance) for this feature's traffic.

## Revisit triggers

- R12 spike: median pairing time per member > ~60 s or > ~20% abandonment in
  hallway testing → escalate escape hatch 1 to the user.
- STUN toggle data (R2) shows cross-network connect rates too low even with
  STUN → the serverless posture itself, not the library, is the binding
  constraint; same escalation.
- A future feature needs creator-offline fan-out or >50 live peers →
  re-evaluate libp2p at that feature's spec stage, not this one.
