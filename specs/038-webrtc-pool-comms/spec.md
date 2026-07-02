# Feature Specification: Peer-to-Peer Pool Communication

**Feature Branch**: `claude/webrtc-zk-pool-peers-5eudhx`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "we have been working on communication between peers as part of the zk group pools. we currently allow members to join pools using 4 words. it would be ideal for the pool creator to update stats and updates and the pool communicate things such as claim codes. investigate our ability to leverage webrtc for this peer 2 peer communication."

## Overview

ZK-Wager Pools (spec 034) deliberately shipped with **no live channel between
members**. Today, everything that isn't an on-chain transaction moves by manual,
out-of-band copy-paste:

- **Standings/stats**: the creator maintains interim standings locally and must
  re-share a display map through outside channels (group chat, etc.) every time
  something changes. The originally planned "live leaderboard" (spec 034, User
  Story 4) was reframed to creator-local because no acceptable transport existed.
- **Payout claim codes**: at resolution time each member copies their payout
  claim code and hands it to the creator through an outside channel; the creator
  pastes each code into the payout allocation by hand.

This feature adds a **direct, member-to-member communication channel per pool** —
peer-to-peer between members' devices, with no FairWins server storing or reading
message content — so that:

1. the **creator can push stats, standings, and announcements** to all connected
   members in near real time, and
2. **members can hand their payout claim code to the creator inside the app**,
   auto-filling the creator's payout allocation instead of copy-paste.

The channel is **additive**: every existing manual flow keeps working when the
channel is unavailable, preserving the pool's "works with nothing but a wallet
and four words" property. Participants appear on the channel only as their
anonymous in-pool identity (two-word nickname) — never as a wallet address —
consistent with the pool privacy model. The user has asked us to investigate
browser-native peer-to-peer transport (WebRTC) as the vehicle; the transport
choice is finalized in the plan. Connection establishment is **strictly
serverless** (see Clarifications): members exchange connection-establishment
material directly (e.g. copy-paste or QR, like existing share flows) — no
FairWins or third-party rendezvous/relay service is involved.

## Clarifications

### Session 2026-07-02

- Q: How should pool peers find each other (rendezvous/signaling) and relay
  when direct connection fails? → A: **Strictly serverless** — members exchange
  connection offers manually (copy-paste / QR handshake); no FairWins-operated
  or third-party rendezvous, signaling, or relay service of any kind. If a
  direct connection cannot be established, the channel is simply unavailable
  for that pair and the manual flows apply.
- Q: How many concurrently connected members must a pool's live channel
  support? → A: **Friend-group scale: ~25–50 concurrently connected members**
  per pool (the ~1,000-member pool cap is anonymity capacity, not expected live
  concurrency). Beyond the target the channel degrades gracefully; on-chain
  flows are never affected.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Creator pushes live stats and standings to the pool (Priority: P1)

During a multi-round game or tournament, the pool creator updates scores or
eliminates players (by two-word nickname) on their device. Every member who has
the pool open sees the standings change within seconds — without sending a
transaction, without the creator leaving the app, and without anyone's wallet
being revealed. A member who opens the pool later receives the current standings
as soon as they connect.

**Why this priority**: This is the headline gap. Spec 034's live-leaderboard
story could not ship for lack of a transport; standings are currently
creator-local and shared by hand. A live creator→members broadcast is the
minimum slice that makes the channel independently valuable and demonstrable.

**Independent Test**: On two devices in the same pool, have the creator update a
score; confirm the second device shows the revised standings (by nickname)
within seconds with no transaction and no manual re-share. Disconnect the second
device, update again, reconnect, and confirm it catches up to the latest state.

**Acceptance Scenarios**:

1. **Given** an active pool with the creator and at least one member connected,
   **When** the creator updates a score or eliminates a player, **Then** every
   connected member sees the revised standings, identified by nickname only,
   within a few seconds and without sending a transaction.
