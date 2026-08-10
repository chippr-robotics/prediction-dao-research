# Quickstart: Validating Bridge & Supply Liquidity (spec 067)

Runnable checks that prove the feature works end to end. Ordered so the safety-critical properties are
verified first — the two that can strand member funds if wrong come before any UI work is exercised.

## Prerequisites

```bash
npm install
cp .env.example .env        # set RPC URLs for all five mainnets:
                            # MAINNET, POLYGON, ARBITRUM, BASE, OPTIMISM
npm run compile
```

Fork tests need RPC endpoints for all five mainnets. **The browser's RPCs and the fork tests' RPCs are
not interchangeable**: the app only makes plain reads, which `publicnode` serves everywhere, but
hardhat's fork engine additionally needs state methods that the `publicnode` **L2** endpoints answer
with HTTP 403. These keyless endpoints were verified by actually forking each chain (2026-07-25):

```
MAINNET_RPC_URL=https://ethereum-rpc.publicnode.com
POLYGON_RPC_URL=<keyed archive endpoint preferred>
OPTIMISM_RPC_URL=https://mainnet.optimism.io
BASE_RPC_URL=https://mainnet.base.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
```

Known-bad for forking: any `*-rpc.publicnode.com` **L2** endpoint (403), `eth.llamarpc.com` (521), and
`1rpc.io/*` — that last one hard-crashes hardhat's native fork engine with a Rust panic rather than
returning a catchable error. Keyless endpoints are rate-limited and serve recent state only; that is
enough for this suite (it forks at head) but a keyed archive endpoint is required to pin a fork block.

Never put a private key in `.env` for these — fork tests impersonate accounts.

---

## 1. Safety gates (run these first; they block merge)

### 1a. The refund address — the one that can silently strand funds

```bash
npx hardhat test test/fork/bridgeRouter.fork.test.js --grep "MEMBER as depositor"
```

**Expected**: one test runs and passes — the real SpokePool's own deposit event records the **member**
as `depositor`, not the router. That is what makes an unfilled deposit refund to the member, and it is
why the router deliberately has no rescue function.

> **Check the count, not just the exit code.** `--grep` with no match exits **0** reporting
> "0 passing", so a stale pattern here reads as a green merge gate that asserted nothing. If you see
> 0 passing, the gate did not run.
>
> A direct expired-deposit test is not reproducible on a fork: an Across refund needs an off-chain
> dataworker to propose a root bundle, a dispute window to elapse, and a merkle-proved refund leaf —
> staging that would mostly test Across. The `depositor` assertion against the real contract's event
> encoding is the reproducible form of the same guarantee. See the note at
> `test/fork/bridgeRouter.fork.test.js:17-26`.
>
> This test needs `POLYGON_RPC_URL` (or the configured fork endpoint). **Without it the test SKIPS,
> and a skip is not a pass.**

### 1b. Position custody — the member owns the position, always

```bash
npx hardhat test test/fork/liquidityRouter.fork.test.js --grep "OWNED BY THE MEMBER|exit WITHOUT the router|never involved"
```

**Expected**: after `mintFullRangeWithFee` the Uniswap position NFT is owned by the member; the member
can `decreaseLiquidity` + `collect` **while the router is paused and the pool is retired**. Also asserts
the Across `HubPool` round trip never involves the router.

### 1c. No residual custody

```bash
npx hardhat test test/bridge/BridgeRouter.test.js test/liquidity/LiquidityRouter.test.js \
  --grep "residue|balance|allowance|ResidualFunds"
```

**Expected**: both routers hold zero token balance and leave zero allowance after every call.

> `hardhat test` takes FILES, not directories — passing `test/bridge` crashes with
> `MODULE_NOT_FOUND`. And as in 1a, confirm the passing count is non-zero.

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

**Address sanity gate** (research R4b — Uniswap addresses are NOT identical across chains):

```bash
npx hardhat run scripts/ops/verify-protocol-addresses.js --network base
# asserts every configured SpokePool / NFPM / factory has non-empty bytecode on THIS chain
```

Run it per network before seeding routes and pools. A copied canonical address on Base points at a
non-contract at best and something unrelated at worst.

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

### Manual walkthrough — Earn → Supply

7. Open **Earn**. **Expected**: **Supply** is a live, selectable area; no tile reads "Bridges", and
   no Earn area is named "Pool" (that word stays with Wager Pools).
8. Open Supply. **Expected**: both kinds listed with network badges — Uniswap pools on **all five**
   mainnets, Across bridge pools on **Ethereum only** (the HubPool is L1-only; copy must not imply
   bridge liquidity is available everywhere).
9. Start a Uniswap supply. **Expected**: the impermanent-loss disclosure is **visible inline**, not
   behind a tooltip, and confirm stays disabled until it has been shown (FR-018).
10. Start an Across bridge-LP supply. **Expected**: the rebalancing/inventory disclosure appears, and
    **no fee line at all** — this path is fee-free by design (research R3).
11. Withdraw from a position. **Expected**: no platform fee, position updates or closes.

### Network coverage checks

12. **All routes present.** Open the Bridge tab on each of Ethereum, Polygon, Arbitrum, Base, and
    Optimism. **Expected**: every other mainnet appears as a destination — 20 directed routes per
    supported asset (SC-017), with none silently missing.
13. **New networks are first-class** (SC-019). For Arbitrum, Base, and Optimism: each is selectable in
    the network switcher, its balances appear in the portfolio, and send/receive works. A member must
    never be able to bridge to a network where the asset then becomes invisible or unspendable.
