# P2P Wager — Scale UX Evaluation

**Date:** 2026-05-22
**Branch:** `claude/p2p-wager-ux-scale-iu8wl`
**Scope:** `contracts/wagers/WagerRegistry.sol`, `contracts/access/MembershipManager.sol`,
`contracts/oracles/PolymarketOracleAdapter.sol`, and the privileged-actor surface
that the protocol admin exposes via these contracts.

**Out of scope (this pass):** subgraph/indexer, RPC fan-out, wallet UX,
frontend pagination, L2/sequencer assumptions, USDC issuer risk.

---

## 1. Frame

The question we are answering: *at millions of concurrent users, where can a
single individual's experience be degraded or denied by something we — the
protocol developers and the admin role — control?*

We are deliberately ignoring factors we do not control (chain congestion, gas
price, user wallet hygiene, opposing-party behaviour). Anything that survives
this filter is a self-inflicted scaling defect.

There are three categories where a contract-controlled factor can hurt an
individual user at scale:

1. **Hot shared state** — a storage slot every user must touch, which
   serialises through one location per block and inflates reorg/MEV exposure.
2. **Blast-radius switches** — one admin action that simultaneously affects
   every in-flight user (pause, key swap, allowlist change, role revocation).
3. **Per-user cliffs** — limits coded into the contract that can leave an
   individual stuck through no fault of their own (concurrent-market cap held
   open by an unresponsive counterparty, monthly cap with no leak, etc.).

The findings below are organised by these categories and tagged with severity.

---

## 2. Findings

### P0 — Single switches that brick everyone

#### 2.1 `MembershipManager.authorizedCallers[WagerRegistry] = false` bricks all in-flight wagers

`WagerRegistry.cancelOpen`, `declareWinner`, `autoResolveFromPolymarket` and
`claimRefund` all call `membershipManager.recordClose(...)`. `recordClose`
is gated by `onlyAuthorized` (`contracts/access/MembershipManager.sol:200`),
which reverts if the caller mapping is false.

A single `setAuthorizedCaller(registry, false)` from the admin therefore
freezes **every** non-trivial lifecycle transition for every existing wager
until the bit is flipped back. Refunds, payouts, and cancellations all stop.

**Mitigation (small):** in `WagerRegistry`, wrap the four `recordClose` calls
in `try/catch` so an unauthorized state silently no-ops on close (the
membership counter is already best-effort — `recordClose` itself only
decrements when `activeCount > 0`).

**Mitigation (proper):** make `recordClose` callable by anyone but only
effective when `msg.sender` matches a `closer` recorded on `recordCreate`.
Couples the close to the create and removes the global switch.

#### 2.2 `setMembershipManager(newManager)` swap has the same failure mode

`WagerRegistry.setMembershipManager` (line 82) replaces the pointer
atomically. The new manager's `authorizedCallers` mapping is empty by
default; until the admin separately calls `setAuthorizedCaller(registry,
true)` on the new manager, every in-flight `recordClose` reverts.

This is a two-transaction admin migration with a window where the protocol
is bricked. At scale this window can swallow tens of thousands of pending
refunds.

**Mitigation:** require atomic migration via a multi-call/migrator contract,
plus the same try/catch hardening from 2.1 so a misordered migration cannot
brick refunds.

#### 2.3 `setPolymarketAdapter(newAdapter)` mutates resolution semantics for live wagers

`WagerRegistry.polymarketAdapter` (line 27) is read at resolve time in
`autoResolveFromPolymarket`. A live wager that was created against
adapter-vA will be resolved against adapter-vB after a swap. If vB does not
know the `conditionId`, `getOutcome` returns `(false, 0, 0)`, the call
reverts on `ConditionNotResolved`, and the only path the user has is to wait
for `resolveDeadline` and refund — *for every Polymarket-typed wager on the
platform.*

If vB does know the condition but disagrees with vA's winner derivation
(e.g. different tie-breaking, different CTF address), live winners change
silently.

**Mitigation:** pin the adapter address into the `Wager` struct at
`createWager` time. Use `polymarketAdapter` only as the default at creation.

#### 2.4 `pause()` has unbounded blast radius

`Pausable` gates `createWager` and `acceptWager` but the entire surface is
one switch. An emergency in one resolution type (e.g. a Polymarket adapter
bug) halts native P2P creates too, and pauses every new acceptance — even
for wagers that are unaffected.

**Mitigation:** split into scoped flags (`pauseCreate`, `pauseAccept`,
`pausePolymarket`) or per-token pausing. The cost is a few bools and four
modifiers.

---

### P1 — Hot slots and per-user cliffs

#### 2.5 `_nextWagerId` is a contention slot

`createWager` does `wagerId = _nextWagerId++` on every call. Every user's
create-tx writes the same slot. The serial nature of EVM execution means
this does not raise per-user latency directly, but:

- it forces every create-tx into the same dependency chain in a block, which
  reduces builder parallelism;
- it makes wager IDs a function of block ordering, increasing MEV/reorg
  exposure for users who care about a specific ID (e.g. for off-chain
  invites pre-shared with their counterparty).

**Mitigation:** derive `wagerId = uint256(keccak256(abi.encode(msg.sender,
nonce, chainid)))` where `nonce` is a per-user counter. Eliminates the
shared slot and makes IDs predictable for the creator (a UX win: the invite
QR can encode the ID before the tx confirms).

#### 2.6 `MembershipManager.accruedFees` is a contention slot

