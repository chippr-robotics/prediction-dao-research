# Contract: Notification Entry Types & Message Catalog

**Feature**: 012-wager-notifications

Canonical catalog of entry types, their triggers (canonical-state
transitions), recipient perspective, severity, and message templates.
Templates use: `{desc}` = wager display description (or "Wager #id" /
"Encrypted Wager"), `{counterparty}` = display name or shortened address,
`{amount} {token}` = formatted stake/payout, `{time}` = human-readable
remaining time.

Honest-finality rules (constitution III, FR-011): v2 `declareWinner` and
oracle auto-resolution are final — win/claim copy appears only when truly
claimable. Draw proposals are explicitly provisional.

## State-transition entries (from struct diff)

| EntryType | Trigger (prev → curr canonical state) | Recipient | Severity | Actionable | Template |
|---|---|---|---|---|---|
| `accepted` | `pending → active` (or `pending → resolvable`) | creator | success | no | "{counterparty} accepted '{desc}' — it's live" |
| `accepted` (self) | same, account is opponent | opponent | info | no | "You accepted '{desc}' — it's live" |
| `expired` | `pending → expired` | creator | warning | yes (refund) | "'{desc}' expired without acceptance — reclaim your {amount} {token} stake" |
| `expired` | `pending → expired` | opponent | info | no | "'{desc}' expired before you accepted" |
| `resolvable` | `active → resolvable` | participant who may resolve (per resolutionType: Either→both, Creator→creator, Opponent→opponent) | warning | yes (resolve) | "'{desc}' is ready to resolve — window closes {time}" |
| `resolvable-waiting` | `active → resolvable` | participant who may NOT resolve; oracle types → both, copy adjusted | info | no | "'{desc}' has entered its resolution window" / oracle: "'{desc}' is awaiting oracle resolution" |
| `won-claimable` | `* → resolved-claimable` | winner | success | yes (claim) | "You won '{desc}'! Claim {amount} {token}" |
| `lost` | `* → resolved-lost` | loser | info | no | "'{desc}' resolved — {counterparty} won" |
| `paid-out` | `paid: false → true` (winner) | winner | success | no | "Winnings paid for '{desc}': {amount} {token}" |
| `draw-settled` | `* → draw` | both | info | no | "'{desc}' settled as a draw — stakes returned" |
| `refundable` | `active/resolvable → refundable` | both | warning | yes (refund) | "'{desc}' was not resolved in time — claim your refund" |
| `cancelled` | `* → cancelled` | both | info | no | "'{desc}' was cancelled" |
| `refunded` | `* → refunded` | both | info | no | "'{desc}' was refunded — your stake is back" |
| `state-changed` | any unmapped transition (incl. legacy v1 states `challenged`, `oracle_timed_out`) | both | info | no | "'{desc}' is now {stateLabel}" — factual fallback; never silent |

First-sight rule: a wager with no prior snapshot (fresh storage / new device)
produces **no entries** — only a snapshot. Exception: none. (Action-needed
badges still appear immediately because they derive from live state.)

## Event-scan entries (best-effort)

| EntryType | Trigger | Recipient | Severity | Actionable | Template |
|---|---|---|---|---|---|
| `draw-proposed` | `DrawProposed(wagerId, proposer)`, proposer ≠ account | counterparty | warning | yes (respondDraw) | "{counterparty} proposed settling '{desc}' as a draw — accept or decline" |
| `draw-revoked` | `DrawRevoked(wagerId, proposer)`, proposer ≠ account, prior `draw-proposed` shown | counterparty | info | no | "{counterparty} withdrew their draw proposal on '{desc}'" |

## Deadline-warning entries (time-derived, anti-spam: 1/wager/window/UTC-day)

| EntryType | Trigger | Recipient | Severity | Actionable | Template |
|---|---|---|---|---|---|
| `warn-acceptance` | state `pending`, `acceptanceDeadline − now ≤ 24h` | creator | warning | no | "'{desc}' expires {time} if not accepted" |
| `warn-acceptance` | same | opponent | warning | yes (accept) | "'{desc}' expires {time} — accept before it's gone" |
| `warn-resolution` | state `resolvable`, `resolveDeadlineTime − now ≤ 24h` | participants who may resolve | warning | yes (resolve) | "Resolution window for '{desc}' closes {time}" |

Passed deadlines never produce countdown warnings — the state transition
(`expired` / `refundable`) carries the factual after-the-fact message.

## Toast policy

- Live-poll entries only (no toasts for catch-up batches).
- Toast type = entry severity (`success`/`warning`/`info`; `error` reserved
  for poll-failure notice).
- Max 3 toasts per poll cycle; overflow noted as one summary toast:
  "+N more updates in activity".

## Encrypted wagers

When the wager description is encrypted and not yet decrypted client-side,
`{desc}` falls back to "Encrypted Wager #id" — notifications must not leak or
attempt to decrypt content (decryption stays lazy/user-initiated, as in
MyMarketsModal today).
