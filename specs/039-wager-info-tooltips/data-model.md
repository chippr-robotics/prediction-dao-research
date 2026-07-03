# Data Model: Wager View Info Tooltips

**Feature**: 039-wager-info-tooltips | **Date**: 2026-07-03

No persisted or on-chain data. The "model" is (1) the shared component's
state, and (2) the inventory of explainer content items being relocated.

## Entity: InfoTip (shared component instance)

| Field | Type | Notes |
|---|---|---|
| `label` | string (required) | Accessible name for the trigger, e.g. `About: Stake`. Also used for the bubble's announcement context. |
| `children` | ReactNode (required) | Bubble content. Evaluated at render, so state-dependent copy naturally shows the current variant when opened (FR-009). |
| `className` | string (optional) | Extra classes on the wrapper for per-view placement tweaks. |
| `open` | internal boolean state | Never controlled by hosts; resets to closed on unmount. |
| instance id | internal unique id | Used by the `fairwins:infotip-open` coordination event (research R4). |

**State transitions**: `closed → open` (trigger click / Enter / Space; dispatches
coordination event) · `open → closed` (trigger re-click, outside `mousedown`,
Escape with focus return, another instance opening, unmount).

**Validation rules**: at most one instance open per document (FR-004); bubble
box must fit the viewport after the clamp effect runs (FR-008).

## Entity: Explainer content item (relocation inventory)

Each row is a static text block currently rendered inline. Disposition per the
research R2 rubric: **MOVE** → behind an `InfoTip`; **STAY** → remains inline.
Line numbers are as of branch point (indicative, not contractual).

### OpenChallengeModal.jsx

| Current location | Text (abbrev.) | Disposition |
|---|---|---|
| `:300` intro `<p>` | "An open challenge has no named opponent… Silver membership or above." | MOVE — icon beside the modal's first field label (view-level intro) |
| `:312` | "Phrase it so it's clear which side you're on…" | MOVE — beside "What's the wager?" |
| `:336` | "Enter the amount in USD. Only USDC is supported…" | MOVE — beside "Stake — each side" |
| `:350` | "Single-party self-resolution isn't available for open challenges…" | MOVE — beside "How is it resolved?" |
| `:275` | Key-backup explanation (two variants via `canBackup`) | MOVE — state-dependent (FR-009) |
| `:286` | Four-word-code brute-force warning | STAY — security warning (R2) |
| `:377` `role="alert"` | "Pick an acceptance time in the future…" | STAY — validation |
| `:382` `role="status"` | progress message | STAY — dynamic status |
| `:448` | "The arbitrator can read and resolve this challenge…" | MOVE — beside arbitrator field |
| milestone `hint` `:141`/`:154` | "After this, the challenge can no longer be taken…" / "The outcome must be submitted before this time." | MOVE — via `DeadlineTimeline` (see below) |

### FriendMarketsModal.jsx

| Current location | Text (abbrev.) | Disposition |
|---|---|---|
| `:1171` | oracle `lockedReason` / availability text | STAY — dynamic gating |
| `:1251`, `:1266` | "Browse top markets by category…" (two variants) | MOVE |
| `:1322` | "The oracle will return a YES or NO outcome…" | MOVE |
| `:1359` | "Pick which outcome you're taking…" | MOVE |
| `:1383` | "Your opponent will be taking **X**…" | STAY — computed side confirmation |
| `:1413` | "Phrase this so it's clear which side you're on…" | MOVE |
| `:1504` | stake amount guidance (per-token variants) | MOVE — state-dependent (FR-009) |
| `:1533` | "Enter a valid ERC-20 token address" | MOVE (adjacent `fm-error` STAYS) |
| `:1550` | `RESOLUTION_TYPE_HINTS[type]` | MOVE — state-dependent (FR-009) |
| `:1589` | "A neutral third party who decides the outcome…" | MOVE |
| `:1658` | odds explanation bound to chosen multiplier | STAY — computed summary |
| `:1767` | "End-to-end encrypted. Only participants can decrypt…" | STAY — encryption honesty (R2, spec 038 indicator) |
| timeline milestone hints | accept/resolve explanations | MOVE — via `DeadlineTimeline` |

### GroupPoolModal.jsx

| Current location | Text (abbrev.) | Disposition |
|---|---|---|
| `:235` intro | "Everyone pays the same buy-in into one pot…" | MOVE |
| `:215` | "Anyone you give the words to can join…" | MOVE |
| `:261` | "Enter the amount in USD. Only USDC is supported for group pools…" | MOVE |
| `:270` | "Joining closes automatically once the pool fills." | MOVE |
| `:280` | `{chosen.detail}` + refund fallback sentence | MOVE — state-dependent (FR-009) |
| `:298` `role="alert"` | "Pick a join time in the future…" | STAY — validation |
| timeline milestone hints | join/resolve explanations | MOVE — via `DeadlineTimeline` |

### TakeChallengePanel.jsx

| Current location | Text (abbrev.) | Disposition |
|---|---|---|
| `:88` | "Accepting binds you as the opponent and escrows your equal stake…" (+ `oc-steps` list stays as the actionable step tracker) | MOVE (the `<p>` only) |
| `:94` `role="status"` | progress message | STAY |
| `:96` | "Save your code to re-read the terms later." | MOVE |

### UnifiedLookupModal.jsx

| Current location | Text (abbrev.) | Disposition |
|---|---|---|
| `:80` | "Those four words match both a challenge and a pool…" | STAY — flow-critical disambiguation prompt |
| `:98` | already-participant status (two variants) | STAY — dynamic status |
| `:161` | "We'll find whatever the words point to…" | MOVE |

### OpenChallengeDecryptModal.jsx

| Current location | Text (abbrev.) | Disposition |
|---|---|---|
| `:83` | "This is an open challenge — its terms are locked to the four-word code…" | MOVE |

### OracleConditionPicker.jsx

| Current location | Text (abbrev.) | Disposition |
|---|---|---|
| `:93` | `KIND_HELP[kind]` | MOVE — state-dependent (FR-009) |

### DeadlineTimeline.jsx (shared)

| Current location | Text | Disposition |
|---|---|---|
| `:175-177` | renders every milestone's `hint` as an inline `.dt-hint` span | CHANGE — render each milestone's hint as an `InfoTip` in that milestone's tile head (next to `tileHead` text) instead of inline spans; `hint` prop shape on the milestone object is unchanged, so hosts only lose the inline text |

The computed duration line ("Open 2 days 0h for a taker · then up to
7 days 0h to settle") is **not** a milestone hint and STAYS inline.

## Relationships

- Every MOVE row becomes: an `InfoTip` instance adjacent to the named
  label/control, with the existing string as `children` (wording unchanged per
  spec assumption).
- `ScreeningInfoButton` → becomes a wrapper around `InfoTip` (content-rich
  variant), keeping its public API and CSS class hooks so spec 021 tests and
  call sites are untouched.
