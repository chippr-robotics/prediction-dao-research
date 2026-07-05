# Data Model: Oracle-Settled Open Challenges (Polymarket)

**Feature**: 041 | **Date**: 2026-07-05 | **Plan**: [plan.md](./plan.md)

No new on-chain state and no new persisted stores. This feature composes existing
on-chain wager fields with one extended off-chain sealed payload and a handful of
client-side view models.

## On-chain (existing fields, newly exercised — read-only for this feature)

**Wager** (`WagerRegistry.getWager`, fields already in the deployed struct/ABI):

| Field | Type | Use in this feature |
|---|---|---|
| `resolutionType` | enum (4 = Polymarket) | Discriminates an oracle open challenge in the claimant view |
| `polymarketConditionId` | bytes32 | Authoritative market linkage; key for live lookup; cross-check vs sealed metadata |
| `creatorIsYes` | bool | Authoritative side assignment; claimant side = opposite |
| `creatorStake` / `opponentStake` | uint128 | Equal stakes; drives stake + payout display |
| `acceptDeadline` / `resolveDeadline` | uint64 | Derived timeline (already displayed) |
| `metadataUri` / `metadataHash` | string / bytes32 | Code-keyed sealed terms envelope reference (spec 024, unchanged mechanics) |

Constraints enforced on-chain at creation (existing): non-zero conditionId, adapter
configured, condition unresolved, deadlines within `MAX_ACCEPT_WINDOW` (30d) /
`MAX_RESOLVE_WINDOW` (180d), equal stakes, Silver+ creator, no self-resolution types.

## Sealed terms payload (extended — code-keyed envelope, IPFS)

`SealedOpenChallengeTerms` — plaintext sealed by `encryptEnvelopeCode` (spec 024
envelope format unchanged; this only extends the JSON inside):

| Field | Type | Rules |
|---|---|---|
| `description` | string | Auto-composed for oracle challenges: market question + creator's side (human-readable standalone) |
| `createdAt` | ISO string | Now populated at creation |
| `oracle` | object \| absent | Present only for oracle-settled challenges |
| `oracle.source` | `"polymarket"` | Settlement source label key |
| `oracle.conditionId` | hex string | MUST equal on-chain `polymarketConditionId`; claimant view flags mismatch and does not trust the bundle |
| `oracle.question` | string | Market question for offline display |
| `oracle.outcomes` | string[2] | Outcome labels, index-aligned with adapter ordering (0 = YES side) |
| `oracle.creatorSide` | 0 \| 1 | Creator's outcome index; MUST agree with on-chain `creatorIsYes` (0 ⇄ true) |
| `oracle.endDate` | ISO string | Market's scheduled end (timeline provenance display) |
| `oracle.slug` | string | Polymarket slug (deep link to the public market page) |

Backward compatibility: bundles without `oracle` render exactly as today
(user-defined challenges, pre-041 challenges).

## Client-side view models (in-memory only)

**LinkedMarket** — normalized Gamma market (existing `normaliseGammaMarket` shape,
now also produced by `usePolymarketMarket(conditionId)`):
`{ id, slug, question, label, description, conditionId, endDate, volume, liquidity,
active, closed, image, outcomes: [{ name, price }] }`

**DerivedTimeline** — output of `deriveOracleChallengeTimeline(marketEndIso, nowMs)`:

| Field | Type | Rules |
|---|---|---|
| `eligible` | boolean | false when market end < now + 1h (MIN_LEAD) or unparseable |
| `reason` | string \| null | Ineligibility explanation for UI |
| `acceptDeadlineMs` | number | `min(marketEnd, now + 30d − 1h)`; always > now when eligible |
| `resolveDeadlineMs` | number | `min(marketEnd + 7d, now + 180d − 1h)`; always > acceptDeadlineMs |
| `acceptCapped` | boolean | true when the 30-day cap shortened the accept window (UI discloses) |

**OracleChallengeDraft** — create-modal state:
`{ market: LinkedMarket, side: 0|1, stake: string, timeline: DerivedTimeline }` →
submitted to `useOpenChallengeCreate` as
`{ description (auto), stake, resolutionType: 4, oracleConditionId: market.conditionId,
creatorIsYes: side === 0, acceptDeadline, resolveDeadline, oracleMeta (sealed block) }`.

**ClaimantOracleSummary** — derived in `TakeChallengePanel` for `resolutionType === 4`:

| Field | Source | Notes |
|---|---|---|
| `question`, `outcomes`, `slug` | sealed `terms.oracle` (verified) → live market fallback | Either source may be missing; view renders best available and discloses |
| `takerSide` / `creatorSide` labels | on-chain `creatorIsYes` + outcome labels | On-chain bool is authoritative |
| `stake`, `payout` | on-chain `opponentStake` (payout = 2× stake) | Formatted in token units |
| `live` | `usePolymarketMarket` | `{ market, isLoading, error }`; drives odds/status row |
| `integrity` | comparison | `'ok' \| 'mismatch' \| 'unverifiable'` (no sealed oracle block) |
| `acceptGate` | live + deadlines | `'open' \| 'warn-closed' \| 'blocked-resolved'` (D8) |

## State transitions

No new ones. The wager lifecycle is unchanged from spec 024 / existing oracle wagers:
Open → (accept) Active → (autoResolveFromPolymarket) Resolved/Draw → claimed; or
Open → cancelled/expired → refund. This feature only changes *how a wager enters*
Open (with oracle linkage) and *what code-holders see*.
