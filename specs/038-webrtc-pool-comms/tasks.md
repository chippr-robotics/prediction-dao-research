# Tasks: Peer-to-Peer Pool Communication

**Input**: Design documents from `/specs/038-webrtc-pool-comms/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Included — constitution II (Test-First) is non-negotiable; every behavior task ships its Vitest coverage in the same increment.

**Organization**: Tasks are grouped by user story so each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 (live standings), US2 (claim-code hand-off), US3 (announcements), US4 (presence)

## Path Conventions

Web app per plan.md: `frontend/src/…` for the feature, `frontend/src/test/` for Vitest suites, `services/signaling-relay/` for the optional relay. No `contracts/`(Solidity)/`subgraph/` changes.

---

## Phase 1: Setup & Feasibility Spike

**Purpose**: Validate the riskiest assumptions (research R12) and land shared scaffolding. The spike gates everything: do not start Phase 3+ UI work until its results are recorded.

- [ ] T001 Add `trystero` to `frontend/package.json` (pin exact version; note measured size ~58 KB min / ~22 KB gz in the PR) and verify `npm run build` keeps it out of the main bundle via a lazy dynamic import pattern mirroring `frontend/src/lib/pools/identity.js`
- [ ] T002 Build the R12 spike harness (scratch page under `frontend/spike/pool-channel/index.html`, excluded from production build) that joins a derived Trystero room and reports time-to-data-channel + ping RTT
- [ ] T003 Run the spike per quickstart.md §0 on two real networks: (a) Nostr default strategy, (b) failover to a locally run Trystero ws-relay, (c) wrong-room-secret gating, (d) STUN-off mode, (e) 50 loopback sessions on one hub tab; record results as a dated addendum in `specs/038-webrtc-pool-comms/research.md` and flip the default strategy order there if Nostr underperforms (FR-020b data)
- [ ] T004 [P] Add signaling-strategy configuration (Nostr relay list, ws-relay URL placeholder, STUN toggle default) to the frontend network config surface used by pools (extend `frontend/src/config/` per existing per-network config conventions — no hardcoded endpoints, constitution V)

**Checkpoint**: Spike addendum committed; go/no-go on strategy defaults decided with measured data.

---

## Phase 2: Foundational (Protocol Core + Relay)

**Purpose**: The pure protocol modules every story depends on, plus the fallback relay. All modules are pure/injectable (no `Date.now`/network in logic paths) so Vitest covers them without a browser.

- [ ] T005 [P] Implement `frontend/src/lib/pools/channel/roomSecret.js` — HKDF-SHA256 derivation of `{appId, roomId, password}` from phrase entropy + pool address + chainId per contracts/handshake-payload.md Layer 1; unit tests in `frontend/src/test/poolChannelRoomSecret.test.js` (determinism, domain separation, phrase-entropy-not-rendered-words input, cross-pool/cross-chain divergence)
- [ ] T006 [P] Implement `frontend/src/lib/pools/channel/sessionAuth.js` — `fwpc-hs/1` auth message build/parse/verify (member Semaphore-identity path, creator EIP-191 path, fixed signed-tuple byte layout, nonce single-use, 10 s timeout policy) per contracts/handshake-payload.md Layer 2; unit tests in `frontend/src/test/poolChannelSessionAuth.test.js` covering every failure row of the contract's table
- [ ] T007 [P] Implement `frontend/src/lib/pools/channel/envelope.js` — `fwpc/1` signed envelopes with the 7-step receiver enforcement order (size cap pre-parse, version, scope, sig, seq, known-type, rate hook) per contracts/channel-protocol.md; unit tests in `frontend/src/test/poolChannelEnvelope.test.js` (replay, tamper, oversize, cross-session, role-authority matrix)
- [ ] T008 [P] Implement `frontend/src/lib/pools/channel/rateLimit.js` — injectable-clock token bucket (10 msgs/10 s, burst 20) with repeated-violation drop signal; tests included in `frontend/src/test/poolChannelEnvelope.test.js` or a dedicated describe block
- [ ] T009 [P] Implement `frontend/src/lib/pools/channel/channelState.js` — single-writer versioned StandingsDoc + announcements list + presence doc, snapshot build/apply, latest-wins merge, bounded sizes, localStorage display-cache read/write with staleness labeling (pattern of `identityCache.js`); unit tests in `frontend/src/test/poolChannelState.test.js`
- [ ] T010 Implement `frontend/src/lib/pools/channel/rendezvous.js` — Trystero adapter: lazy-import, strategy selection + automatic failover (nostr → wsRelay) per FR-020b, room join/leave tied to pool lifecycle, peer connect/disconnect events; designed as the injectable seam (exports an interface a fake can implement)
- [ ] T011 [P] Build the in-memory fake rendezvous (linked peer pairs, no network) in `frontend/src/test/helpers/fakeRendezvous.js` for integration tests
- [ ] T012 Implement `frontend/src/lib/pools/channel/creatorHub.js` — ≤50 sessions with `bye{capacity}` decline, per-commitment newest-wins dedupe, on-chain member-set verification hook, independent per-session send queues, fan-out, claim-code table keyed by commitment; and `frontend/src/lib/pools/channel/memberClient.js` — single session to creator, auth, snapshot intake, auto-reconnect with backoff + honest status transitions
- [ ] T013 Integration tests `frontend/src/test/poolChannelHub.test.js` over the fake rendezvous: full auth handshake both roles, capacity 51 decline, commitment dedupe/supersede, auth-timeout drop, flood → drop confined to one member, reconnect → snapshot convergence
- [ ] T014 Implement `frontend/src/hooks/usePoolChannel.js` — role detection (wallet == on-chain `creator()`), consent gating, channel lifecycle state machine per data-model.md, exposes `{status, strategy, standings, announcements, presence, sendClaimCode, publishStandings, publishAnnouncement}`
- [ ] T015 Implement `frontend/src/components/pools/channel/ChannelConnectPanel.jsx` — consent dialog (IP/rendezvous-metadata + STUN disclosure, decline path, persisted per data-model.md keys), connect/disconnect, truthful status ("reconnecting…", "signaling unreachable", active strategy), WCAG 2.1 AA; axe coverage started in `frontend/src/test/poolChannel.axe.test.jsx`
- [ ] T016 [P] Implement `services/signaling-relay/` — Trystero-compatible ws-relay (follow `services/relayer/` conventions): content-blind, non-persisting, room-scoped fan-out, health endpoint, containerfile for Cloud Run; behavior tests in `services/signaling-relay/test/` (no persistence, no cross-room leakage, malformed-frame tolerance)

**Checkpoint**: `npm run test:frontend` green with all protocol suites; two fake-rendezvous peers complete auth and exchange envelopes end-to-end.

---

## Phase 3: User Story 1 — Creator pushes live stats and standings (P1) 🎯 MVP

**Goal**: Creator updates standings; connected members see them by nickname ≤ 5 s, marked interim/off-chain; late joiners converge via snapshot.

**Independent test**: quickstart.md §2 US1 — two browsers, live update, kill/reopen + auto-reconnect convergence.

- [ ] T017 [US1] Wire creator standings authoring into the existing roster: extend `frontend/src/components/pools/PoolParticipants.jsx` (and `frontend/src/lib/pools/participantOrder.js` ordering) so creator reorder/score/eliminate actions publish a versioned StandingsDoc via `usePoolChannel.publishStandings`
- [ ] T018 [P] [US1] Implement `frontend/src/components/pools/channel/LiveStandingsPanel.jsx` — member-side live standings by nickname (derive via `frontend/src/lib/pools/nickname.js`), interim/off-chain badge (FR-009), stale-cache rendering when disconnected, creator attribution
- [ ] T019 [US1] Integrate ChannelConnectPanel + LiveStandingsPanel into the pool view page alongside existing pool components (respect pool lifecycle gating FR-025); Vitest component tests for publish→receive flow over the fake rendezvous and stale-label behavior in `frontend/src/test/poolChannelState.test.js` (extend) + axe checks in `frontend/src/test/poolChannel.axe.test.jsx`
- [ ] T020 [US1] Manual validation: execute quickstart.md §2 US1 end-to-end on two devices; fix gaps; check SC-001 (≤5 s) and SC-007 (≤10 s snapshot)

**Checkpoint**: US1 demonstrable end-to-end — the MVP increment.

---

## Phase 4: User Story 2 — Claim-code hand-off to creator (P1)

**Goal**: Member sends payout claim code in-app; creator's allocation auto-fills (pending review); member gets delivery confirmation; manual fallback untouched.

**Independent test**: quickstart.md §2 US2 — send over channel, auto-fill + ack, disconnected fallback.

- [ ] T021 [US2] Implement claim-code hand-off in protocol layer: `nacl.box` body encryption to creator's certified `boxPubKey`, `claim-code` / `claim-code-ack` handling in `creatorHub.js`/`memberClient.js` (dedupe by commitment, never forwarded/broadcast, never persisted beyond existing `identityCache`) with tests in `frontend/src/test/poolChannelHub.test.js` (box unreadable by third session, ack round-trip, duplicate collapse)
- [ ] T022 [US2] Implement `frontend/src/components/pools/channel/SendClaimCodeAction.jsx` — member-side "Send my payout code to the creator" using the cached value from `frontend/src/lib/pools/identityCache.js`, delivery states (`sent → delivered / failed → fallback`), and the existing copy flow as explicit fallback; integrate into `frontend/src/components/pools/PoolResolutionActions.jsx` member section
- [ ] T023 [US2] Creator-side auto-fill: map received claim codes to nickname rows in the payout allocation UI in `frontend/src/components/pools/PoolResolutionActions.jsx`, marked "received via channel — pending your review" (FR-012), never overwriting creator manual edits; component tests + axe coverage
- [ ] T024 [US2] Manual validation: quickstart.md §2 US2 incl. disconnected fallback and SC-002 (<30 s, zero copy-paste)

**Checkpoint**: Resolution flow works end-to-end with zero copy-paste when connected; unchanged when not.

---

## Phase 5: User Story 3 — Announcements & lifecycle nudges (P2)

**Goal**: Creator posts structured announcements; members see them ≤ 5 s with action deep-links; late joiners get current list.

**Independent test**: quickstart.md §2 US3.

- [ ] T025 [P] [US3] Implement `frontend/src/components/pools/channel/PoolAnnouncements.jsx` — creator compose (≤280 chars plain text, optional action per contracts/channel-protocol.md) + member feed attributed "Creator", deep-links to the approve-payout/view-pool actions (FR-016); wire through `usePoolChannel.publishAnnouncement`
- [ ] T026 [US3] Tests: announcements versioning/bounded-list in `frontend/src/test/poolChannelState.test.js` (extend), non-creator announcement rejection in `frontend/src/test/poolChannelHub.test.js` (extend), component + axe coverage; manual validation per quickstart.md §2 US3

**Checkpoint**: Announcements live; resolution nudges deep-link correctly.

---

## Phase 6: User Story 4 — Presence roster (P3)

**Goal**: Members see which nicknames are connected; display-only; deduped per member.

**Independent test**: quickstart.md §2 US4.

- [ ] T027 [US4] Implement presence: hub derives connected-commitments doc (dedupe per FR-026), broadcasts on session open/close; render connected nicknames ("7 of 12 connected") in `frontend/src/components/pools/channel/LiveStandingsPanel.jsx` and/or `PoolParticipants.jsx`; tests for dedupe/disconnect timing in `frontend/src/test/poolChannelHub.test.js` (extend) + axe; manual validation per quickstart.md §2 US4

**Checkpoint**: All four stories independently demonstrable.

---

## Phase 7: Polish & Hardening

- [ ] T028 [P] Deploy `services/signaling-relay/` to GCP Cloud Run (staging), wire its URL into the per-network frontend config (T004), verify failover per quickstart.md §0(3) against the deployed instance, and document the deploy in `docs/runbooks/` following existing runbook conventions
- [ ] T029 [P] Negative/posture sweep from quickstart.md §2: non-member auth rejection (SC-003), wrong-room-secret isolation (FR-020a), both-strategies-down degradation (FR-023), signaling-blindness capture check (SC-004), flood confinement (FR-024), channel-never-connected full pool lifecycle (SC-006)
- [ ] T030 [P] Channel security review: verify the six invariants in contracts/channel-protocol.md against the implementation (session binding, replay, box confidentiality, creator-authority chain, no on-chain/server writes, additive-only) and record findings in `specs/038-webrtc-pool-comms/security-review.md`; run existing lint/build/axe CI gates and confirm no `continue-on-error` additions
- [ ] T031 Update docs: add the pool-channel exception/summary to `CLAUDE.md` guardrails (channel is off-chain, additive, signaling-only infra) and cross-link `specs/038-webrtc-pool-comms/` artifacts; verify `.specify/feature.json` and CLAUDE.md Spec Kit block still point at this feature

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2**: T003 (spike) gates UI phases; T001 gates T010; T004 gates T010/T028.
- **Phase 2 → all stories**: T005–T016 block Phase 3+; within Phase 2, T005–T009/T011/T016 are parallel; T010 needs T001/T004; T012 needs T005–T010; T013 needs T011+T012; T014 needs T012; T015 needs T014.
- **User stories**: US1 (T017–T020) is the MVP; US2 (T021–T024) is independent of US1 given Phase 2 (only T023 shares `PoolResolutionActions.jsx` with T022 — sequence those two); US3 (T025–T026) and US4 (T027) are independent of each other and of US2.
- **Polish**: T028–T031 after the stories they exercise; T028 can start any time after T016.

### Parallel example (Phase 2 kickoff)

```
Parallel set A: T005 roomSecret • T006 sessionAuth • T007 envelope • T008 rateLimit • T009 channelState • T011 fakeRendezvous • T016 ws-relay
Then:          T010 rendezvous → T012 hub/client → T013 integration → T014 hook → T015 connect panel
```

## Implementation Strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (US1)**: live standings over the channel, demonstrable on two devices. Ship/checkpoint there, then US2 (the copy-paste killer), then US3/US4 in either order. Every phase leaves the pool fully functional with the channel off (FR-022) — there is no partially-broken intermediate state.
