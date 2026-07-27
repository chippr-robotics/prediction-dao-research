# Contract: Clearance model (client-side)

> ⚠️ **Superseded pending rework.** Design review found 4 critical and 18 major
> issues in this feature's design — see [review-findings.md](../review-findings.md).
> Several statements in this document are falsified there. Do not implement from it as it stands.


**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

Clearance is the client-side determination of **how much of a receive address's
balance the member may spend**. It is client-side because no on-chain mechanism
can attribute a token deposit to its sender (`research.md` §R1.3) — and the
design says so rather than approximating it.

This document is the behavioural contract for
`frontend/src/lib/receiver/clearance.js` and `attribution.js`. It exists because
the fail-safe direction is easy to reverse by accident, and reversing it is the
one bug this feature cannot ship.

---

## The rule

> **`spendable` is a positive assertion.** Value is spendable only when every
> contributing deposit has been positively established *and* positively cleared.
> Every other outcome — including every failure, every unknown, and every path
> the author did not think about — withholds.

Ported directly from the Bitcoin coin-selection rule
(`frontend/src/lib/bitcoin/coinSelection.js:79-86`), which the platform already
ships and which already survived review for exactly this class of risk.

**Restated as an implementation obligation**: the classifier's default branch
withholds. There is no code path that reaches `spendable` without an explicit
positive verdict for every unit of value it counts.

---

## Inputs

| Input | Source | Failure mode |
|---|---|---|
| `total` | `balanceOf(address)` / `getBalance(address)` | read failure ⇒ **entire balance withheld** `read-failed`; **never rendered as zero** (FR-016) |
| `deposits[]` | `Transfer` logs filtered by recipient (tokens only) | missing deploy block, provider range cap, or RPC error ⇒ `scan-incomplete` |
| `screening(addr)` | `useAddressScreening` with `{ force: true }` against the on-chain guard | `restricted` ⇒ `sanctioned-depositor`; anything else non-clear ⇒ `indeterminate-depositor`; guard unreadable ⇒ `screening-unavailable` |
| `availability` | `lib/receiver/availability.js` | `not-deployed` / `screening-not-configured` short-circuits |

**Screening must be forced.** The default screening path serves cached results
up to `SCREENING_TTL_MS` (60s) old (`frontend/src/lib/addressBook/constants.js:28`).
A cached result can predate a deny-list change, so clearance passes
`{ force: true }` — the seam documented at
`frontend/src/hooks/useAddressScreening.js:50-53`.

---

## Algorithm

```
classify(address, asset, total, deposits, availability) -> AssetClearance

1. if total read failed
     -> withheld[ all, 'read-failed' ]; spendable = 0; RETURN

2. if total == 0
     -> spendable = 0, withheld = []; RETURN

3. if availability is 'not-deployed'
     -> withheld[ total, 'screening-not-configured' ]; RETURN
     (segregation still shown; nothing is claimed as screened)

4. if asset is NATIVE
     -> withheld[ total, 'unattributable' ]; RETURN
     (no log records a plain native transfer's sender — research.md §R1.3)

5. if the log scan did not cover the full range
     -> withheld[ total, 'scan-incomplete' ]; RETURN
     (a partial scan must never produce a partial clearance)

6. accounted = Σ deposits[].amount
   if accounted < total
     -> unaccounted = total - accounted
        withheld[ unaccounted, 'unattributable' ]
     (force-sent value, an unscanned deposit, or a direct balance write)

7. for each deposit:
     screening = screen(deposit.from, { force: true })
       'clear'          -> spendable += amount
       'restricted'     -> withheld[ amount, 'sanctioned-depositor', from ]
       'unavailable'    -> withheld[ amount, 'screening-unavailable' ]
       anything else    -> withheld[ amount, 'indeterminate-depositor' ]

8. ASSERT spendable + Σ withheld.amount == total
     violation -> withheld[ total, 'read-failed' ]; spendable = 0
     (an indecomposable balance is fully withheld, never partly guessed)
```

