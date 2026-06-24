# Phase 0 Research: Platform-Wide Notification & Activity System

Grounded in a read of the existing wager watcher, the four domains' on-chain read paths, and the feed/bell
UI. Each decision: **Decision / Rationale / Alternatives considered**.

## R1 — Generalization seam: an `ActivitySource` interface over the existing engine

**Decision**: Extract a plugin interface `ActivitySource = { key, detect({account, chainId, nowMs, prior})
→ { entries, nextSnapshots, currentIds, actionNeededById, ok, partial? } }`. A generalized
`ActivityProvider` runs all registered sources each cycle, merges their fresh entries, applies the toast
cap **once** across the merged list, and persists one store partitioned by `source.key`. The wager logic
moves behind `wagerSource` with **no behavior change**.

**Rationale**: Research shows the engine is already ~80% domain-agnostic — the store envelope
(`version`/validate/corrupt-reset, account+chain scoping via `userStorage` + `featureKey`),
`appendEntries` (id-dedup + cap to `MAX_ENTRIES=100`), `markRead({entryId}|'*')`, the scope-swap +
in-flight `scopeRef`/`pollingRef`/`firstPollRef` machinery, the 30 s visibility-aware deferred poll loop,
and the toast policy (`MAX_TOASTS_PER_CYCLE`, catch-up feed-only, one-failure-notice) are all generic. The
diff kernel contract `{entries, nextSnapshots}` with "first-sight = snapshot-only, zero entries" +
"carry-forward absent snapshots" is exactly the shape each source needs. The merge-then-cap seam already
exists (`fresh = [...changeEntries, ...warnEntries]` capped once) — it generalizes to
`fresh = sources.flatMap(s => s.entries)`.

**Alternatives considered**: (a) A separate watcher/provider per domain with its own bell — rejected:
multiple bells, duplicated poll/persist/scope logic, no unified unread. (b) A pub/sub event bus that
features push into — rejected: features fire transient events, not durable per-(account,chain) state;
loses catch-up/offline awareness and honest dedup. (c) Rewrite the engine from scratch — rejected:
discards battle-tested, well-tested wager machinery and risks regression.

## R2 — Shared snapshot-diff kernel for every source (the honest, backend-free detector)

**Decision**: Every source detects activity by reading the user's **current** on-chain state for its
domain each cycle and diffing it against the prior persisted per-source snapshot (same kernel wagers use):
first sight records a baseline (zero entries); a change between cycles emits an entry. "Action-needed" is
recomputed live each cycle from current state (never persisted), exactly as `deriveActionNeeded` does for
wagers.

**Rationale**: The four domains expose rich **current-state** reads but **not** complete historical event
indexes client-side (see R6 gaps). Snapshot-diff turns "a role was granted to you", "membership upgraded
to Gold", "proposal entered voting" into a detected state *change* without scanning historical logs — fully
honest and backend-free (Constitution III, FR-022). It also reuses the proven first-sight/carry-forward
semantics, so catch-up after being away is feed-only and never fabricates.

**Alternatives considered**: Per-contract historical `queryFilter`/log scans for every event — rejected as
the primary mechanism: unbounded/cost-heavy without a subgraph, only partial, and unnecessary for "what
changed since I last looked". Bounded log scans are kept **only** where a list is otherwise unknowable
(DAO proposal discovery, R3).

## R3 — DAO source: bounded proposal scan (cached) + per-cycle state re-read

**Decision**: `daoSource` lists the user's tracked DAOs via `useClearPath().listExternalDAOs()`
(`ExternalDAORegistry`), and for each DAO discovers proposals with the existing
`governorConnector.fetchGovernorProposals` (bounded, chunked `eth_getLogs`, `max=50`, `partial` flag).
Map OZ `ProposalState` to events: **Active(1)** → voting-open (action-needed **iff** the user can still
vote, see R4); **Succeeded(4)** → ready-to-queue (action); **Queued(5)** → ready-to-execute (action, see
R5); **Executed(7)/Defeated(3)/Expired(6)/Canceled(2)** → finalized (info). To keep load bounded, cache
the discovered proposal list per DAO and refresh that log scan on a slower sub-cadence; each 30 s cycle
only re-reads `state`/`proposalVotes`/`hasVoted` for **non-terminal** proposals. Mark results `partial`
when the scan truncates (never imply completeness).