2. **Given** a member who connects (or reconnects) while a pool is active,
   **When** their channel session is established, **Then** they receive the
   creator's current standings state, not just future updates.
3. **Given** live standings shown over the channel, **When** a member views
   them, **Then** they are clearly marked as interim/off-chain and not a settled
   on-chain outcome (consistent with spec 034 FR-031).
4. **Given** the creator is offline or unreachable, **When** a member opens the
   pool, **Then** the pool remains fully usable and the member sees the last
   state they know of, marked as possibly stale, with no errors blocking
   on-chain actions.
5. **Given** a standings update received over the channel, **When** it is
   displayed, **Then** it is verifiably from the pool creator; updates not
   authored by the creator are rejected and never shown.

---

### User Story 2 - Member hands their payout claim code to the creator in-app (Priority: P1)

At resolution time, a member taps "Send my payout code to the creator" instead
of copying a code into an outside chat. The creator, on their device, sees the
member's claim code arrive next to that member's nickname and the payout
allocation fills itself in. The member gets a confirmation that the creator
received it. Only the creator can read the code; other members cannot.

**Why this priority**: This is the most concrete existing pain. The claim-code
hand-off is a required step of every pool resolution today and is pure manual
copy-paste through channels outside the app. Automating it directly shortens
every pool's path to payout.

**Independent Test**: In a pool entering resolution, have a member send their
claim code over the channel; confirm the creator's payout allocation auto-fills
for that nickname, the member sees a received confirmation, and a third member
observing the channel cannot obtain the code.

**Acceptance Scenarios**:

1. **Given** a pool in its resolution phase with the member and creator both
   connected, **When** a member sends their payout claim code, **Then** the code
   appears against that member's nickname in the creator's payout allocation
   without the creator typing or pasting anything.
2. **Given** a claim code sent over the channel, **When** it is in transit or
   observed by any other party (other members, or any infrastructure used to
   establish connections), **Then** the code is readable by the creator only.
3. **Given** a member has sent their claim code, **When** the creator's device
   has received it, **Then** the member sees a delivery confirmation; if the
   creator is not reachable, the member is told the code was not delivered and
   is offered the existing copy-based hand-off instead.
4. **Given** a received claim code, **When** the creator reviews the payout
   allocation, **Then** the code is bound to the sending member's in-pool
   identity so it cannot be silently attributed to a different member.
5. **Given** the channel is unavailable for any reason, **When** a member needs
   to hand off their claim code, **Then** the existing manual copy-paste flow
   remains available and sufficient.

---

### User Story 3 - Pool announcements and lifecycle nudges (Priority: P2)

The creator posts short structured announcements to the pool — "resolution
proposed, please review and approve", "join deadline is tonight", "final round
starts at 8" — and connected members see them in the pool view, attributed to
the creator, within seconds. Lifecycle-relevant announcements (like a proposed
payout) can deep-link members to the matching action in the app.

**Why this priority**: Valuable coordination glue that increases the share of
pools that actually reach consensus before timing out, but the pool resolves
fine without it (members can already watch on-chain state); it layers cleanly on
the P1 channel.

**Independent Test**: Have the creator post an announcement; confirm connected
members see it attributed to the creator within seconds, that a member
connecting later still sees the latest announcements, and that tapping a
resolution announcement lands the member on the approval action.

**Acceptance Scenarios**:

1. **Given** an active pool, **When** the creator posts an announcement, **Then**
   connected members see it within a few seconds, attributed to the creator (not
   to a wallet address).
2. **Given** an announcement tied to a pool action (e.g. a proposed payout
   outcome), **When** a member opens it, **Then** they are taken to the
   corresponding action in the pool view.
3. **Given** a member who was disconnected when announcements were posted,
   **When** they reconnect while the pool is active, **Then** they receive the
   current announcements they missed.
4. **Given** any non-creator member, **When** they attempt to publish an
   announcement or standings update, **Then** it is rejected by receiving peers.