**Step 8 is not defensive decoration.** It is the invariant that makes the
displayed decomposition trustworthy, and it must be a hard assertion in code and
a test case — not a comment.

---

## Withhold reasons

Every withheld portion carries exactly one. The set is closed; adding a case
means adding a reason, never reusing an approximate one.

| Reason | Member-facing meaning | Recoverable by |
|---|---|---|
| `sanctioned-depositor` | A payer failed screening | nothing — this is the feature working |
| `indeterminate-depositor` | A payer's status could not be determined | retrying later |
| `unattributable` | The sender could not be established | nothing on-chain; the member may know out-of-band |
| `screening-unavailable` | The guard is deployed but unreadable right now | retrying later |
| `screening-not-configured` | No guard on this network | switching to a network that has one |
| `scan-incomplete` | Deposit history could not be fully read | retrying, or a better RPC endpoint |
| `read-failed` | A balance or log read failed | retrying |

### Wording rules (FR-028, FR-029)

- `screening-unavailable` and `scan-incomplete` MUST NOT be worded as though the
  payer is sanctioned. *"We couldn't complete the check"* — never *"this payer is
  blocked."*
- `screening-not-configured` MUST NOT be worded as a clearance. It means no
  on-chain screening exists here at all.
- `unattributable` MUST NOT imply wrongdoing. Native coin is *always*
  unattributable; that is a property of the chain, not of the payer.
- A withheld amount MUST never be described with a word that suggests the member
  has lost it. It is theirs, in their own address, not spendable through this
  feature's cleared path.

---

## Aggregation

Address-level and section-level totals aggregate the per-asset objects and keep
the same decomposition. A section total MUST NOT present a single spendable
figure without its withheld counterpart (FR-015).

Cross-network aggregation is **forbidden** (FR-035): balances on different
networks cannot be swept together, so summing them would imply an action that
does not exist.

---

## Freshness

Clearance is **never persisted**. It is recomputed on every evaluation from
current chain data and current screening results, so a deny-list update takes
effect immediately and a previously-spendable balance can become withheld.

There is deliberately no cached verdict — a stored "cleared" flag is exactly the
stale-authorization bug this feature exists to prevent.

---

## Interaction with sweeping

The sweep consumes `spendable`, never `total`:

- The amount submitted is the spendable amount at the moment of confirmation,
  recomputed — not the amount rendered when the screen opened.
- If clearance changed between render and confirm, the member is told before
  signing rather than silently sweeping a different amount (FR-023 and the
  balance-changed edge case).
- Withheld value is never included, and when the sweep moves less than the
  address holds, the confirm step says so and why (FR-023).

---

## Required test cases

Each of these is a distinct branch and each must be covered:

1. All depositors clear ⇒ `spendable == total`, `withheld` empty.
2. One depositor restricted ⇒ exactly that amount withheld, reason
   `sanctioned-depositor`, remainder spendable.
3. Depositor indeterminate ⇒ withheld, **not** cleared.
4. Guard unreadable ⇒ `screening-unavailable`, and the wording is distinct from
   `sanctioned-depositor`.
5. Native asset ⇒ fully withheld `unattributable`, regardless of any screening
   result available for other assets at the same address.
6. Log scan short of the full range ⇒ fully withheld `scan-incomplete`, **not**
   partially cleared from the logs that were read.
7. `accounted < total` ⇒ the difference withheld `unattributable`, the accounted
   cleared portion still spendable.
8. Balance read fails ⇒ `read-failed`, and the UI shows a failure — asserted to
   **not** render as `0`.
9. Decomposition invariant violated (inject an inconsistency) ⇒ everything
   withheld, nothing spendable.
10. No guard on the network ⇒ `screening-not-configured`, addresses and balances
    still listed, nothing claimed as screened.
11. Screening is called with `{ force: true }` — assert the flag, since a cached
    result silently passing is invisible in the output.
12. Clearance recomputes after a deny-list change without any cache clear.