14. **Swap and LP both live on all five** (SC-018). On Ethereum, confirm **both** Uniswap supply and the
    Trade surface / portfolio asset-sheet Swap action now work — this supersedes spec 048. Then confirm
    the two capabilities are independently flagged: forcing `capabilities.liquidity` off on one network
    leaves swapping there working, and vice versa.

### Cross-network selection checks

14d. **No chain switching** (SC-020). With the app's active network set to Polygon, open Bridge, Supply,
    and Trade. **Expected**: each asset selector lists holdings across **all five** networks with the
    nested asset+network logo. Select an asset on Arbitrum and complete the flow — the network switch
    happens at signing, disclosed, and the network switcher is never needed.
14e. **Pair pinning** (SC-021). In Supply, pick the first asset of a Uniswap pair. **Expected**: its
    network is pinned and visibly shown, and the second list contains **only** that network's assets.
    Change the first asset to a different network: the second selection is revalidated and cleared, not
    left forming an impossible pair.
14f. **Bridge is the inverse** (SC-021, research R11b). In Bridge, pick the source asset. **Expected**:
    the destination list offers **the same asset on other networks only** — never the same network. This
    is the check that catches the same-network rule being copy-pasted onto the bridge, which would
    silently reduce it to a same-chain transfer that still quotes and still signs.
14g. **Search** (SC-022). Type a partial symbol, asset name, and network name into the selector.
    **Expected**: the list narrows for each, is operable by keyboard alone, and a matched-but-ineligible
    asset still shows its disabled reason rather than vanishing.
14h. **Empty counterpart** (FR-065). Pin an asset with no valid counterpart on its network. **Expected**:
    a plain statement of why and what would change it — never an empty dropdown.
14i. **Shared component regression.** Open home Pay, Request, Wager, and wallet Transfer. **Expected**:
    all four still work and have gained the same search field — `UniversalAssetSelect` is shared.

### Honest-degradation checks

```bash
VITE_RELAY_GATEWAY_URL= npm run frontend      # gateway unset
```

15. **Expected**: the Bridge surface hides or states unavailability — it never shows an invented quote
    (FR-054). Any **already in-flight** bridge still resolves via the on-chain fallback (FR-053). The
    Supply area is unaffected.
16. Switch to ETC/Mordor. **Expected**: Bridge absent; Supply states honestly that supplying is
    unavailable here and names where it is (FR-025).
17. Switch to a Bitcoin network. **Expected**: no Bridge tab; Bitcoin send/receive unaffected; no
    Bitcoin network id reaches `getContractAddressForChain` (FR-006).

---

## 5. Auxiliary wiring

18. After one bridge and one pool supply, open the activity ledger.
    **Expected**: the bridge is **one** entry naming both networks and both transactions — not two
    (FR-035); the pool entry is class `liquidity`, clearly distinct from any wager-pool activity.
19. Open the activity feed with both wager-pool and liquidity activity present.
    **Expected**: wager-pool entries now tag **"Wager Pool"**, liquidity entries tag "Liquidity". This
    is the FR-039 check — before this change both would have read "Pool".
20. Open notification settings. **Expected**: **Bridge** and **Liquidity** appear as their own
    categories with independently settable delivery, defaulting to delivered (FR-038).
21. Generate a report covering the period. **Expected**: the bridge appears with only its platform fee
    as a cost — not as income and not as a disposal (FR-036).
22. Screen a deny-listed wallet at both surfaces. **Expected**: refused before any signature (FR-031).

---

## 6. Admin control panel

```bash
npm run frontend    # sign in as an operator holding LIQUIDITY_ADMIN_ROLE
```

23. **Expected**: **Bridge** and **Supply** tabs appear under a **Liquidity** group.
24. Disable a route. **Expected**: it stops being offered in the member app within one refresh, with no
    redeploy (FR-041).
25. Retire a pool that has a member position. **Expected**: closed to new deposits, still visible and
    withdrawable, position count shown (FR-024).
26. Pause on the Supply tab. **Expected**: the control is labelled **"Pauses new Uniswap supplies"** —
    bridge-LP deposits do not pass through the router and the tab must not imply otherwise.
27. Check the History section. **Expected**: every action above appears with before → after, operator,
    and time (FR-046).
28. Sign in as an operator with none of the roles. **Expected**: neither tab is visible, and direct URL
    access is refused (FR-049).

---

## 7. Content deliverables

```bash
ls docs/blog/features/*bridge* docs/blog/posts/*cross-chain* docs/blog/knowledge/*bridges*
```

**Expected**: each of the three series has a new numbered entry with its index table updated and
internal links resolving (FR-055 – FR-057). Cross-check every fee, risk, timing, and availability claim
against the R8 matrix and the zero-rate launch state — a post implying **bridge liquidity is available
on more than Ethereum**, or implying a platform fee where the rate ships at zero, fails FR-058.

---

## Reference

- Design rationale and the three design-changing findings: [research.md](./research.md)
- Entity and state-machine detail: [data-model.md](./data-model.md)
- Contract surfaces: [contracts/bridge-router.md](./contracts/bridge-router.md),
  [contracts/liquidity-router.md](./contracts/liquidity-router.md)
- Fee and admin wiring: [contracts/fee-integration.md](./contracts/fee-integration.md),
  [contracts/admin-and-runtime.md](./contracts/admin-and-runtime.md)
