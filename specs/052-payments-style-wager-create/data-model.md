# Phase 1 Data Model: Payments-Style Wager Create Sheets

This is a frontend presentation feature — there is no persistence or on-chain schema.
The "data model" here is the **UI state** the redesign introduces/reshapes and the
values that flow to the (unchanged) submit hooks.

---

## Entity: Amount entry state (owned by each create sheet)

The canonical stake value stays in the sheet's existing state; `AmountKeypad` is a
controlled view over it.

| Field | Type | Owner | Notes |
|-------|------|-------|-------|
| `value` | string | sheet (`stake` / `stakeAmount` / `buyIn`) | Canonical decimal string, e.g. `"10.00"`. Empty string ⇒ zero state. |
| `prefix` | string | sheet → keypad prop | Currency symbol shown before the hero figure. `"$"` for USDC-locked sheets; token-driven for #3. |
| `token` | node/string | sheet → keypad prop | Compact token indicator near the hero (e.g. `USDC`). #3 keeps its own `<select>`. |

**Validation rules (format, enforced by keypad — FR-007)**
- At most one decimal separator.
- At most two fractional digits (cents).
- Only digits and one `.` accepted; other keystrokes are no-ops.
- Backspace removes the right-most character; empty ⇒ zero state (`$0`).

**Validation rules (business, unchanged, owned by sheet — FR-011)**
- Positive amount required to enable submit (`Number(value) > 0`).
- Surface #3 only: `min 0.1 / max 1000`, token-symbol messaging (in `validateForm`).
- Existing balance/allowance checks fire on submit (in the submit hook).

**State transitions (amount string)**
```
""  --digit d-->            "d"
S   --digit d (no '.', <int cap)--> S+d
S   --digit d (has '.', <2 frac)-> S+d
S   --"." (no '.' present)-->      S+"."
S   --"." (already has '.')-->     S            (no-op)
S   --backspace-->                 S without last char   (may reach "")
S   --extra digit past 2 frac-->   S            (no-op)
```

## Entity: Wager memo (description)

| Field | Type | Owner | Notes |
|-------|------|-------|-------|
| `description` | string | sheet | Demoted to a secondary memo field beneath the hero (FR-009). Value flows unchanged (trimmed) to the submit hook. |

Surface notes: #1 and #3 have free-text `description`; #2's description is auto-composed
from the selected market/side (no free-text memo — the market card + side picker is the
context under the hero); #4 (pools) has no description today and none is added.

## Entity: Details region (unchanged values, repositioned)

Grouped below the hero + memo; no change to the values submitted.

| Field | Type | Surfaces | Notes |
|-------|------|----------|-------|
| `resolutionType` | enum/string | #1, #3 | Either / ThirdParty / oracle types — via `PillSelect` / tabs / dropdown. |
| `arbitrator` (+resolved) | address | #1, #3 | Shown only on the third-party path; keeps AddressInput + address-book + QR. |
| oracle `market` / `side` | object / index | #2, #3 | Polymarket market + YES/NO side. |
| `acceptBy` / `resolveBy` (join/resolve) | datetime | #1, #3, #4 | Via `DeadlineTimeline`; #2 timeline is derived/read-only. |
| `oddsMultiplier` | number | #3 | Offer-type leverage; unchanged. |
| `maxMembers`, `thresholdPct` | number / bips | #4 | Pool size + approval threshold; unchanged. |

## Output (unchanged submit contracts)

The redesign does not change what is submitted; the same objects reach the same hooks:

- **#1 / #2** → `useOpenChallengeCreate().createOpenChallenge({ description, stake,
  resolutionType, arbitrator?, acceptDeadline, resolveDeadline, ...oracle })`.
- **#3** → `useFriendMarketCreation().createFriendMarket(submitData)` (or injected
  `onCreate`).
- **#4** → `usePools().createPool({ buyIn, maxMembers, thresholdPct, acceptDeadline,
  resolveDeadline })`.

`stake` / `stakeAmount` / `buyIn` equal the hero value at submit time (SC-004, FR-008).
Claim-code generation and encrypted metadata outcomes are unchanged (FR-012).