---

### User Story 4 - Presence: see who's connected, by nickname (Priority: P3)

A member opens the pool and sees which nicknames are currently connected to the
pool channel (e.g. "7 of 12 connected"), so the group knows whether "everyone is
here" before a round starts or a resolution proposal goes out. Presence is
display-only, by nickname, and never implies anything on-chain.

**Why this priority**: A quality-of-life layer on top of the channel; nothing
else depends on it and pools function identically without it.

**Independent Test**: Connect and disconnect a second device and confirm the
first device's roster reflects the change by nickname within a reasonable time,
with no wallet address shown.

**Acceptance Scenarios**:

1. **Given** several members connected to a pool channel, **When** any member
   views the pool, **Then** they see which nicknames are currently connected.
2. **Given** a member disconnects, **When** other members view presence shortly
   after, **Then** that nickname is no longer shown as connected.
3. **Given** presence information, **When** it is displayed anywhere, **Then**
   members are identified only by nickname, never by wallet address.

---

### Edge Cases

- **Creator offline**: Standings, announcements, and claim-code hand-off degrade
  to the existing manual flows; members are told the creator is unreachable
  rather than seeing silent failures. On-chain actions are never blocked.
- **Member offline during an update**: The channel offers no store-and-forward
  guarantee; a member who reconnects while the pool is active must converge to
  the creator's current state (standings, announcements) rather than replaying
  every missed intermediate update.
- **Direct connection impossible** (restrictive network/NAT/firewall): With no
  relay service available (strictly serverless posture), the channel must fail
  gracefully to the manual flows with a clear "could not connect" outcome —
  never a hung or half-working pool view.
- **Handshake friction**: Establishing a session requires members to exchange
  connection material out-of-band (copy-paste/QR); a botched, stale, or
  partially completed handshake must produce a clear retry path, not a limbo
  state.
- **Impersonation**: A device that is not a verified member of the pool must not
  be able to join the pool's channel, read its traffic, or post to it. A member
  must not be able to pass off messages as the creator's.
- **Claim code sent to the wrong party**: The hand-off must be addressed to the
  creator specifically; there must be no way to accidentally broadcast a claim
  code to the whole pool.
- **Replay/tampering**: A captured message (e.g. an old standings update or a
  claim-code delivery) replayed later, or altered in transit, must be detected
  and rejected.
- **Network-address exposure**: Direct device-to-device connections can reveal a
  member's network address to other pool members, which could weaken the pool's
  anonymity story out-of-band. Members must be informed before their address is
  exposed to peers, and a more private connection mode (or opting out of the
  channel entirely) must be available.
- **Multiple devices / tabs**: The same member connected from two tabs or
  devices must not corrupt presence, duplicate claim-code deliveries, or fork
  standings state.
- **Pool lifecycle end**: Once a pool is resolved/cancelled and claims are
  complete, the channel has no further purpose; it must not linger as an
  indefinite side-channel for ended pools.
- **Flooding/abuse**: A malicious member spamming the channel must not be able
  to render the pool view unusable for others or crowd out creator messages.
- **Cross-pool isolation**: A member of pools A and B must never see pool A
  traffic in pool B; channel membership is strictly per-pool.

## Requirements *(mandatory)*

### Functional Requirements

#### Channel membership & authentication

- **FR-001**: Each pool MUST have its own communication channel, strictly
  isolated per pool and per network; only verified members of that pool (and its
  creator) can participate.
- **FR-002**: A device MUST prove it belongs to a member of the pool before it
  can read from or post to the pool's channel; non-members MUST be excluded.
- **FR-003**: Participants on the channel MUST be identified to each other only
  by their anonymous in-pool identity (two-word nickname); wallet addresses MUST
  NOT be disclosed on, or derivable from, channel messages.
- **FR-004**: Messages that carry creator authority (standings updates,
  announcements) MUST be verifiable by every receiving member as authored by the
  pool creator; creator-authority messages from anyone else MUST be rejected.
