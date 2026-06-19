# Feature Specification: Oracle & Graph Network Gating

**Feature Branch**: `claude/oracle-graph-network-gating-3r55fg`

**Created**: 2026-06-19

**Status**: Draft

**Input**: User description: "the app should disable the oracle wager button on the quick select menu on networks without oracles / disable reporting and advanced metrics on networks not configured to the graph - will need to poll rpc directly to get stats"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Oracle wager option reflects network oracle support (Priority: P1)

A user on the dashboard quick-select menu wants to start a new wager. On a network
that has no oracle adapters deployed, the option to create an oracle-settled wager
must not be selectable, so the user is never led into a flow that cannot be
completed on their current network.

**Why this priority**: Today the oracle wager entry point is always selectable from
the quick menu, but downstream the oracle resolution flow is unavailable on
networks with no oracle adapters. Letting a user start a flow that dead-ends is the
most visible correctness/trust problem and the most direct interpretation of the
request, so it ships first.

**Independent Test**: Connect to a network with no configured oracle adapters and
open the quick-select menu — confirm the oracle wager option is visibly disabled
with an explanation and cannot be activated. Then connect to a network that has at
least one oracle adapter and confirm the option is enabled and opens the oracle
wager flow.

**Acceptance Scenarios**:

1. **Given** the user is connected to a network with at least one oracle adapter
   configured, **When** they open the quick-select menu, **Then** the oracle wager
   option is enabled and activating it opens the oracle wager creation flow.
2. **Given** the user is connected to a network with no oracle adapters configured,
   **When** they open the quick-select menu, **Then** the oracle wager option is
   shown in a disabled state and cannot be activated.
3. **Given** the oracle wager option is disabled because the network has no
   oracles, **When** the user focuses or hovers the option, **Then** a clear reason
   is presented explaining oracle wagers are unavailable on the current network.
4. **Given** the user switches from a network without oracles to one with oracles
   (or vice versa) while the quick-select menu is visible, **When** the network
   change completes, **Then** the oracle wager option's enabled/disabled state
   updates to match the new network without requiring a page reload.

---

### User Story 2 - Reporting & advanced metrics reflect indexing availability (Priority: P2)

A user opens reporting and advanced-metrics views (e.g. tax reports and the
historical account stats dashboard). On a network that is not indexed by the
project's indexing service ("the graph"), the subgraph-dependent reporting and
advanced-metrics features must be disabled with a clear explanation, so the user is
not shown an error, an infinite spinner, or silently incomplete data.

**Why this priority**: Reporting and advanced metrics depend on indexed historical
data that does not exist on un-indexed networks. Gating these features prevents
broken or misleading experiences, but it affects fewer flows than the primary
wager-creation path, so it follows P1.

**Independent Test**: Connect to a network that is not configured for indexing and
open the reporting / advanced-metrics views — confirm the subgraph-dependent
features are disabled with an explanatory message rather than an error or hang.
Then connect to an indexed network and confirm the full reporting and advanced
metrics render as before.

**Acceptance Scenarios**:

1. **Given** the user is connected to an indexed network, **When** they open
   reporting and advanced-metrics views, **Then** the full reporting and
   advanced-metrics experience is available and populated.
2. **Given** the user is connected to a network that is not indexed, **When** they
   open reporting or advanced-metrics views, **Then** the subgraph-dependent
   reporting and advanced-metrics features are disabled and a clear message
   explains they are unavailable because the network is not indexed.
3. **Given** the user is on a non-indexed network with reporting disabled, **When**
   they attempt to generate a report that requires indexed history, **Then** the
   action is blocked with an explanation rather than producing an error or partial
   result.
4. **Given** the user switches between an indexed and a non-indexed network, **When**
   the network change completes, **Then** the availability of reporting and
   advanced metrics updates to match the new network.

---

### User Story 3 - Basic stats available via direct chain reads on un-indexed networks (Priority: P3)

A user on a network that is not indexed still wants to see basic account/wager
statistics. When indexed history is unavailable, the app reads the necessary data
directly from the chain so the user can still see basic stats, with a clear
indication that these are basic (not full advanced) metrics.

**Why this priority**: This restores baseline visibility on un-indexed networks
after the advanced features are gated off in P2. It depends on P2 being in place
and is a graceful-degradation enhancement, so it is lowest priority but explicitly
requested ("will need to poll rpc directly to get stats").

**Independent Test**: Connect to a non-indexed network and open the stats view —
confirm a basic set of stats is populated from direct chain reads and is clearly
distinguished from the (disabled) advanced metrics.

**Acceptance Scenarios**:

1. **Given** the user is connected to a non-indexed network, **When** they open the
   stats view, **Then** a defined set of basic stats is populated using data read
   directly from the chain.
2. **Given** basic stats are sourced from direct chain reads, **When** they are
   displayed, **Then** the UI clearly indicates the stats are basic and that
   advanced metrics require an indexed network.
3. **Given** direct chain reads are slow or partially complete, **When** the user is
   waiting, **Then** the UI communicates progress/loading honestly and does not
   present partial results as final.
4. **Given** direct chain reads fail or are unavailable, **When** the stats view
   loads, **Then** the user sees a clear, non-blocking message rather than a hang or
   raw error.

---

### Edge Cases

- A network has an oracle adapter configured but it is not currently reachable —
  the option remains enabled (configuration drives gating, not live reachability);
  reachability errors are surfaced later in the flow.
- A network has some but not all oracle adapter types configured — the oracle wager
  option is enabled as long as at least one oracle type is available; unavailable
  oracle types are handled by the existing downstream oracle picker.
