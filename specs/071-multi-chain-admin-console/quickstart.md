# Quickstart: validating spec 071

**Feature**: `specs/071-multi-chain-admin-console/` | **Date**: 2026-07-27

How to prove the feature works. Read [`contracts/`](./contracts/) for the rules being validated and
[`data-model.md`](./data-model.md) for the shapes; this file is the run guide.

## Prerequisites

```bash
cd frontend
npm ci
```

An account is needed for the manual scenarios:

- **For membership (US1, US5)**: an account holding an active `WAGER_PARTICIPANT` membership on the
  reference chain (Polygon on a mainnet build).
- **For operator scenarios (US2, US3, US4)**: an account holding an operator role on **exactly one**
  chain — the interesting case is proving it works from a *different* chain.

## Automated checks

```bash
# Whole frontend suite
npm run test:frontend

# The suites this feature adds to or depends on
npx vitest run src/test/admin/                    # per-view conversions
npx vitest run src/test/chainResolutionGuard.test.js
npx vitest run src/test/lib/chains/               # estate helper + read-result unit tests

# Must stay green untouched — the two already-converted views prove the
# re-export did not disturb the reference implementation
npx vitest run src/test/admin/AdminBridgeTab.test.jsx src/test/admin/AdminSupplyTab.test.jsx

npm run lint
```

**Expected**: all green. The Bridge and Supply suites (27 + 28 tests) must pass **without
modification** — if they needed changing, the helper was rewritten rather than moved.

## Manual validation

```bash
npm run frontend
```

### US1 — membership follows the member across networks

1. Connect the membership-holding account. Switch the wallet to **Base**, then **Arbitrum**, then
   **Ethereum**.
2. On each, open a membership-gated surface.

**Expect**: the same tier and expiry every time.
**Fail condition**: any network reports no membership. That is the pre-fix behaviour.

3. Point the reference chain's endpoint at an unreachable host (My Account → Network) and reload.

**Expect**: "membership could not be read" plus a retry.
**Fail condition**: the words "no membership" appear anywhere. `unknown` must never render as
`none` (FR-004).

### US2 — reach the console from the wrong chain

1. With the single-chain operator account, switch the wallet to a chain where it holds **nothing**.
2. Open `/admin`.

**Expect**: the console opens; only that role's views are listed; the permissions card names the
network each role was found on.
**Fail condition**: "Access Restricted".

3. Break one non-reference chain's endpoint and reload.

**Expect**: that chain reported as unread; entry still granted from roles found elsewhere (FR-011).

### US3 — accrued fees across the estate

1. Open **Overview**.

**Expect**: every cohort chain listed as read / not deployed / unreadable. Accrued (undrawn) and
treasury (received) are separate lines — research R6 — never added together.

2. Break one chain's endpoint and reload.

**Expect**: that chain flagged, excluded from totals, and the total labelled **partial** naming what
is missing.
**Fail condition**: the total silently shrinks, or an unreadable chain shows `0`.

### US4 — every view spans the estate

For each converted view, with the wallet on chain **A**:

1. Scope the view to chain **B**.

**Expect**: B's control state. Write controls disabled, saying the write happens on B and the wallet
must switch there — *before* any signature attempt (SC-005).

2. Switch the wallet to B.

**Expect**: the scope **stays on B** (FR-016 — it must not follow the wallet), and write controls
become available only if authority on B's contract is confirmed.

3. Scope to a chain where the contract is not deployed.

**Expect**: an explicit "not deployed on <chain>" — not an empty panel, not zeros.

### US5 — purchases route to the reference chain

1. With the wallet on a non-reference chain, start a membership purchase.

**Expect**: the flow states the purchase settles on the reference chain and offers the switch.

2. Decline the switch.

**Expect**: no purchase on any chain.

3. Complete the purchase, then connect from another network.

**Expect**: the new membership resolves (closes the loop with US1).

## Success criteria mapping

| SC | Validated by |
|---|---|
| SC-001 | US1 steps 1–2 |
| SC-002 | US2 steps 1–2 |
| SC-003 | US3 step 1 |
| SC-004 | US3 step 2; `aggregate` unit tests |
| SC-005 | US4 step 1 |
| SC-006 | US5 steps 1–2 |
| SC-007 | US1 step 3, US3 step 2, US4 step 3 |
| SC-008 | `membershipChainId()` cohort tests; source-level guard |

## The three failure modes to watch for

Everything else is detail. If a reviewer checks only three things:

1. **An unreachable chain rendering as `0` or as nothing.** The whole feature exists to stop unread
   state being read as fact.
2. **A single figure summing balances across chains.** Different chains hold different tokens; one
   number across them is invented.
3. **A write control offered on the strength of an app-wide role flag** rather than the contract on
   the scoped chain. That shows an operator an enabled control that reverts.
