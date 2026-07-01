# Phase 1 Data Model: Unified Phrase Lookup

This is a frontend feature; the "data model" is the set of **client-side view models and state
machines** the feature introduces. No on-chain storage or subgraph schema changes (FR-014). All
persistent data is read from existing sources: on-chain (ethers), subgraph (`Wager`, `Pool`,
`PoolJoin`), and device-local (`localStorage` code vault + language pref).

## Entities / View Models

### PhraseInput
The normalized user input that drives a lookup.
- `raw: string` — as typed.
- `normalized: string` — NFKC, lowercased, whitespace-collapsed, hyphens→spaces (reuse
  `normalizeCode` for the English/challenge path; `phraseToIndices` normalizes for pools).
- `words: string[]` — split tokens; MUST be exactly 4 to attempt lookup (else `format-error`).
- `lang: string` — from `getWordListLang()` (default `'en'`); selects the pool word list.
- **Validation**: word count ≠ 4, or a token not in the relevant word list → `format-error`
  surfaced **before** any network call (FR-008, spec AS1.5).

### LookupResult (discriminated union — the core state machine)
Output of `resolvePhraseLookup(phraseInput)`. Exactly one variant:

| Variant | Meaning | UI |
|---------|---------|----|
| `format-error` | Input isn't four valid words | Inline "what a valid phrase looks like" (no lookup) |
| `challenge` | Unique open-challenge match | Render take-a-challenge panel (payload: `ChallengeMatch`) |
| `pool` | Unique pool match | Render join-a-pool panel (payload: `PoolMatch`) |
| `collision` | Both a challenge and a pool matched | Render chooser → user picks which to open (FR-006) |
| `not-actionable` | Matched but not joinable/takeable (challenge accepted/expired/cancelled; pool full/closed/past join window) | Show item + explanatory state, not "not found" (FR-011) |
| `self` | Item the user created/joined | Route to management/detail view (FR-012) |
| `none` | **Both** sources completed and neither matched | Single "no match found" + retry (FR-007) |
| `lookup-failed` | At least one source errored and nothing matched | Retryable "couldn't check right now" (FR-025) — never shown as "no match" |

**Source outcome (internal)** — each of the two lookups reduces to one of:
`matched | not-found | errored`. Reduction table (see research.md D3):
- both `not-found` → `none`
- any `errored` & none `matched` → `lookup-failed`
- one `matched` (+ other not-found/errored) → that type (`challenge`/`pool`), possibly
  `not-actionable`/`self` after status/ownership check
- both `matched` → `collision`

### ChallengeMatch (payload)
From `useOpenChallengeAccept.discover` (`useOpenChallengeAccept.js:30-175`):
- `wagerId: bigint`
- `wager: WagerStruct` (creator, stakes, resolver type, deadlines, `status`)
- `terms: { description?, question?, name? }` and `termsUnavailable: boolean`
- `needsMembership: boolean` (advisory; contract authoritative at accept)
- Derived: `actionable` (status open & unaccepted & not expired), `isSelf` (creator == account).

### PoolMatch (payload)
From `usePools.resolvePhrase(...).summary` (`usePools.js:162-172`):
- `address, poolId, state (0..3)+stateLabel, buyIn(+formatted), token(+symbol)`
- `memberCount, maxMembers, slotsRemaining, thresholdBips/Pct, joinDeadline`
- `isCreator, hasJoined, refundEligible, withinResolutionWindow`
- Derived: `actionable` (state JoiningOpen & slots remaining & before deadline & !hasJoined),
  `isSelf` (`isCreator || hasJoined`).

### MyWagersItem (unified list entry — FR-015/016/024)
- `type: 'wager' | 'challenge' | 'pool'`
- `id: string` — on-chain id/address (dedup key with `type`)
- `title/description` — decrypted or type-appropriate label
- `status` — per-type lifecycle status, mapped to a shared active/history grouping
- `bucket: 'active' | 'history'` — terminal statuses → history (FR-017)
- `source: 'subgraph' | 'context' | 'device'` — provenance (drives device-scoped note)
- `route` — where selecting it navigates (wager detail / take/resolve / pool page) (FR-018)

**Sources & keys** (see contracts/my-wagers-aggregation.md): wagers ← `FriendMarketsContext`;
created challenges ← subgraph `Wager(creator=account,status=open)`; device challenges ←
`useOpenChallengeCodeVault.recoverCodes()`; created pools ← subgraph `Pool(creator=account)`;
joined pools ← `Pool`+`PoolJoin` reconciled with `usePools.getMemberCommitments`. Union then
de-dup by (`type`,`id`); prefer richer `subgraph`/`context` source over `device` on conflict.

### RecoveryCodesVault (relocated, unchanged storage — FR-020–023)
Backed by `useOpenChallengeCodeVault` (`useOpenChallengeCodeVault.js:21-78`):
- `canUse: boolean`, `hasBackup: boolean`, `busy: boolean`
- `recoverCodes(): Promise<Array<{ code, wagerId?, description?, savedAt? }>>` (unlock via one
  signature, cached per component lifetime)
- `forgetCode(code)`, `saveCode(entry)` — unchanged
- Relocated to the Security tab; storage location/keying identical (no migration).

## State Transitions (lookup flow)

```
idle ──submit──▶ validating
validating ──(≠4 words / bad word)──▶ format-error ──edit──▶ idle
validating ──(ok)──▶ resolving  (challenge? + pool? concurrently, no signature)
resolving ──▶ classify(source outcomes):
    ├─ challenge / pool ─▶ actionable? ─┬─ yes ─▶ show take/join panel ──action(signs)──▶ done
    │                                   └─ no  ─▶ not-actionable | self (explain / route)
    ├─ collision ─▶ chooser ─▶ (challenge|pool) panel
    ├─ none ─▶ no-match (retry)
    └─ lookup-failed ─▶ couldnt-check (retry)   ◀── never conflated with none (FR-025)
```

## Validation Rules (traceability)

| Rule | Source |
|------|--------|
| Exactly 4 valid words before any lookup | FR-008; AS1.5 |
| Normalize case/space/hyphen/Unicode to canonical | FR-008; AS1.4 |
| No signature for lookup/preview | FR-010 |
| Honor pool language; don't reject valid non-English pool phrase | FR-009 |
| Collision → present both, never auto-pick | FR-006 |
| Not-actionable → explain, not "not found" | FR-011 |
| Self-owned → route to management | FR-012 |
| Error ≠ empty (couldn't-check vs no-match) | FR-007, FR-025 |
| My Wagers hybrid source; graceful when a type is empty | FR-024, FR-019 |
| Recovery codes reachable in Security; prior codes intact; unlock preserved | FR-020–023 |
