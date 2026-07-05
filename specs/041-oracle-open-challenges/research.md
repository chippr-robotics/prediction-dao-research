# Research & Decisions: Oracle-Settled Open Challenges (Polymarket)

**Feature**: 041 | **Date**: 2026-07-05 | **Spec**: [spec.md](./spec.md)

Phase 0 findings from code exploration. All spec assumptions verified against the
codebase; no NEEDS CLARIFICATION items remained after the spec phase.

## D1 — No contract changes; prove the path with tests instead

**Decision**: Ship with zero Solidity edits. Add a contract-level JS integration suite
(`test/integration/oracle/WagerRegistry_PolymarketOpenChallenge.test.js`) covering the
open + Polymarket lifecycle.

**Rationale**: `createOpenWager` already validates oracle linkage at creation via
`_checkOracleLinkage` (`contracts/wagers/WagerRegistryCore.sol:217-230`): for
`ResolutionType.Polymarket` it requires a non-zero `oracleConditionId`
(`PolymarketRequired`), a configured adapter (`AdapterNotSet`), and an **unresolved**
condition (`ConditionAlreadyResolved` — this is FR-008's create-time re-validation,
enforced on-chain, not just in the app). It stores `creatorIsYes` and
`polymarketConditionId` (`WagerRegistry.sol:287,289`) and emits `PolymarketLinked`
(`:306`). Post-accept, `autoResolveFromPolymarket`
(`contracts/wagers/WagerRegistryIntents.sol:226-245`) reads only wager state
(`status`, `resolutionType`, `polymarketConditionId`, `creatorIsYes` via
`_settleOracleWin`, `WagerRegistryCore.sol:559-567`) — it has no open-vs-named branch,
so an accepted open challenge resolves identically to a named-opponent oracle wager
(FR-017). However, **no existing test creates an open wager with an oracle type**
(`test/WagerRegistry.openChallenge.test.js` covers Either/ThirdParty only;
`test/integration/oracle/WagerRegistry_Polymarket.test.js` uses `createWager`), and the
constitution treats oracle-resolution paths as highest-risk — so the new usage pattern
gets dedicated lifecycle tests before the UI ships it.

**Alternatives considered**: Adding a contract-side "market schedule" validation
(accept deadline ≤ market end) — rejected: the chain cannot know Polymarket schedules;
the derivation is a UX concern (D3), and the existing deadline bounds
(`_checkDeadlines`, `WagerRegistryCore.sol:207-212`) already cap windows.

## D2 — New `OracleOpenChallengeModal`, shared `ClaimCodeResultPanel` extraction

**Decision**: Build the section as a new modal component that composes the existing
`PolymarketBrowser` (`variant="inline"`) + a side picker + stake + derived-timeline
summary, and extract the post-create claim-code result experience (code display, copy,
QR, take-challenge deep link, vault backup) out of `OpenChallengeModal.jsx` into a
shared `ClaimCodeResultPanel` used by both modals.

**Rationale**: The user asked for a **new section**, and the two create forms diverge
fundamentally: user-defined challenges are description-driven with a hand-edited
`DeadlineTimeline`; oracle challenges are market-driven with a derived, read-only
timeline (spec: "the event defines the timelines"). Forcing both into one modal would
bury the exciting picker-first flow behind mode switches. The code-result screen,
however, is identical by spec (FR-010 — reuse claim-code machinery unchanged), so it is
extracted once rather than duplicated. `OpenChallengeModal`'s user-defined behavior is
untouched (FR-018), verified by its existing tests.

**Alternatives considered**: (a) Adding oracle tabs to `OpenChallengeModal` à la
`FriendMarketsModal` — rejected: FriendMarketsModal's tab complexity is what makes it
hard to keep "fast and fun"; (b) duplicating the result UI — rejected: two drift-prone
copies of security-relevant UX (code shown once, backup prompts).

## D3 — Event-derived timeline: rules and bounds

**Decision**: New pure helper `deriveOracleChallengeTimeline(marketEndIso, nowMs)` in
`frontend/src/lib/openChallenge/oracleTimeline.js`:

- `MIN_LEAD_MS = 1 hour` — markets ending sooner are **ineligible** (not selectable),
  matching the existing oracle wager flow's "at least 1 hour from now" floor.