- **FR-005**: All channel messages MUST be sender-authenticated, tamper-evident,
  and replay-resistant: an altered or replayed message MUST be detected and
  discarded rather than displayed or acted on.

#### Live stats & standings (creator → members)

- **FR-006**: The creator MUST be able to publish interim standings and stat
  updates (scores, eliminations, round progress), expressed by nickname, to the
  pool channel without any member sending a transaction.
- **FR-007**: Connected members MUST receive and display creator updates in near
  real time (within a few seconds under normal conditions).
- **FR-008**: A member who connects or reconnects while the pool is active MUST
  be brought up to the creator's current published state (standings and active
  announcements), not left on stale data with no indication.
- **FR-009**: Channel-delivered standings MUST be visually marked as interim and
  off-chain, distinguished from settled on-chain outcomes (upholding spec 034
  FR-031), and MUST be attributed to the creator.

#### Claim-code hand-off (member → creator)

- **FR-010**: During resolution, a member MUST be able to send their payout
  claim code to the pool creator over the channel from within the pool view,
  with no manual copying.
- **FR-011**: A claim code sent over the channel MUST be readable by the pool
  creator only — not by other members and not by any infrastructure involved in
  carrying or establishing the connection. It MUST NOT be broadcast to the pool.
- **FR-012**: A received claim code MUST be bound to the sending member's
  in-pool identity and MUST auto-fill the creator's payout allocation for that
  member, pending the creator's review; the creator MUST NOT have to re-type or
  re-paste it.
- **FR-013**: The sending member MUST receive a delivery confirmation once the
  creator's device has the code; if delivery cannot be confirmed, the member
  MUST be clearly told and offered the existing manual hand-off.
- **FR-014**: Claim codes MUST never be written on-chain, logged, or stored by
  any server as a result of using the channel; the existing safety property —
  knowing a claim code does not let anyone else claim — is preserved, and the
  channel MUST NOT weaken it.

#### Announcements (P2)

- **FR-015**: The creator MUST be able to post short structured announcements to
  the pool; connected members MUST see them within a few seconds, attributed to
  the creator by role (never by wallet).
- **FR-016**: Announcements tied to a pool action (e.g. a proposed payout
  outcome awaiting approval) MUST link members to the corresponding action in
  the pool view.
- **FR-017**: Only the creator can post announcements and standings; other
  members' channel participation is limited to the defined member flows (claim
  code hand-off, presence). Free-form member chat is out of scope.

#### Presence (P3)

- **FR-018**: Members MUST be able to see which nicknames are currently
  connected to the pool channel, updating as members connect and disconnect.
- **FR-019**: Presence MUST be display-only and off-chain; it MUST NOT affect
  membership, voting, resolution, or any on-chain state.

#### Privacy, safety & platform posture

- **FR-020**: Connection establishment MUST be strictly serverless: no
  FairWins-operated or third-party rendezvous, signaling, or relay service is
  used. Peer sessions are established solely from connection-establishment
  material that members exchange directly (e.g. copy-paste or QR, consistent
  with existing share flows), and message content flows only between member
  devices — no server ever stores, reads, or relays it.
- **FR-020a**: The connection-establishment material members exchange MUST NOT
  contain wallet addresses or claim codes, and material for one pool/session
  MUST NOT grant access to another pool's channel or a later session.
- **FR-021**: Before a member's device exposes its network address to other pool
  members via a direct connection, the member MUST be informed of that exposure
  and be free to decline the channel (there is no relay to hide behind under the
  serverless posture), since network-address linkage could otherwise erode the
  pool's anonymity boundary out-of-band.
- **FR-022**: The channel MUST be strictly additive: every pool capability
  (join, vote, propose, resolve, claim, refund, manual claim-code hand-off,
  creator-local standings) MUST remain fully functional when the channel is
  unavailable, declined, or unsupported by a member's device or network.
