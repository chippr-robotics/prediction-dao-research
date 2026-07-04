# Phase 0 Research: My Wagers Refinements

All eight refinements map onto existing subsystems. There were no open `NEEDS CLARIFICATION`
markers in the spec; this document records the design decision, rationale, and rejected
alternative for each non-trivial slice, grounded in the current code.

## D1 — Opponent name resolution (US1 / FR-001..004)

**Current state**: `wagerVm.js:97-98,184` renders the opponent as `formatShortAddress(others[0])`
— a bare `0x1234…ABCD`. No ENS, address book, or generated name is applied to wager cards.

**Decision**: Add a `useOpponentName(address)` hook that resolves in priority order:
1. **Address book** — `useAddressBook().findByAddress(address, chainId)` → contact nickname (member's
   own labeling is authoritative).
2. **ENS** — `useEnsReverseLookup(address)` (`hooks/useEnsResolution.js`) resolves the reverse record
   on mainnet, already cached (5-min stale / 30-min gc).
3. **Generated** — a new `deriveAddressName(address)` (`lib/naming/addressName.js`) that hashes the
   checksum-normalized address with `keccak256` and indexes the existing 64×64 `ADJECTIVES`/`NOUNS`
   vocabulary from `lib/pools/nicknameWords.js`, yielding a stable adjective-noun label.

Rendering moves into a small presentational **`OpponentName.jsx`** that shows the resolved name and,
on click/Enter (a real `<button>`), reveals the full address with a copy affordance. `wagerVm.js`
keeps the raw address available; the card/table swap the plain opponent string for `<OpponentName>`.
The connected wallet continues to render "You" (existing `creatorLabel` logic, FR-004).

**Rationale**: Reuses three audited subsystems; the generated fallback guarantees a name even with no
address book entry and no ENS, and is deterministic so repeat opponents are recognizable (FR-002).
Resolving inside a per-card component is the idiomatic way to call the per-address ENS hook.

**Alternatives rejected**:
- *Reuse `deriveNickname` (pool nickname) directly* — it is keyed on a Semaphore **identity
  commitment**, not an address, and is pool-scoped; overloading it would conflate two concepts. A
  separate `deriveAddressName` sharing only the vocabulary keeps semantics clean.
- *Resolve names in the pure `wagerVm` builder* — hooks can't be called there; and batching ENS for
  all cards at once adds complexity for no benefit over per-card cached lookups.

## D2 — Draw state clarity + per-party submission (US2 / FR-005..008)

**Current state**: `WagerStatus.DRAW='draw'` is terminal (`wagerDefaults.js:123`), classed
`status-draw`. A pending proposal (`draw_proposed`) only surfaces as an action badge/button "Respond
to Draw" (`wagerVm.js:117,162-164`). The proposer identity (`drawProposer`) is indexed by the v2
subgraph and read via `drawProposalScan.js`, but that enrichment currently flows only into the
notification engine (`sources/wagerSource.js:63-67`), **not** into the My Wagers card view model.

**Decision**:
- **Visible draw state (FR-005)**: give `draw_proposed` its own status treatment on the card (not just
  an action button) and keep the terminal `draw` treatment, both with text + icon.
- **Per-party submission (FR-006)**: thread the `drawProposer` onto the market objects the modal feeds
  to `wagerVm` (run/`fetchDrawProposals` for the user's wager ids in the modal's data path, matching
  what `wagerSource` already does). Derive: `proposer === me` → "You proposed · awaiting opponent";
  `proposer === opponent` → "Opponent proposed · your turn"; terminal `draw` → "Both agreed · stakes
  returned". Render as a small submission chip pair.
- **Notification (FR-007)**: draw proposals already pass through `diffWagers` → `activityEngine`. The
  work is to **verify** a `null → proposer` transition emits a user-facing entry and label it clearly
  as "Draw proposed — respond"; add a regression test. Only if the diff does not already emit it do we
  add the transition (kept as a contingency in tasks).
- **Settled draw (FR-008)**: the terminal `draw` state already reflects both stakes returned; ensure
  the card copy states it.

**Rationale**: The proposer datum is already indexed and free to reuse; surfacing it on the card is a
read-only display change that respects honest-state (no assumption about who submitted).

**Alternatives rejected**:
- *Add a new on-chain read for both signatures* — unnecessary; `drawProposer` + the `WagerDrawn` event
  (already detected in the resolution modal, `MyMarketsModal.jsx:1881-1886`) fully determine the state.
- *Infer submission purely client-side from local action history* — violates honest-state and breaks
  across devices; the subgraph proposer is the source of truth.

## D3 — Frictionless decryption for challenges & pools (US3 / FR-009..011)

**Current state**: Open-challenge terms are sealed under a four-word claim code; the user is prompted
every time via `OpenChallengeDecryptModal.jsx` (`MyMarketsModal.jsx:140-142`). A wallet-scoped,
at-rest-encrypted **code vault** already exists (`lib/openChallenge/codeVault.js`) but is a manual
recovery store, not wired into the decrypt flow. Pools use Semaphore identities (no passphrase-style
decrypt words); `MyPoolsSection` just deep-links out and never prompts for words.