- `acceptDeadline = min(marketEnd, now + ACCEPT_CAP)` with `ACCEPT_CAP = 30 days − 1 hour`
  (safety margin under the contract's `MAX_ACCEPT_WINDOW = 30 days`,
  `WagerRegistryCore.sol:46`, so the tx can't straddle the bound while pending).
  When capped, the UI states the challenge closes for takers before the event ends.
- `resolveDeadline = min(marketEnd + SETTLE_BUFFER, now + RESOLVE_CAP)` with
  `SETTLE_BUFFER = 7 days` (time for Polymarket's resolution + anyone to call
  `autoResolveFromPolymarket`) and `RESOLVE_CAP = 180 days − 1 hour` (under
  `MAX_RESOLVE_WINDOW = 180 days`, `WagerRegistryCore.sol:47`). Invariant
  `resolveDeadline > acceptDeadline` is guaranteed by construction
  (`marketEnd ≥ acceptDeadline` and buffer > 0; when both are capped the caps preserve
  the gap).
- Returns `{ eligible, reason, acceptDeadlineMs, resolveDeadlineMs, acceptCapped }` so
  the UI can render the derived timeline and per-market ineligibility honestly.

**Rationale**: Spec FR-007 ("takeable until the event closes, capped") and FR-003
(minimum lead). Accepting right up to market close is intentionally different from the
1v1 flow's `getMidpointAcceptanceDeadline` (`wagerDefaults.js:269-276`): an open
challenge's whole point is maximum time for a code-holder to take it. Late acceptance
close to event end is equal-stakes and both-sides-symmetric, and D8 blocks accepting a
market that already shows a public outcome.

**Alternatives considered**: Midpoint acceptance (1v1 parity) — rejected: shrinks the
sharing window for no symmetry benefit; creator-editable deadlines — rejected by the
user's framing ("the event defines the timelines") and spec Assumptions.

## D4 — Terms bundle gains a sealed `oracle` block; on-chain fields stay authoritative

**Decision**: Extend the code-keyed sealed payload built in `useOpenChallengeCreate`
(today exactly `{ description, createdAt }`, `useOpenChallengeCreate.js:69-73`) with an
optional block:

```json
{
  "description": "…auto-composed, human-readable…",
  "createdAt": "<ISO>",
  "oracle": {
    "source": "polymarket",
    "conditionId": "0x…",
    "question": "…",
    "outcomes": ["Yes", "No"],
    "creatorSide": 0,
    "endDate": "<ISO>",
    "slug": "…"
  }
}
```

The claimant view treats on-chain `wager.resolutionType` / `wager.polymarketConditionId`
/ `wager.creatorIsYes` as **authoritative** and uses the sealed `oracle` block only for
human-readable display (question, outcome labels). If
`terms.oracle.conditionId !== wager.polymarketConditionId`, the view flags the stored
description as not matching the on-chain linkage instead of trusting it. The
`description` field is auto-composed (market question + creator's side) so even a
legacy/plain reader of the terms sees a meaningful sentence.

**Rationale**: FR-012/FR-014 require the claimant to understand the bet even when the
Gamma API is down — the question and outcome labels must therefore be stored with the
challenge, and the code-keyed envelope is the existing place confidential terms live
(FR-010: reuse machinery; envelope format `encryptEnvelopeCode` is shape-agnostic).
Constitution III (honest state) dictates the chain-vs-bundle precedence and the mismatch
flag. Backward compatible: old bundles simply lack `oracle`, and user-defined challenges
continue to seal `{ description, createdAt }`.

**Alternatives considered**: Fetch-only market display (no sealed metadata) — rejected:
violates FR-014's degraded state; plaintext market metadata in `metadataUri` — rejected:
would leak which market a code-gated challenge references, weakening the spec-024
indistinguishability property (FR-008 of 024).

## D5 — Live market context via a new `usePolymarketMarket(conditionId)` hook

**Decision**: Add a small hook that fetches one market by condition id from the Gamma
API (`GET {gammaBase}/markets?condition_ids=<id>`), normalizes it with the existing
`normaliseGammaMarket` (exported from `usePolymarketSearch.js`), and returns
`{ market, isLoading, error, refresh }`. Used by `TakeChallengePanel` (claimant) and the
create-flow review step (price display parity).

**Rationale**: No single-market-by-conditionId fetch exists today (search/browse only).
The claimant holds only on-chain fields + sealed metadata; live odds/status (FR-014,
US2-3) need a direct lookup. Reusing `normaliseGammaMarket` keeps one market shape
(`outcomes: [{name, price}]`, `endDate`, `closed`, `active`) everywhere. Errors degrade
to the sealed-metadata view with the disclosed "live market info unavailable" notice —
never a blocking spinner.

**Alternatives considered**: Reusing `usePolymarketSearch` with the question text —
rejected: ambiguous matches, wasteful; subgraph indexing of market state — rejected:
Gamma is already the app's market-data source and the subgraph doesn't index Polymarket.

## D6 — Side semantics: outcome index 0 = YES = `creatorIsYes: true`

**Decision**: The side picker renders both outcome labels from
`market.outcomes[].name` (fallback Yes/No) with current prices; the chosen index maps to
the contract exactly as the 1v1 flow does: index 0 → `creatorIsYes = true`, index 1 →
`false` (`FriendMarketsModal.jsx:963-972`). The claimant is always shown **their** side:
`outcomes[creatorIsYes ? 1 : 0]`.

**Rationale**: Matches `PolymarketOracleAdapter` outcome ordering already relied on by
the named-opponent flow and by `_settleOracleWin`
(`winner = outcome == creatorIsYes ? creator : opponent`,
`WagerRegistryCore.sol:560`). One convention, no translation layer.

**Alternatives considered**: Storing outcome names on-chain — impossible without
contract changes; free-side text — rejected, binary markets only (spec Assumptions).

## D7 — Entry point + gating

**Decision**: New quick-access card id `oracle-open-challenge` in
`constants/quickAccessCards.js`, a card in Dashboard's `createActions`, a
`handleQuickAction` case opening the new modal, gated on the `polymarketSidebets`
capability (`useChainTokens().capabilities`) with the same locked/unavailable treatment
the oracle 1v1 card uses; `PolymarketBrowser` additionally self-gates (returns null on
unsupported chains). The section also respects `isOracleModelExposed(Polymarket)`
(`VITE_ORACLE_MODELS`, default `polymarket-only`).

**Rationale**: FR-001/FR-004; identical gating semantics to the existing oracle flow
means no new capability plumbing. The Polymarket dashboard feed's
`handlePolymarketCardClick` continues to open the 1v1 flow (unchanged scope); a
follow-up could offer a choice, but YAGNI for v1.

## D8 — Closed/resolved market at claim time: warn, and block when outcome is public

**Decision**: In the claimant view, when live data is reachable: if the linked market is
`closed` (or past `endDate`) show a prominent warning; if it already reports a resolved
outcome (adapter/Gamma shows a winner), **disable accept in the app** with an
explanation. When live data is unreachable, show the derived schedule + the degraded
notice and keep accept enabled (per FR-014) — the accept deadline itself (≤ market end,
D3) is the primary guard.

**Rationale**: FR-015 and US2-5. The contract cannot re-check the oracle at accept
(acceptOpenWager is resolution-type agnostic — `useOpenChallengeAccept.js:126-196`
mirrors this), so this is deliberately an app-level honesty measure, documented as such.
Blocking only on a *public, positively known* outcome avoids false lockouts from stale
data; the derived accept deadline already makes the window small.

**Alternatives considered**: Contract-level accept guard querying the adapter —
rejected: contract change, gas cost, and Amoy/Polygon adapter timing quirks for a
window the deadline already bounds.

## D9 — Test strategy

**Decision**:
- **Contract (Hardhat, new file)** `test/integration/oracle/WagerRegistry_PolymarketOpenChallenge.test.js`,
  modeled on `WagerRegistry_Polymarket.test.js` fixtures (`MockPolymarketCTF` →
  `PolymarketOracleAdapter` → `deployWagerRegistry` with adapter as 3rd init arg):
  create-open-with-Polymarket happy path (event `PolymarketLinked`), code-based accept,
  `autoResolveFromPolymarket` YES-win / NO-win / tie→draw / unresolved-revert, payout
  claim, expiry refund of an untaken oracle challenge, and creation reverts:
  zero conditionId (`PolymarketRequired`), resolved condition
  (`ConditionAlreadyResolved`), self-resolution types still barred.
- **Frontend (Vitest)**: unit tests for `deriveOracleChallengeTimeline` (caps, buffer,
  ineligibility, invariants) and the terms `oracle` block build/verify; component tests
  for `OracleOpenChallengeModal` (picker→side→stake→derived timeline→create args:
  `resolutionType=4`, conditionId, creatorIsYes, sealed oracle block),
  `TakeChallengePanel` oracle summary (live / degraded / closed / resolved / mismatch
  states, Polymarket named in all), `ClaimCodeResultPanel` extraction (OpenChallengeModal
  tests still green), `usePolymarketMarket`, and Dashboard card gating.

**Rationale**: Constitution II; SC-006/SC-007 (equivalence + zero regression) map
directly onto the contract equivalence tests and the untouched existing suites.