- A network is indexed but the indexing service is temporarily unreachable or
  lagging — this is a runtime/availability condition, distinct from "not
  configured", and is surfaced as a transient error, not as the disabled state.
- A network is configured for indexing but the index is far behind head — basic
  stats and advanced metrics may disagree; the UI must not imply finality the data
  does not support.
- The user is not connected to any wallet/network — gating falls back to a safe
  default (features that require a known network are unavailable until a network is
  selected).
- Direct chain reads on a high-volume network exceed practical limits — basic stats
  are bounded so the view stays responsive rather than scanning unbounded history.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST determine, for the active network, whether at least
  one oracle adapter is configured for wager resolution.
- **FR-002**: On the quick-select menu, the system MUST disable the oracle wager
  option when the active network has no configured oracle adapters, and enable it
  when at least one is configured.
- **FR-003**: When the oracle wager option is disabled due to lack of oracle
  support, the system MUST present a clear, user-readable reason on focus/hover.
- **FR-004**: The system MUST re-evaluate the oracle wager option's enabled state
  when the active network changes, without requiring a page reload.
- **FR-005**: The system MUST prevent activation of the oracle wager flow from the
  quick-select menu while the option is disabled.
- **FR-006**: The system MUST determine, for the active network, whether the
  network is configured for indexing by the project's indexing service.
- **FR-007**: The system MUST disable subgraph-dependent reporting and
  advanced-metrics features on networks that are not configured for indexing.
- **FR-008**: When reporting/advanced metrics are disabled due to a network not
  being indexed, the system MUST present a clear, user-readable explanation rather
  than an error state or indefinite loading.
- **FR-009**: The system MUST block report-generation actions that require indexed
  history on non-indexed networks, with an explanation, rather than producing an
  error or partial output.
- **FR-010**: On non-indexed networks, the system MUST provide a defined set of
  basic stats sourced directly from on-chain reads.
- **FR-011**: The system MUST visually distinguish basic (direct-read) stats from
  advanced (indexed) metrics so users understand which experience they are seeing.
- **FR-012**: The system MUST re-evaluate reporting/advanced-metrics availability
  and the basic-vs-advanced stats mode when the active network changes.
- **FR-013**: The system MUST handle slow, partial, or failed direct chain reads
  gracefully, communicating loading/error states honestly and never presenting
  partial data as final.
- **FR-014**: The system MUST scope all gating decisions and stats to the active
  network and MUST NOT leak data or capabilities across networks.
- **FR-015**: The system MUST distinguish "network not configured for indexing"
  (disabled state) from "indexing configured but temporarily unavailable"
  (transient error state).
- **FR-016**: Direct on-chain stat reads MUST be bounded so the stats view remains
  responsive on high-volume networks.

### Key Entities *(include if feature involves data)*

- **Network Capability Profile**: The set of capabilities derived for the active
  network — notably whether oracle adapters are configured and whether the network
  is configured for indexing. Drives all gating decisions.
- **Oracle Availability**: Whether one or more oracle adapters exist for the active
  network; the basis for enabling/disabling the oracle wager option.
- **Indexing Availability**: Whether the active network is configured for the
  indexing service; the basis for enabling/disabling subgraph-dependent reporting
  and advanced metrics.
- **Basic Stats**: The bounded set of account/wager statistics derivable from
  direct on-chain reads when indexed history is unavailable.
- **Advanced Metrics / Reports**: The richer, history-dependent metrics and reports
  that require indexed data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On every network with no oracle adapters configured, the oracle wager
  option in the quick-select menu is non-activatable in 100% of attempts, and the
  reason is discoverable by the user.
- **SC-002**: On every network with at least one oracle adapter configured, the
  oracle wager option opens the oracle wager flow in 100% of attempts.
- **SC-003**: On networks not configured for indexing, opening reporting/advanced
  metrics never produces an unhandled error or an indefinite loading state — users
  always see either disabled features with an explanation or basic stats.
- **SC-004**: On non-indexed networks, basic stats are populated from direct chain
  reads within a responsive timeframe (target: visible result or honest progress
  state within a few seconds) and are clearly labeled as basic.
- **SC-005**: Switching the active network updates oracle-option, reporting, and
  stats-mode availability to match the new network with no stale cross-network
  state, verified across at least one indexed and one non-indexed network.
- **SC-006**: Support/confusion incidents about "oracle wager doesn't work" or
  "reports are broken" on unsupported networks are eliminated for the gated flows.

## Assumptions

- "Networks without oracles" means networks for which no oracle adapter address is
  configured for the active chain; configuration (not live reachability) drives the
  gating decision.
- "Networks not configured to the graph" means networks for which the project's
  indexing service is not configured for the active chain.
- The oracle wager option should be shown in a disabled state with an explanatory
  reason (consistent with existing locked-capability patterns) rather than removed
  entirely, so users understand the option exists but is unavailable on this
  network.
- "Reporting and advanced metrics" refers to the existing history-dependent
  reporting and account-stats experiences that currently rely on indexed data.
- The intent of "poll rpc directly to get stats" is graceful degradation: provide a
  bounded set of basic stats from direct chain reads on un-indexed networks rather
  than leaving the stats view empty; full parity with indexed advanced metrics is
  out of scope.
- The exact set of "basic stats" is the subset of existing stats that can be
  derived from bounded direct chain reads; richer history that requires indexing
  remains gated.
- Gating reuses existing network-capability and contract-address resolution
  mechanisms rather than introducing a new configuration source.
- This feature is frontend-only; no smart-contract changes are required.
