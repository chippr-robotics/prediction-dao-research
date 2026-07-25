# Quickstart: Validating Bridge & Pool Liquidity (spec 067)

Runnable checks that prove the feature works end to end. Ordered so the safety-critical properties are
verified first — the two that can strand member funds if wrong come before any UI work is exercised.

## Prerequisites

```bash
npm install
cp .env.example .env        # set MAINNET_RPC_URL and POLYGON_RPC_URL for fork tests
npm run compile
```

Fork tests need archive-capable RPC endpoints for Ethereum (1) and Polygon (137). Never put a private
key in `.env` for these — fork tests impersonate accounts.

---

## 1. Safety gates (run these first; they block merge)

### 1a. The refund address — the one that can silently strand funds

```bash
npx hardhat test test/fork/bridgeRouter.fork.test.js --grep "expiry refund"
```

**Expected**: an expired deposit refunds to the **member's** address; the `BridgeRouter` balance is zero
throughout. A happy-path fill passes whether or not `depositor` is set correctly, so this case is the
only signal — if it is skipped or quarantined, the merge is not safe.

### 1b. Position custody — the member owns the position, always

```bash
npx hardhat test test/fork/liquidityRouter.fork.test.js --grep "NFT owner|exit without router"
```

**Expected**: after `mintFullRangeWithFee` the Uniswap position NFT is owned by the member; the member
can `decreaseLiquidity` + `collect` **while the router is paused and the pool is retired**. Also asserts
the Across `HubPool` round trip never involves the router.

### 1c. No residual custody

```bash
npx hardhat test test/bridge test/liquidity --grep "balance|allowance"
```

**Expected**: both routers hold zero token balance and leave zero allowance after every call.

---

## 2. Contract suite

```bash
npm run compile
npm test                        # unit — includes test/bridge + test/liquidity
npm run test:fork               # full fork suite
npm run check:storage-layout    # must cover bridgeRouter + liquidityRouter
```

**Expected**: all green; storage-layout reports both new routers as registered and append-only.

Static analysis and fuzzing (CI-gating, constitution I):

```bash
npm run slither                 # no new high/critical
npx medusa fuzz                 # stateful paths on both routers
```

---

## 3. Local deploy + wiring

```bash
npx hardhat node                                                  # terminal 1
npx hardhat run scripts/deploy/deploy-bridge-liquidity.js --network localhost
npm run sync:frontend-contracts
```

**Expected**: `deployments/localhost-*.json` gains `bridgeRouter`, `bridgeRouterImpl`,
`liquidityRouter`, `liquidityRouterImpl`; both fee services registered at cap 250 bps / rate 0; frontend
artifacts regenerate with the new addresses and ABIs.

Verify the fee services registered:

```bash
npx hardhat run scripts/ops/print-fee-services.js --network localhost
# expect bridge.transfer and liquidity.deposit, capBps 250, feeBps 0
```

---

## 4. Frontend

```bash
npm run test:frontend           # Vitest — includes vitest-axe on all new components
npm run frontend                # dev server
```

### Manual walkthrough — Transfer → Bridge

1. Open the nav drawer. **Expected**: the section reads **Transfer**, not "Pay & Transfer".
2. Navigate to the old `/wallet?tab=paytransfer` link directly. **Expected**: it still resolves (FR-002)
   — the tab id is unchanged and only the label moved.
3. Open the **Bridge** tab on Polygon, pick USDC → Ethereum, enter an amount.
   **Expected**: three itemized cost lines, the amount received, and an arrival estimate. With both fee
   rates at 0, **no platform-fee line appears at all** (FR-029) — not a line reading `0.00`.
4. Leave the quote sitting past its validity window. **Expected**: marked stale, confirm disabled until
   refreshed (FR-008).
5. Submit. **Expected**: the state advances submitted → source-confirmed → in flight, and is **not**
   shown as complete anywhere until the destination delivers (FR-009).
6. **Close the tab entirely and reopen.** **Expected**: the in-flight bridge is still there with its
   true status (FR-010) — this is the check that catches state living only in React.

### Manual walkthrough — Earn → Pool

