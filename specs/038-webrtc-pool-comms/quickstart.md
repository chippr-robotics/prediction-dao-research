# Quickstart: Validating Peer-to-Peer Pool Communication

**Feature**: specs/038-webrtc-pool-comms

How to prove the feature works end-to-end. References:
[spec.md](./spec.md) · [data-model.md](./data-model.md) ·
[contracts/](./contracts/) · [research.md](./research.md)

## Prerequisites

- Node 20+, repo installed (`npm install` at root and `frontend/`).
- Local dev chain with pools deployed (spec 006 flow) **or** Amoy testnet with
  the recorded `zkWagerPoolFactory` deployment.
- Two browser profiles/devices with funded test wallets that are members of
  the same test pool (create + join via the existing four-word flow).
- For the cross-network spike: two devices on *different* networks (e.g.
  laptop on home Wi-Fi, phone on cellular).

## 0. Feasibility spike (research R12 — run before implementation tasks)

1. Serve the spike harness (a bare page using `roomSecret.js` +
   `rendezvous.js` once they exist; before then, the R12 spike task builds a
   scratch page with Trystero directly).
2. Devices A and B on **different home networks** join the same derived room
   (Nostr strategy). **Expected**: data channel opens with no manual step;
   measure time-to-channel (target: seconds) and `ping`/`pong` round-trips
   < 500 ms.
3. Block/unconfigure Nostr; run a local Trystero `ws-relay` and confirm
   **automatic failover** connects A↔B through it (FR-020b). Containerize the
   relay and confirm it runs on Cloud Run (WebSocket support, scale-to-zero
   behavior noted).
4. Wrong-secret check: a third client with an incorrect room secret never
   rendezvouses with A/B (FR-020a).
5. STUN off: expect connection only on same LAN or end-to-end IPv6 — record
   results as an addendum in research.md.
6. If (2) fails materially on public Nostr relays, flip the default strategy
   order (FairWins relay first) with measured justification — record in
   research.md.

## 1. Automated validation

```bash
npm run test:frontend             # all Vitest suites, including:
# poolChannelRoomSecret.test.js   – room derivation determinism, domain separation,
#                                   phrase-entropy (not rendered-words) input
# poolChannelSessionAuth.test.js  – in-band auth build/parse/verify + all failure
#                                   rows in contracts/handshake-payload.md
# poolChannelEnvelope.test.js     – sign/verify, replay (seq), size cap, role matrix
# poolChannelState.test.js        – snapshot, latest-wins versions, stale cache labeling
# poolChannelHub.test.js          – fake-rendezvous loopback pair: capacity 50→51
#                                   decline, commitment dedupe, claim-code box/ack,
#                                   rate limit, auth-timeout drop
# poolChannel.axe.test.jsx        – connect panel, consent dialog, live panels
```

All suites MUST pass; new modules ship with their tests in the same PR
(constitution II).

## 2. Manual end-to-end scenarios (maps to spec user stories)

### US1 — live standings (P1)

1. Browser A = pool creator; open the pool → "Live channel" → review consent
   (IP/rendezvous-metadata exposure + STUN note) → connect.
2. Browser B = member; open pool → "Connect" → consent. **Expected**: A and B
   show each other connected within seconds, no manual step (rendezvous is
   automatic; status shows the active signaling strategy).
3. On A, reorder standings / mark a member eliminated.
4. **Expected on B (≤ 5 s)**: standings update by nickname, interim/off-chain
   badge visible, no transaction prompted (SC-001).
5. Kill B's tab, change standings on A, reopen B.
6. **Expected**: B shows cached state labeled stale, reconnects automatically,
   and converges to the current snapshot ≤ 10 s after session up (SC-007,
   FR-008).

### US2 — claim-code hand-off (P1)

1. Drive the pool to resolution (creator proposes payout — existing flow).
2. On B: "Send my payout code to the creator" over the connected channel.
3. **Expected on A**: allocation row for B's nickname auto-fills, marked
   pending review (FR-012). **Expected on B**: "delivered" confirmation
   (FR-013).
4. Disconnect the channel; retry send on B.
5. **Expected**: truthful failure + the existing copy-paste fallback offered
   (FR-022); resolution completes via manual flow regardless (SC-006 parity).

### US3 — announcements (P2)

1. On A, post "Please approve the payout" with the approve action.
2. **Expected on B**: announcement ≤ 5 s, attributed to Creator, tapping it
   lands on the approval action (FR-015/016).

### US4 — presence (P3)

1. Connect a third member C; watch the roster on A and B.
2. **Expected**: connected nicknames only (never addresses); C disappears
   shortly after closing their tab; a second tab for C does not double-count
   (FR-026).

### Negative / posture checks

- Non-member wallet attempts to connect (valid room secret, no valid identity
  signature) → dropped at auth; creator UI never lists it (SC-003, FR-002).
- Wrong room secret (harness) → never rendezvouses with the pool room
  (FR-020a).
- Block the active signaling strategy mid-use → status shows failover to the
  other strategy (FR-020b); block both → fast, visible "signaling
  unreachable" + manual flows still work (FR-023).
- Signaling-blindness check: capture ws-relay/Nostr traffic during a session →
  only encrypted rendezvous blobs; no standings, announcements, claim codes,
  commitments, or wallet addresses in the clear; nothing persisted by the
  FairWins relay (SC-004, FR-020).
- Flood from a member session (test harness) → member link dropped, A and
  other members unaffected (FR-024).
- With the channel never connected, run a full pool lifecycle → everything
  works exactly as today (SC-006).

## 3. Accessibility & CI

- `poolChannel.axe.test.jsx` passes (WCAG 2.1 AA, constitution V); QR always
  paired with copyable text.
- Standard CI gates (lint, tests, build) — no `continue-on-error`.