**Rationale**: Reuses the shipped, tested bounded indexer (spec 030) — the only place a list is otherwise
undiscoverable on subgraph-less chains. Re-reading only non-terminal proposals' cheap views keeps per-cycle
cost low even with several tracked DAOs. State→event mapping is derivable from `state(id)` alone (already
read).

**Alternatives considered**: Re-scan every DAO's full log range every 30 s — rejected: too heavy. Rely on a
subgraph — rejected: not available on Mordor/ETC (the live ClearPath network).

## R4 — DAO "you can still vote": add `hasVoted`/`getVotes` to the frontend Governor read-ABI

**Decision**: Add the **already-existing** OZ Governor views `hasVoted(proposalId, account)` and
`getVotes(account, timepoint)` to `GOVERNOR_READ_ABI` (frontend ABI only). Voting-open is action-needed
**iff** `state==Active && !hasVoted(id, account) && getVotes(account, proposalSnapshot) > 0`. If a given
Governor does not expose them, degrade voting-open to **informational** (do not fake eligibility).

**Rationale**: FR-027 requires "voting open **and the user can still cast a vote**" as action-needed; the
current ClearPath Governor ABIs omit these views (research gap). They are standard OZ `IGovernor`
functions — adding them to the read-ABI is a reads-only frontend change, no contract change (Constitution I
N/A). Honest fallback preserves Constitution III.

**Alternatives considered**: Mark every Active proposal action-needed for everyone — rejected: dishonest
(badges the user for votes they cannot cast or already cast). Omit voting-open entirely — rejected:
loses the most valuable DAO signal.

## R5 — DAO "ready to execute" timing

**Decision**: Treat `Queued(5)` as ready-to-execute. If `proposalEta(id)` is readable (add to the read-ABI
if the Governor exposes it), gate the action-needed flag on `eta <= now`; otherwise surface Queued as
action-needed with wording that the timelock delay may still be pending (execution reverts if early — the
existing US5 management flow already surfaces that revert truthfully).

**Rationale**: OZ `state` stays `Queued` until executed; precise readiness needs the timelock ETA. Reading
it when available is honest; the conservative fallback never claims confirmed readiness it cannot prove.

**Alternatives considered**: Compute ETA from timelock `getMinDelay` + queue block — rejected as brittle;
prefer the direct `proposalEta` view when present, else the truthful caveat.

## R6 — Token & Membership sources: snapshot-diff over current state; historical events documented + omitted

**Decision**:
- **tokenSource**: each cycle, for tokens the user administers/holds (via `useTokenFactory` discovery),
  read `hasRole(role, account)` for the v2 role surface (admin/minter/pauser/burner/compliance; v1 =
  `owner()==account`) and `paused()`. Diff vs the prior snapshot → emit "role granted/revoked to you" and
  "token paused/unpaused" (informational). Mint-to-user and role/pause **history** are **omitted**
  (require Transfer/Role event scans not wired; see gaps) — only live changes detected from first-sight
  onward are announced.
- **membershipSource**: each cycle read `getMembership(user, role)` (tier, `expiresAt`, counters) +
  `getActiveTier`. Diff vs snapshot → "membership granted/upgraded/expired" (info). "Expiring soon"
  (action-needed: renew) is a deadline-warning-style computed entry from `expiresAt` within a window
  (default 7 days), anti-spammed once per day (reuse the `deadlineWarnings` pattern). "Voucher redeemable"
  (action-needed: redeem) from the `useVouchers` redeemable read.

**Rationale**: All required current-state is fully readable client-side (research confirms exact
ABIs/hooks). Snapshot-diff yields honest "what changed" without historical event indexing, satisfying
FR-028/FR-029 and Constitution III.