**Decision**:
- **Challenges**: when opening an encrypted open-challenge item, first look up a saved code in the
  vault and **auto-decrypt** without prompting; only show the words prompt when no saved code exists
  (FR-011). After any successful manual entry, `addEntry` the code to the vault so the next visit is
  automatic (FR-009). The vault key is derived from a one-time wallet signature
  (`CODE_VAULT_SIGN_MESSAGE`); cache the derived key in memory for the session so the member is not
  re-signed per item. Storage stays wallet-scoped and encrypted (FR-010) — no new plaintext.
- **Pools**: confirm the pool path requires no decrypt words in My Wagers (it does not today). The
  member's pool identity/secret is already device-persisted; "do not ask" is satisfied by ensuring
  that persisted identity is reused. This slice is primarily **verify + regression test** for pools.

**Rationale**: Reuses the audited ChaCha20-Poly1305 vault and its wallet-derived key; a session-cached
key trades a per-item prompt for at most one signature per session — a large friction win with no
weakening of at-rest protection.

**Alternatives rejected**:
- *Persist claim codes in plaintext localStorage* — violates the key-management constraint and the
  spec's FR-010. The encrypted vault already exists; use it.
- *Store the derived vault key persistently* — unnecessary and riskier than an in-memory session cache.

## D4 — Periodic auto-update incl. pools (US4 / FR-012..014)

**Current state**: The wager list already polls every 30s while the modal is open via
`refreshFriendMarkets()` (`MyMarketsModal.jsx:121-128`, spec 019), cleared on close. But
`useMyPools` (`hooks/useMyPools.js:57-69`) loads **once** on mount and never re-polls.

**Decision**: Add a periodic refresh to `useMyPools` (expose `refresh()` and run it on the same ~30s
cadence while mounted), and clear the interval on unmount so polling stops when the modal closes
(FR-014). Keep the wager poll as-is.

**Rationale**: Smallest change that brings pools to parity with wagers; the hook already has an
idempotent `load()` to call.

**Alternatives rejected**:
- *Lift pool loading into the modal's existing poll* — more invasive and couples the pool data path to
  the wager context; a self-contained interval in the hook is simpler and testable.

## D5 — Terminal group pools filed under History (US5 / FR-015..016)

**Current state**: `MyPoolsSection` renders **all** pools flat at the top of the modal on **every**
tab, each with an inline "Active"/"Past" chip (`MyPoolsSection.jsx:19-42`). `aggregateMyItems`
already computes `bucket: 'active' | 'history'` from `TERMINAL_POOL_STATES = {2 Resolved, 3 Cancelled}`
(`myWagersAggregation.js`).

**Decision**: Make `MyPoolsSection` tab-aware: pass `activeTab` in; when the History tab is active show
only `bucket === 'history'` pools, otherwise show only `bucket === 'active'` pools. Terminal pools
thus leave the active view (FR-015) and appear under History (FR-016). Drop the per-row Active/Past
chip since the tab now conveys it.

**Rationale**: The bucket is already computed; this is a filter + placement change, no new state.

**Alternatives rejected**:
- *Split pools into participating vs created buckets* — pools don't have that inbound/outbound
  distinction cleanly; active-vs-terminal is the meaningful split the tester asked for.

## D6 — Status filter cleanup (US6 / FR-017..019)

**Current state**: The status `<select>` offers "Disputed" (`MyMarketsModal.jsx:941`) and "Expired"
(`:943`). The default "all" view already hides expired wagers unless "Expired" is chosen
(`:332-338`).

**Decision**: Remove the Disputed and Expired `<option>`s. Leave categorization/`getMarketStatus`
untouched so expired wagers stay hidden by default (FR-019). The underlying `WagerStatus.DISPUTED`/
`EXPIRED` values remain defined (other code may reference them); only the filter options are removed.

**Rationale**: Directly addresses the tester note; zero behavioral risk to non-removed filters.

**Alternatives rejected**:
- *Delete the statuses from `WagerStatus`* — out of scope and risky; they're referenced elsewhere
  (status labels/classes). The note is specifically about the dropdown options.

## D7 — Remove redundant header network pill (US7 / FR-020..021)

**Current state**: The header shows a `mm-network-tag` pill with `activeNetwork.name`
(`MyMarketsModal.jsx:817-824`) **and** a subtitle "Manage your wagers … on {activeNetwork.name}"
(`:826-828`) — the network name appears twice.

**Decision**: Remove the `mm-network-tag` `<span>` and its CSS; keep the subtitle (FR-021).

**Rationale**: Eliminates the duplication the tester flagged; the subtitle already communicates the
active network.

**Alternatives rejected**:
- *Remove the network name from the subtitle instead* — the pill is the redundant element; the
  subtitle sentence is the primary, screen-reader-friendly statement of network.

## Cross-cutting notes

- **Terminal-state definitions differ across layers**: wagers use `TERMINAL_STATUSES` (`draw`,
  `oracle_timed_out`, …) while `myWagersAggregation` uses `TERMINAL_WAGER_STATUSES`/
  `TERMINAL_POOL_STATES`. This feature only relies on the **pool** bucket for D5; no reconciliation of
  the wager definitions is required, but tasks note the discrepancy so it isn't widened.
- **Accessibility**: name reveal and draw chips must pass axe/Lighthouse; convey state with text+icon,
  not color alone.
- **Network isolation**: opponent resolution, draw enrichment, and pool bucketing all remain scoped to
  the active `chainId`, preserving Constitution III.
