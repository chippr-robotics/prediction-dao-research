# Phase 0 Research: Unified Phrase Lookup

All decisions below are grounded in the current codebase (paths cited). No open
`NEEDS CLARIFICATION` remain — the four `/speckit-clarify` answers resolved the
scope-level unknowns; this document resolves the remaining implementation choices.

## D1 — How to resolve a phrase to challenge vs pool

**Decision**: A pure resolver module `lib/lookup/resolvePhraseLookup.js` runs the two existing
lookups **concurrently** and reduces them to one `LookupResult` (see data-model.md). It calls
`useOpenChallengeAccept.discover(code)` and `usePools.resolvePhrase(phrase, lang)` via
`Promise.allSettled`, then maps.

**Rationale**:
- Concurrency keeps a single-type match no slower than today's dedicated flow (SC-007).
- Both lookups are read-only and need no signature (FR-010): `discover` derives a claim address
  and calls `registry.openWagerIdForClaim` (`useOpenChallengeAccept.js:30-175`); `resolvePhrase`
  converts words→indices and calls the factory (`usePools.js:162-172`) — neither signs.
- Reuses shipped, tested lookup code; the new module only orchestrates + classifies.

**Alternatives considered**: Sequential (challenge then pool) — rejected: adds latency and biases
toward one type. A new on-chain "type registry" — rejected: violates "no on-chain change" (FR-014)
and Out of Scope.

## D2 — Language handling (challenge = English only, pool = selected language)

**Decision**: Read the device language once via `getWordListLang()`
(`utils/wordListLanguage.js`, key `fairwins_wordlist_lang_v1`). Always call pool
`resolvePhrase(phrase, lang)`. Attempt the **challenge** lookup only when the phrase is a valid
**English** BIP-39 four-word code (`utils/claimCode/wordlist.js` `isValidCode` / `normalizeCode`);
when `lang !== 'en'` or the words aren't valid English, skip the challenge lookup (a non-English
phrase can only be a pool — spec Edge Case "Language mismatch").

**Rationale**: Matches the two systems as-built — challenge derivation is English-only
(`deriveFromCode`), pool indices are language-parameterized (`phraseToIndices(phrase, lang)`).
Prevents a legitimate non-English pool phrase from being reported invalid (FR-009).

**Alternatives**: Try challenge lookup in all languages — rejected: challenge codes have no
non-English derivation; wasted calls and false "invalid" risk.

## D3 — Distinguishing "no match" from "couldn't check" (FR-025)

**Decision**: Classify each source's outcome into `matched | not-found | errored`, then:
- both `not-found` → **none** ("no match found").
- any `errored` and no `matched` → **lookup-failed** ("couldn't check right now — retry").
- exactly one `matched` → that type. Both `matched` → **collision**.

Mapping per source:
- **Pool**: `resolvePhrase` already returns structured `{ notFound: true, reason: 'invalid'|'unknown' }`
  for not-found and **throws** only on signer/network errors (`usePools.js:162-172`) → `not-found`
  vs `errored` is clean.
- **Challenge**: `discover` currently signals not-found by **throwing** a specific string
  ("No open challenge matches that code…") and throws different strings for real errors
  (`useOpenChallengeAccept.js`). **Refactor `discover`** (or add a sibling `lookup`) to return a
  structured result `{ status: 'matched'|'not-found'|'errored', ... }` instead of string-matching.
  This is the one existing-hook change required and is covered by tests.

**Rationale**: String-matching error messages is brittle and would silently break FR-025 if copy
changes. A structured discriminator is testable and stable.

**Alternatives**: Keep string matching in the resolver — rejected (fragile, i18n-hostile).

## D4 — Unified entry point & what happens to the old surfaces (Q3)

**Decision**: New `UnifiedLookupModal.jsx` opened from a new Dashboard quick action
(`id: 'enter-phrase'`, in `utilityActions`). Remove the `join-pool` quick action and the
`GroupPoolModal` "Join a pool" tab; remove the `OpenChallengeModal` "Take a challenge" tab — both
modals become **create-only**. The unified modal shows a phrase input → on resolve, renders the
existing take-challenge or join-pool panel (extract the current `TakerPanel`/`JoinPanel` bodies
into shared presentational components so behavior is preserved verbatim).

