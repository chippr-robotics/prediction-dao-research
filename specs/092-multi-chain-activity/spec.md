# Feature Specification: Multi-Chain Activity Ledger

**Feature Branch**: `092-multi-chain-activity`

**Created**: 2026-08-16

**Status**: Implemented (this branch)

**Input**: User description: "Multi-chain activity ledger: the Account tab's Activity feed and Stats (P&L chart, summary tiles, breakdowns) should merge activity history from every chain in the build's cohort — not just the active network — so an account's recorded history reflects its entire estate. Reads span the cohort with per-chain failure isolation (spec-071 estate-read pattern: read / not-deployed / unreachable, an unreachable chain never renders as zero activity and any merged total missing a chain is labelled partial and names it). Entries stay chain-tagged, dedup/identity stays per-chain, and writes remain single-chain. Follows up the estate breakdown shipped in PR #1200, which covered balances but not history."

## The gap this closes

A member's balances already read estate-wide: the Portfolio view and the Stats view's estate
breakdown scan every supported network. Their **history** does not. The Activity feed and every
wager statistic (P&L chart, summary tiles, breakdowns) are computed from the **active network
only**, so switching networks silently swaps the member's entire recorded past. A member who
wagered on Polygon and later switched to another chain sees "No activity yet"; an imported or
recovered account whose history lives on a chain the member rarely selects looks permanently
inactive. The record of what an account did should be as estate-wide as the record of what it
holds.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One activity record for the whole estate (Priority: P1)

As a member, when I open my Account tab's Activity view, I see everything this account has done
on every network in my build's cohort — wagers, transfers, earn, pools, membership — in one
newest-first record, with each entry saying which network it happened on. Switching my wallet's
active network does not change what history I see.