7. Open **Earn**. **Expected**: **Pool** is a live, selectable area; no tile reads "Bridges".
8. Open Pool. **Expected**: both kinds listed with network badges — Uniswap pools on Polygon, Across
   pools on Ethereum (the R8 asymmetry is real; copy must not imply either is available everywhere).
9. Start a Uniswap supply. **Expected**: the impermanent-loss disclosure is **visible inline**, not
   behind a tooltip, and confirm stays disabled until it has been shown (FR-018).
10. Start an Across bridge-LP supply. **Expected**: the rebalancing/inventory disclosure appears, and
    **no fee line at all** — this path is fee-free by design (research R3).
11. Withdraw from a position. **Expected**: no platform fee, position updates or closes.

### Honest-degradation checks

```bash
VITE_RELAY_GATEWAY_URL= npm run frontend      # gateway unset
```

12. **Expected**: the Bridge surface hides or states unavailability — it never shows an invented quote
    (FR-054). Any **already in-flight** bridge still resolves via the on-chain fallback (FR-053). The
    Pool area is unaffected.
13. Switch to ETC/Mordor. **Expected**: Bridge absent; Pool states honestly that pooling is unavailable
    here and names where it is (FR-025).
14. Switch to a Bitcoin network. **Expected**: no Bridge tab; Bitcoin send/receive unaffected; no
    Bitcoin network id reaches `getContractAddressForChain` (FR-006).

---

## 5. Auxiliary wiring

15. After one bridge and one pool supply, open the activity ledger.
    **Expected**: the bridge is **one** entry naming both networks and both transactions — not two
    (FR-035); the pool entry is class `liquidity`, clearly distinct from any wager-pool activity.
16. Open the activity feed with both wager-pool and liquidity activity present.
    **Expected**: wager-pool entries now tag **"Wager Pool"**, liquidity entries tag "Liquidity". This
    is the FR-039 check — before this change both would have read "Pool".
17. Open notification settings. **Expected**: **Bridge** and **Liquidity** appear as their own
    categories with independently settable delivery, defaulting to delivered (FR-038).
18. Generate a report covering the period. **Expected**: the bridge appears with only its platform fee
    as a cost — not as income and not as a disposal (FR-036).
19. Screen a deny-listed wallet at both surfaces. **Expected**: refused before any signature (FR-031).

---

## 6. Admin control panel

```bash
npm run frontend    # sign in as an operator holding LIQUIDITY_ADMIN_ROLE
```

20. **Expected**: **Bridge** and **Pool** tabs appear under a **Liquidity** group.
21. Disable a route. **Expected**: it stops being offered in the member app within one refresh, with no
    redeploy (FR-041).
22. Retire a pool that has a member position. **Expected**: closed to new deposits, still visible and
    withdrawable, position count shown (FR-024).
23. Pause on the Pool tab. **Expected**: the control is labelled **"Pauses new Uniswap supplies"** —
    bridge-LP deposits do not pass through the router and the tab must not imply otherwise.
24. Check the History section. **Expected**: every action above appears with before → after, operator,
    and time (FR-046).
25. Sign in as an operator with none of the roles. **Expected**: neither tab is visible, and direct URL
    access is refused (FR-049).

---

## 7. Content deliverables

```bash
ls docs/blog/features/*bridge* docs/blog/posts/*cross-chain* docs/blog/knowledge/*bridges*
```

**Expected**: each of the three series has a new numbered entry with its index table updated and
internal links resolving (FR-055 – FR-057). Cross-check every fee, risk, timing, and availability claim
against the R8 matrix and the zero-rate launch state — a post promising Uniswap pools on Ethereum, or
implying a platform fee that ships at zero, fails FR-058.

---

## Reference

- Design rationale and the three design-changing findings: [research.md](./research.md)
- Entity and state-machine detail: [data-model.md](./data-model.md)
- Contract surfaces: [contracts/bridge-router.md](./contracts/bridge-router.md),
  [contracts/liquidity-router.md](./contracts/liquidity-router.md)
- Fee and admin wiring: [contracts/fee-integration.md](./contracts/fee-integration.md),
  [contracts/admin-and-runtime.md](./contracts/admin-and-runtime.md)