**Rationale**: Matches Q3 (standalone entry, create-only surfaces) and FR-001/FR-001a; reuses the
Dashboard quick-action + modal-mount pattern (`Dashboard.jsx:45-74, 551-592, 724-745`).

## D5 — Deep-link routing (FR-013)

**Decision**: Keep `parseTakeChallengeParams` (`utils/claimCode/deepLink.js`); in the
`Dashboard.jsx:541-549` effect, route a parsed `?oc=take&code=` into the **UnifiedLookupModal**
(prefill phrase + auto-resolve) instead of `OpenChallengeModal`'s taker tab. Existing shared links
keep working, now landing in the unified flow.

**Rationale**: One-line redirect of an existing handler; preserves all shared links (FR-013, SC-006).

## D6 — My Wagers enumeration (hybrid — Q1 / FR-024)

**Decision**: `lib/lookup/myWagersAggregation.js` unions and de-duplicates:
- **Wagers**: existing `FriendMarketsContext`/`useFriendMarkets` (already powering `MyMarketsModal`).
- **Open challenges (created)**: subgraph `Wager` where `creator == account` and `status == 'open'`
  with zero opponent (`schema.graphql:41-71`; `wagerRegistry.ts:96-127`). Accepted ones already
  surface via the wager path (`status == 'active'`).
- **Open challenges (device)**: `useOpenChallengeCodeVault.recoverCodes()` entries for codes saved
  on this device (covers created-but-unaccepted challenges not otherwise attributable). Device-scoped
  by design.
- **Pools (created)**: subgraph `Pool` where `creator == account` (`schema.graphql:244-272`).
- **Pools (joined)**: subgraph `Pool` + `PoolJoin`, reconciled with the user's own identity
  commitment via `usePools.getMemberCommitments`/`getMyNickname` (the subgraph deliberately does
  **not** store wallet→commitment, per pool privacy). Joined pools are effectively device/identity-derived.

De-dup by stable key (`type` + on-chain id/address). Each item carries `{ type, id, status,
route }` (see contracts/my-wagers-aggregation.md).

**Rationale**: Exactly the Q1 hybrid; uses entities and hooks that already exist — **no subgraph
schema change** for MVP. Accepts that some items (device-vault challenges, identity-derived pool
membership) are device-scoped, which the spec explicitly allows (FR-024).

**Alternatives**: Add a per-user on-chain/subgraph membership index — rejected: schema+mapping work
and a privacy tradeoff, Out of Scope; deferred to a future feature.

## D7 — Relocating recovery codes to Security (Q4 / FR-020–023)

**Decision**: Extract the `RecoverPanel` body from `OpenChallengeModal.jsx:510-594` into a
reusable `components/account/RecoveryCodesPanel.jsx` backed by the unchanged
`useOpenChallengeCodeVault` (unlock → `recoverCodes()` → list/copy). Mount it as a new subsection
in the `WalletPage.jsx` Security tab (`:399-449`). **Remove** the "Recover codes" tab from
`OpenChallengeModal` entirely (Q4 — no redirect left behind).

**Rationale**: Vault storage/keying is unchanged (same `localStorage`, same signature-derived key),
so previously saved codes remain accessible with no migration (FR-022); the unlock step is
preserved (FR-023). Extraction keeps one implementation (DRY) and satisfies Constitution IV/V
(tests + a11y on the moved panel).

## D8 — Testing & accessibility approach

**Decision**: Vitest unit tests for `resolvePhraseLookup` (all `LookupResult` branches incl.
collision, lookup-failed, not-actionable, language-mismatch), `myWagersAggregation` (union/dedup,
empty states), and the deep-link redirect; component tests for `UnifiedLookupModal` and
`RecoveryCodesPanel`. Accessibility: labeled phrase input, `role`/focus management on results and
errors, meets WCAG 2.1 AA (Constitution V; existing axe/Lighthouse CI).

**Rationale**: Directly maps to acceptance scenarios and SC-003/SC-006; keeps behavior parity for
the extracted take/join/recover panels.