- **FR-023**: Channel failures MUST degrade gracefully and visibly (e.g.
  "creator unreachable", "live updates unavailable") and MUST NOT block, delay,
  or error any on-chain action.
- **FR-024**: The channel MUST resist abuse by a misbehaving member: flooding
  MUST NOT make the pool view unusable for others, and a member's messages
  outside the allowed flows MUST be ignored by receiving peers.
- **FR-025**: A pool's channel MUST be bounded by the pool's lifecycle: it
  exists for active pools (and through resolution/claiming) and MUST NOT persist
  as an ongoing side-channel once the pool is fully concluded.
- **FR-026**: A member connected from multiple devices or tabs MUST NOT corrupt
  channel state: presence counts each member once, and duplicate claim-code
  deliveries from the same member MUST collapse to a single entry for the
  creator.
- **FR-027**: A pool channel MUST support at least 25 — with a design target of
  50 — concurrently connected members while meeting the near-real-time delivery
  expectation (FR-007). Beyond the design target, additional connection
  attempts MUST fail gracefully with a clear message, without degrading
  already-connected members and without affecting any on-chain capability.

### Key Entities

- **Pool Channel**: The per-pool communication space. Scoped to exactly one pool
  on one network; participants are the pool's verified members; lifetime is
  bounded by the pool lifecycle.
- **Peer Session**: One member device's authenticated connection to a pool
  channel. Carries proof of pool membership; presented to others only as the
  member's nickname.
- **Standings Update**: A creator-authored message describing interim scores,
  eliminations, or round progress by nickname. Interim, off-chain, and
  creator-attributed; the latest state supersedes earlier ones.
- **Announcement**: A short creator-authored structured notice, optionally
  linking to a pool action (e.g. a payout proposal awaiting approval).
- **Claim-Code Hand-off**: A member-to-creator delivery of that member's payout
  claim code, readable by the creator only, bound to the sender's in-pool
  identity, and confirmed back to the sender on receipt.
- **Presence Roster**: The set of nicknames currently connected to a pool
  channel; display-only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A standings or stats change made by the creator is visible to
  every connected member within 5 seconds under normal network conditions,
  with no member transaction.
- **SC-002**: A member can deliver their payout claim code to the creator
  entirely inside the app in under 30 seconds, with zero manual copy-paste, and
  the creator's payout allocation reflects it without retyping.
- **SC-003**: 100% of channel participants are verified pool members; a
  non-member device can neither read nor post to a pool channel (verified by
  test/review).
- **SC-004**: 0 servers of any kind (FairWins-operated or third-party) are
  involved in establishing channel sessions or carrying channel messages;
  message content exists only on member devices and in transit between them
  (verified by review/audit).
- **SC-005**: A claim code sent over the channel is readable by the creator
  only: 0% of hand-offs expose the code to other members or intermediaries
  (verified by test/review).
- **SC-006**: With the channel completely unavailable, 100% of pool
  capabilities (create, join, vote, propose, resolve, claim, refund, manual
  claim-code hand-off) still succeed — no new hard dependency is introduced.
- **SC-007**: A member connecting mid-game converges to the creator's current
  standings within 10 seconds of their channel session being established.
- **SC-008**: No wallet address is disclosed on, or derivable from, channel
  traffic by other members; members appear only as nicknames (verified by
  review/audit), and members are informed before any direct connection exposes
  their network address to peers.
- **SC-009**: Pools that use announcements for resolution nudges reach their
  approval threshold before timeout at least as often as pools that don't (the
  channel never makes coordination worse).
- **SC-010**: A pool channel sustains 25 concurrently connected members within
  the SC-001 latency and remains functional at 50; connection attempts beyond
  the design target are declined with a clear message and 0 impact on
  already-connected members or on-chain flows.

## Assumptions