Every `purchaseTier`, `upgradeTier`, and `extendMembership` SSTOREs
`accruedFees`. Same characterisation as 2.5 — degrades builder throughput
under load.

**Mitigation:** stream fees to `treasury` on receipt instead of accruing
(`paymentToken.safeTransfer(treasury, cfg.priceUSDC)`). Removes the slot
entirely and removes the `withdrawFees` admin call along with it (smaller
attack surface).

#### 2.7 `maxConcurrentMarkets` is held open by counterparty inaction

`recordClose` only fires on Cancelled/Resolved/Refunded transitions. An
**Open** wager that no opponent ever accepts holds the creator's
concurrent-slot until `acceptDeadline` expires (up to 30 days) and they
remember to call `claimRefund`. An **Active** wager whose arbitrator
disappears holds both participants' slots — wait, only the creator's, since
`activeCount` is creator-keyed — until `resolveDeadline` (up to 180 days).

For a power user at the cap, an unresponsive counterparty becomes an admin
problem: *we* chose this limit, so we own the cliff.

**Mitigations:**
- Auto-release the slot on `acceptDeadline` expiry without requiring a
  `claimRefund` (cron the close, or treat the slot as "max-active" computed
  on read using deadlines instead of incremented on write).
- Surface `slotsRemaining(user)` and `slotsHeldByExpired(user)` as views so
  the frontend can prompt the user to free their own slots.
- Consider counting only `Active` wagers toward the cap, not `Open` ones.

#### 2.8 `monthlyMarketCreation` is a hard cliff with rolling-window reset

The 30-day rolling window resets `monthCount` to 0 only when
`block.timestamp >= monthAnchor + 30 days` *and* a fresh `recordCreate`
runs. Until then the user is told `MonthlyLimitReached` with no signal as
to when their slot reopens.

**Mitigation:** expose `(monthCountUsed, monthResetsAt)` as a public view
so the frontend can show "3/5 used, resets Jun 7".

---

### P2 — Documented but still admin-owned

#### 2.9 `setTokenAllowed(token, false)` is in-flight-safe

Verified: `_allowedTokens[token]` is only checked at `createWager`. Live
wagers carry their own `token` field and continue to pay out / refund.
**No action needed**, but document this guarantee so we don't accidentally
add a runtime check later.

#### 2.10 `MAX_ACCEPT_WINDOW` / `MAX_RESOLVE_WINDOW` are unconfigurable

30-day accept and 180-day resolve are hard constants. A user wanting a
1-year political-event wager is denied by us. Per-user impact is mild
(workaround: re-create) but the cliff is ours.

**Mitigation:** make these admin-settable behind a timelock.

#### 2.11 `setPaymentToken` / `setTreasury` swap mid-collection

If `accruedFees > 0` and `setPaymentToken` is called, future purchases
deposit a different token into the same `accruedFees` counter — a
mixed-token bug. `withdrawFees` then `transfer`s from the *new* token while
the old token balance is stranded.

**Mitigation:** revert `setPaymentToken` while `accruedFees > 0`. Or remove
the slot entirely per 2.6 and the question goes away.

---

### P3 — Low-impact

- **2.12** No event when `accruedFees` changes by an off-path mechanism
  (e.g. direct ERC20 transfer to the contract). Minor analytics gap.
- **2.13** `getWager(unknownId)` returns a zero struct with `Status.None`;
  frontend must not mistake "not found" for "valid wager with zero
  stakes". Document and add an explicit `WagerNotFound` view if needed.
- **2.14** `grantTierAdmin` resets `monthCount` and `monthAnchor`. Admin
  can effectively reset a user's monthly cap by granting their own tier.
  Intentional, but worth listing in the admin runbook.

---

## 3. Summary table

| # | Finding | Severity | Category | Fix size |
|---|---------|----------|----------|----------|
| 2.1 | `recordClose` reverts brick in-flight wagers | P0 | switch | small |
| 2.2 | `setMembershipManager` swap window bricks wagers | P0 | switch | small |
| 2.3 | `setPolymarketAdapter` swap rewrites live semantics | P0 | switch | small |
| 2.4 | Global `pause` blast radius | P0 | switch | small |
| 2.5 | `_nextWagerId` hot slot | P1 | hot slot | medium |
| 2.6 | `accruedFees` hot slot | P1 | hot slot | small |
| 2.7 | `maxConcurrentMarkets` held by unresponsive party | P1 | cliff | medium |
| 2.8 | `monthlyMarketCreation` cliff w/o telemetry | P1 | cliff | small |
| 2.9 | `setTokenAllowed` — verified safe | P2 | doc-only | none |
| 2.10 | Hardcoded deadline windows | P2 | cliff | small |
| 2.11 | `setPaymentToken` mixes accrued balance | P2 | switch | small |
| 2.12 | Missing fee-change event | P3 | doc | tiny |
| 2.13 | `getWager` of unknown ID returns zero struct | P3 | doc | tiny |
| 2.14 | `grantTierAdmin` resets monthly cap | P3 | doc | none |

## 4. Recommended next step

The P0 set is the actual scale story: four single switches, each owned by
the admin EOA, that can simultaneously degrade every user on the platform.
The recommended next branch is a "blast-radius reduction" patch covering
2.1–2.4 — total surface change is roughly 60 lines and one new test file.
The P1 hot-slot items (2.5, 2.6) are a separate, lower-priority follow-up
because they affect block-builder throughput, not direct per-user latency.