**Alternatives considered**: Log-scan `RoleGranted`/`MembershipPurchased`/etc. for timestamped history —
rejected for now (no subgraph; bounded scans only partial). Documented as a future subgraph enhancement.

## R7 — Persisted store: partition by source key + one-time migration

**Decision**: Generalize the store to `{ version, lastPolledAt, sources: { [key]: { snapshots, aux } },
entries: [] }` under key `platform_activity_v1_<chainId>`. On first load for a scope, if a legacy
`wager_activity_v1_<chainId>` store exists, migrate its `entries` (stamped `domain:'wagers'`,
`refId=wagerId`), `snapshots`, and `deadlineWarnings` into `sources.wagers` and carry `entries`/read-state
over, then continue from the new key. Default any entry missing `domain` to `'wagers'`.

**Rationale**: Preserves all existing unread/read state (no user-visible reset) while moving to a
partitioned shape; keeps `appendEntries` cap/dedup global across domains. The corrupt-reset/versioning
guard already exists.

**Alternatives considered**: Keep one store key per source — rejected: complicates the single merged feed,
the global cap, and the unread count. Hard cut-over discarding the old store — rejected: loses read-state
(poor UX, and avoidable).

## R8 — UI: render any domain + per-domain filter + bell action-needed

**Decision**: Add `domain` (machine key + label/icon maps) and a generic `link` (e.g. `{ to, state }`) to
the entry; `ActivityFeed` renders the domain tag and navigates via `entry.link` instead of the wager-only
branch (default `domain:'wagers'`, legacy wager link for old entries). Add a **view-only** filter in the
feed: local `domainFilter` state (resets on open), derived from the loaded entries, shown only when >1
domain present; it never touches entries/unread/action-needed (FR-025). Surface the already-computed
**action-needed** count on the bell (fold into the `aria-label`, not a silent badge). Generalize the
dialog label from "Wager activity" → "Activity".

**Rationale**: Minimal, additive UI changes that satisfy FR-004/FR-025 and finally surface action-needed
where the user looks (the bell). Preserves all existing a11y patterns (dialog role/focus/Escape, bell
aria-label-with-count, toast polite/assertive).

**Alternatives considered**: A separate filter/preferences center — out of scope (deferred). A per-domain
unread breakdown — deferred; single unread + filter is sufficient for the first step.

## R9 — Liveness & scope (unchanged, reused)

**Decision**: Keep the 30 s visibility-aware deferred poll loop, the per-(account,chain) scope swap with
in-flight `scopeRef` guard, concurrent-read-survives-poll re-read, and one-failure-notice-per-session —
all verbatim, now driving N sources. Sources that fail return `ok:false` and the engine retains that
source's prior slice while other sources proceed (FR-020).

**Rationale**: These are already correct and well-tested; generalization must not regress them (FR-015/016/
017/024). Per-source `ok:false` isolation is the multi-source extension of the existing single-source
retain-on-failure.

**Alternatives considered**: Independent timers per source — rejected: redundant; one loop fanning out to
sources is simpler and preserves the single catch-up/toast-cap semantics.

## Resolved unknowns

| Unknown | Resolution |
|---------|-----------|
| Source seam shape | R1 — `ActivitySource.detect` returning the wager triad generalized |
| Honest detection without backend | R2 — shared snapshot-diff kernel |
| DAO data + load | R3 — cached bounded scan + non-terminal re-read |
| DAO vote eligibility | R4 — add `hasVoted`/`getVotes` to read-ABI; honest fallback |
| DAO execute timing | R5 — `proposalEta` when readable, else truthful caveat |
| Token/Membership detection | R6 — snapshot-diff; historical events omitted+documented |
| Persistence migration | R7 — partitioned store v1 + one-time wager migration |
| UI multi-domain + filter | R8 — domain/link on entries, view-only filter, bell action-needed |
| Liveness/scope/failure | R9 — reuse existing machinery; per-source `ok:false` isolation |

All `NEEDS CLARIFICATION` resolved. No backend introduced. No smart-contract changes.
