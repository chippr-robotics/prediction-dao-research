# Contract: Unified Phrase Lookup

Module + UI contract for the single "Enter a phrase" surface. Frontend interfaces only.

## Module: `lib/lookup/resolvePhraseLookup.js`

```
resolvePhraseLookup(input: {
  phrase: string,
  lang: string,                 // from getWordListLang()
  account?: string,             // for self/ownership classification
  deps: {
    discoverChallenge(code): Promise<ChallengeOutcome>,   // wraps useOpenChallengeAccept
    resolvePool(phrase, lang): Promise<PoolOutcome>,      // usePools.resolvePhrase
  }
}): Promise<LookupResult>
```

- MUST normalize + validate to exactly 4 words first; invalid → `{ kind: 'format-error' }`
  (no network call).
- MUST run the challenge and pool lookups **concurrently** (`Promise.allSettled`).
- MUST only attempt the challenge lookup when the phrase is a valid **English** BIP-39 code
  (`isValidCode`); skip it when `lang !== 'en'` or words aren't valid English.
- MUST NOT trigger any wallet signature.

### `ChallengeOutcome` / `PoolOutcome` (per-source, internal)
```
{ status: 'matched', payload: ChallengeMatch | PoolMatch }
{ status: 'not-found' }
{ status: 'errored', error: Error }
```

### `LookupResult` (returned)
```
{ kind: 'format-error', message }
{ kind: 'challenge', match: ChallengeMatch, actionable: boolean, isSelf: boolean }
{ kind: 'pool',      match: PoolMatch,      actionable: boolean, isSelf: boolean }
{ kind: 'collision', challenge: ChallengeMatch, pool: PoolMatch }
{ kind: 'not-actionable', type: 'challenge'|'pool', match, reason }
{ kind: 'self', type, match, route }
{ kind: 'none' }            // both sources not-found
{ kind: 'lookup-failed', sources: ('challenge'|'pool')[] }   // ≥1 errored, none matched
```

### Reduction rules (MUST)
- both `not-found` → `none`
- any `errored` && none `matched` → `lookup-failed` (never `none`) — FR-007/FR-025
- one `matched` → `challenge`/`pool`; then classify `actionable`/`not-actionable`/`self`
- both `matched` → `collision`

## Hook: `useUnifiedLookup()`
```
{ state, submit(phrase), reset }
state.status ∈ 'idle'|'validating'|'resolving'|'result'
state.result: LookupResult | null
```
Thin wrapper: reads `getWordListLang()` + `account`, wires deps, exposes state to the modal.

## Existing-hook change (required): `useOpenChallengeAccept`
- Add/adjust a lookup path that returns a **structured** `ChallengeOutcome`
  (`matched|not-found|errored`) instead of signaling not-found by throwing a specific string
  (`useOpenChallengeAccept.js:30-175`). `accept(...)` unchanged. Covered by unit tests.

## UI: `components/fairwins/UnifiedLookupModal.jsx`
- Props: `{ isOpen, onClose, initialPhrase?, autoResolve? }` (deep-link prefill).
- Renders: labeled phrase input + "Find" → on result, one of:
  - `challenge` → extracted **TakeChallengePanel** (verbatim behavior from `OpenChallengeModal` TakerPanel)
  - `pool` → extracted **JoinPoolPanel** (verbatim from `GroupPoolModal` JoinPanel)
  - `collision` → chooser listing both, each opening its panel (FR-006)
  - `not-actionable` / `self` → status message / route (FR-011/FR-012)
  - `none` → "no match found" + retry; `lookup-failed` → "couldn't check right now" + retry (FR-007/025)
- Accessibility: input `<label>`, results in a live region, error `role="alert"`, focus moved to
  result/error; WCAG 2.1 AA.

## Dashboard wiring (`Dashboard.jsx`)
- Add quick action `{ id: 'enter-phrase', category: 'utility', title: 'Enter a phrase', ... }`;
  `handleQuickAction` opens `UnifiedLookupModal`.
- **Remove** the `join-pool` action; `OpenChallengeModal` loses its `taker` tab and `GroupPoolModal`
  loses its `join` tab (create-only) — FR-001a.
- Deep link: the `:541-549` effect routes `parseTakeChallengeParams()` into `UnifiedLookupModal`
  (prefill + `autoResolve`) instead of the open-challenge taker tab — FR-013.

## Acceptance mapping
US1 AS1–5 → `challenge`/`pool`/`none`/normalize/`format-error`; Edge cases → `collision`,
language-mismatch (challenge skipped), `not-actionable`, `self`, deep link, `lookup-failed`.