**Why this priority**: This is the core promise — the activity record is the member's financial
memory, and today it has amnesia about every chain but one. It is also the direct fix for the
imported-account experience the estate breakdown only half-solved (balances appeared; history
still didn't).

**Independent Test**: Seed an account with recorded activity on two cohort networks. Open the
Activity view on either active network — both networks' entries appear, interleaved by time,
each labelled with its network. Switch active network — the list is unchanged.

**Acceptance Scenarios**:

1. **Given** an account with activity on networks A and B, **When** the member opens Activity
   with A active, **Then** entries from both A and B appear, interleaved newest-first, each
   showing its network.
2. **Given** the same account, **When** the member switches the active network to B,
   **Then** the merged record is unchanged (same entries, same order).
3. **Given** network B is unreachable during the read, **When** the member opens Activity,
   **Then** A's entries render, a notice names B as not refreshed, and B's absence is never
   presented as "no activity on B".
4. **Given** a network in the cohort where the platform has no deployment, **When** the merged
   record loads, **Then** that network contributes nothing and no warning is raised for it
   (absence of a deployment is a normal state, not a failure).

---

### User Story 2 - Stats computed across the estate (Priority: P2)

As a member, my Stats view's summary tiles, P&L chart, and breakdowns reflect my wager history
from every cohort network combined — my win rate, net P&L, and totals describe my account, not
my currently selected network. When any network could not be read, the figures say they are
partial and name the network rather than silently understating.

**Why this priority**: Depends on the merged record (US1) as its input. Wrong-but-confident
numbers are worse than absent numbers, so the partial-labelling rules must land with the math,
not after it.

**Independent Test**: Seed settled wagers on two cohort networks with known outcomes. The
summary tiles and P&L series equal the hand-computed combination of both. Make one network
unreachable — figures recompute from the readable network and carry a visible "partial —
<network> not included" disclosure.

**Acceptance Scenarios**:

1. **Given** settled wagers on networks A and B, **When** Stats loads, **Then** net P&L, win
   rate, totals, and the P&L series equal the combined history of A and B.
2. **Given** B is unreachable, **When** Stats loads, **Then** figures computed from A alone
   render with a disclosure that names B as missing, and no figure derived from an incomplete
   read is presented as complete.
3. **Given** all cohort networks are unreachable, **When** Stats loads, **Then** the view shows
   an honest failure state (last-known values marked stale, or an explicit error) — never a
   fabricated zero.

---

### User Story 3 - Working with a multi-network record (Priority: P3)

As a member reading a merged record, I can filter the Activity feed to a single network when I
want a per-network view, and every entry's explorer link opens the correct network's explorer.
The wager-message context and search shipped previously keep working across the merged record.

**Why this priority**: Quality-of-life on top of the merged record; the merge is useful without
it, but a busy multi-network account needs a way to narrow the view.

**Independent Test**: With activity on two networks, apply the network filter — only that
network's entries remain; clear it — the merged record returns. An entry's "view transaction"
link targets the explorer of the entry's own network, not the active one.

**Acceptance Scenarios**:

1. **Given** a merged record spanning networks A and B, **When** the member filters to A,
   **Then** only A's entries show, and the existing class filter and search compose with the
   network filter.
2. **Given** an entry recorded on B while A is the active network, **When** the member opens its
   transaction link, **Then** it opens B's explorer.
3. **Given** a search for a wager's message, **When** matching entries exist on several
   networks, **Then** all of them match regardless of active network.

---

### Edge Cases

- **Same identifier on two networks**: wager #12 exists independently on two chains. Entry
  identity remains scoped per network — the two never merge, dedup never collapses them, and
  each row's wager-message context resolves against its own network's records.
- **A network is readable but its history source is behind**: staleness is reported per network;
  one lagging network marks only its own classes stale, not the whole record.
- **Chain-bound acting accounts**: a vault exists on one network, but its address may still have
  recorded activity elsewhere; the merged read runs everywhere and empty results render as
  genuinely empty (a read that succeeded and found nothing is not a failure).
- **Device history pruning happened on one network only**: the pruning disclosure states which
  network's history was pruned rather than implying the whole record was.
- **Cohort boundary**: a testnet build merges testnet networks only; a mainnet build mainnet
  networks only. No read, figure, or entry ever crosses the boundary, and a network outside the
  cohort is not "missing" — it is out of scope and generates no partial warning.
- **Mid-merge network switch**: the member switches active network while a merged read is in
  flight; the result set is unaffected (the merge is keyed to the account and cohort, not to the
  active network) and no duplicate or dropped entries result.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Activity feed MUST present one merged, newest-first record of the account's
  activity across every network in the build's cohort, independent of the active network.
- **FR-002**: "Every network" MUST mean the build's cohort exactly: testnet builds read testnet
  networks, mainnet builds read mainnet networks, and no read or figure crosses that boundary.
- **FR-003**: Each network MUST be read independently, resolving to one of three states — read,
  not-deployed, or unreachable — and one network's failure MUST NOT abort, delay indefinitely,
  or blank the others' results.
- **FR-004**: An unreachable network MUST NEVER be rendered as zero activity. Its absence MUST
  be disclosed by name wherever its data would have appeared (feed notice, stats disclosure).
- **FR-005**: A not-deployed network MUST contribute nothing and raise no warning — absence of
  a deployment is a normal state, not a failure.
- **FR-006**: Every entry MUST carry its network, visible on the row, and per-entry actions
  (explorer links) MUST target the entry's own network.
- **FR-007**: Entry identity and deduplication MUST remain scoped per network; identical
  identifiers on different networks MUST never merge or collide, including after the merge.
- **FR-008**: Summary tiles, the P&L chart, and the breakdowns MUST be computed from the merged
  cohort-wide history, and any figure computed while one or more cohort networks were
  unreachable MUST be labelled partial and name the missing network(s).
- **FR-009**: When every cohort network is unreachable, Stats and Activity MUST show an honest
  failure state — last-known values marked stale or an explicit error — never fabricated zeros
  or an empty state implying "no activity".
- **FR-010**: Staleness and pruning disclosures MUST be per network: a lagging or pruned network
  is named, and only its own contribution is marked affected.
- **FR-011**: The Activity feed MUST offer a network filter that composes with the existing
  class filter and search; the wager-message context and search MUST work across the merged
  record, resolving each entry against its own network's wager records.
- **FR-012**: Merged reads MUST follow the acting account (personal, vault, recovered,
  hardware), and a successful read that finds nothing MUST render as genuinely empty, with the
  account-aware empty states retained.
- **FR-013**: The merged record MUST NOT introduce any action that spans networks: every
  member-initiated action remains a single transaction on a single named network.
- **FR-014**: The merged read MUST refresh on the same cadence the single-network record did,
  and a refresh MUST update each network's freshness independently.

### Key Entities

- **Cohort**: the set of networks a build may read — testnet networks on a testnet build,
  mainnet networks on a mainnet build. The unit "all networks" always resolves to.
- **Network read state**: the per-network outcome of a merged read — read / not-deployed /
  unreachable — carried alongside the data so every consumer can disclose honestly.
- **Merged activity record**: the union of per-network activity entries for one account,
  ordered by time, where every entry keeps its network tag and network-scoped identity.
- **Partial figure**: any statistic computed while at least one cohort network was unreachable;
  carries the names of the missing networks for disclosure.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A member with activity on two or more cohort networks sees 100% of their recorded
  entries in one Activity view, with zero change in the visible record when switching the
  active network.
- **SC-002**: With one network unreachable, the remaining networks' history renders completely,
  and every affected surface (feed and each stats figure) discloses the missing network by name
  — zero instances of missing data rendering as a zero or an empty state.
- **SC-003**: Stats figures for a multi-network account match a hand-computed combination of the
  per-network histories exactly in test scenarios (no double counting, no dropped entries).
- **SC-004**: An imported/recovered account whose history lives on a non-active network shows
  that history within one load of opening the Account tab, with no network switch required.
- **SC-005**: The merged view's load completes in comparable time to the current single-network
  view for a typical cohort (reads run concurrently, and one slow network delays only its own
  contribution).

## Assumptions

- The cohort for this feature is the build's EVM networks (the same set whose deployments the
  app resolves per chain). Bitcoin activity (spec 061) is out of scope for v1 — its
  send/receive records are surfaced by Bitcoin's own surfaces — and can join the merged record
  in a follow-up without changing this spec's guarantees.
- The existing per-network activity sources (indexed where available, derived elsewhere) remain
  the source of truth per network; this feature merges their outputs and does not introduce a
  new store of record.
- The wager-message context (shipped with PR #1200) resolves per network; merging does not
  require messages to be readable across networks.
- Membership activity continues to live on its single reference network and appears in the
  merged record via that network's read, as it does today.
- The default feed presentation (grouping by day, class filter, search) is unchanged; the
  network filter is additive.
- Estate balance figures (the estate breakdown) and estate history figures may disagree
  legitimately (balances can move without recorded app activity); no reconciliation between the
  two is promised.