- **Transport direction (user-directed)**: The user has asked to investigate
  browser-native peer-to-peer transport (WebRTC) for this channel. The spec is
  written to be satisfiable by such a transport; the final transport selection,
  and the design of connection establishment, are plan-phase decisions
  validated by a feasibility spike.
- **Strictly serverless connection establishment (clarified 2026-07-02)**:
  There is no rendezvous, signaling, or relay service — FairWins-operated or
  third-party. Members bootstrap sessions by exchanging connection material
  directly (copy-paste/QR), the same way they already share four-word phrases
  and claim codes today. The accepted trade-offs: per-session handshake
  friction, no connection possible across networks that block direct
  peer-to-peer traffic, and both parties must be online to establish a session.
  The plan-phase spike validates that the chosen transport works within these
  constraints and designs the handshake UX to minimize the friction.
- **Structured messages only**: The channel carries defined message types
  (standings, announcements, claim-code hand-offs, presence). Free-form
  member-to-member chat is out of scope — it would import moderation and abuse
  surface disproportionate to the coordination value.
- **Best-effort delivery, creator as source of truth**: There is no
  store-and-forward guarantee and no server-side message history. The creator's
  device is the authority for interim standings (per spec 034); reconnection
  converges members to the creator's current state. Anything that must survive
  all devices being offline belongs on-chain, not on the channel.
- **Identity reuse**: Members already hold per-pool anonymous identity material
  (a public identity commitment from which any member can derive any member's
  nickname, and wallet-signature-derived secrets used elsewhere in the app).
  Channel authentication and encryption are expected to reuse this material
  rather than introduce a new registration step; exact construction is a plan
  decision.
- **Claim-code sensitivity model**: Per spec 034, a claim code (claim-scope
  nullifier) is deliberately revealed to the creator and does not let anyone
  else claim. The channel treats it as confidential to the member→creator pair
  anyway (defense in depth), but its exposure is not fund-loss-critical.
- **Friend-group concurrency (clarified 2026-07-02)**: The live channel is
  sized for the pools people actually run — roughly 25–50 concurrently
  connected members — not the ~1,000-member anonymity cap. Larger pools remain
  fully functional on-chain; their members simply may not all be live-connected
  at once.
- **Same-network scope**: The channel inherits the pool's network scoping; no
  cross-network or cross-pool traffic.
- **Active-tab availability**: Members receive channel traffic while the app is
  open; background/push delivery when the app is closed is out of scope.

## Out of Scope

- Operating or depending on any rendezvous, signaling, or relay service —
  FairWins-operated or third-party (strictly serverless posture, per
  Clarifications).
- Free-form member-to-member chat or direct messages between non-creator
  members.
- Server-side message history, store-and-forward delivery, or offline inboxes.
- Push notifications when the app is closed (spec 031's polling feed remains
  the notification surface).
- Using the channel for anything consensus-bearing: votes, proposals, joins,
  and claims remain exclusively on-chain.
- Extending the channel to one-to-one `WagerRegistry` wagers or open challenges
  (the design should not preclude it, but it is not built here).
- Replacing the four-word phrase join flow (the phrase remains the pool
  locator; the channel is only reachable after membership).
- Media (images, files, voice); messages are small and structured.

## Dependencies

- **Spec 034 (ZK-Wager Pools)**: pool lifecycle, member identities/commitments,
  two-word nicknames, the resolution flow whose payout allocation the
  claim-code hand-off auto-fills, and the creator-local standings this feature
  broadcasts.
- The pool frontend surfaces where the channel is experienced: the pool view /
  participant roster and the creator's resolution/payout allocation flow.
- Existing client-side identity and cryptography building blocks
  (wallet-signature-derived keys, per-pool identity cache) for authenticating
  and encrypting channel participation.
- The platform's no-backend posture (spec 007 lineage), here taken to its
  strictest form: no rendezvous, signaling, or relay infrastructure at all
  (FR-020); the existing out-of-band share flows (copy/QR) double as the
  connection-handshake carrier.
