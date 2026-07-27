# Phase 0 Research: Polygon membership reference chain + all-chains admin reads

**Feature**: `specs/071-multi-chain-admin-console/` | **Date**: 2026-07-27

Everything below was resolved against the codebase rather than assumed. Two findings changed the
shape of the plan and are called out as such (R2, R6).

---

## R1 — Where the membership reference chain is declared

**Decision**: Add `MEMBERSHIP_REFERENCE_CHAIN_ID` to `frontend/src/config/networks.js`, derived from
the build's environment cohort, and export a `membershipChainId()` accessor. Mainnet cohort →
`MAINNET_CHAIN_ID` (137, Polygon). Testnet cohort → `TESTNET_CHAIN_ID` (80002, Polygon Amoy).

**Rationale**: `networks.js` already declares exactly this pair for the user-facing testnet/mainnet
toggle:

```js
const MAINNET_CHAIN_ID = 137
const TESTNET_CHAIN_ID = 80002
export const TESTNET_MAINNET_PAIR = { testnet: TESTNET_CHAIN_ID, mainnet: MAINNET_CHAIN_ID }
```

The reference chain is the same fact under a different name, so it is derived from the existing
constants rather than declared a second time. A second literal `137` in the codebase is a
divergence waiting to happen.

The cohort is read from the build's primary network — `NETWORKS[PRIMARY_CHAIN_ID].isTestnet` —
which is the mechanism the app already uses to keep testnet and mainnet apart. `isTestnet` is
present on all 11 network entries, so the cohort split is total, with no unclassified network.

**Alternatives rejected**:
- *Hardcode 137 at each membership call site* — six call sites, each free to drift, and no single
  place to change for a testnet build. Also silently reads mainnet membership in a testnet build,
  violating constitution III.
- *Make it operator-configurable at runtime* — membership is a payment destination. A wrong value
  sends a member's USDC to a chain where their membership will never be read. Nothing about this
  wants a runtime switch (spec FR-001, Assumptions).

---

## R2 — The per-chain read helper (and a spec-069 violation to fix while generalizing) ⚠️

**Decision**: Promote `readProviderFor` and the network-roster helper out of
`frontend/src/components/admin/liquidityAdminCommon.js` into a shared module
(`frontend/src/lib/chains/estate.js`), **and fix how it obtains a provider on the way**.

**Finding**: the existing helper hand-builds a provider from the raw network config:

```js
export function readProviderFor(chainId, walletChainId, walletProvider) {
  if (walletProvider && Number(chainId) === Number(walletChainId)) return walletProvider
  const rpcUrl = NETWORKS[chainId]?.rpcUrl          // ← spec 069 forbids exactly this
  return rpcUrl ? makeReadProvider(rpcUrl, chainId) : null
}
```

`CLAUDE.md` (spec 069) states plainly: *"**Never hand-build a provider from
`NETWORKS[chainId].rpcUrl`**: go through `makeReadProvider` / `getReadProvider(chainId)`, or
`getRpcUrlForChain(chainId)`."* The consequence is real, not stylistic — this path bypasses
`resolveRpcEndpoints`, so a member's configured endpoint override and its failover are ignored for
every read the Bridge and Supply tabs make. Today that affects two tabs. Generalizing this helper
to all fifteen views without fixing it would propagate the bug across the whole console.

The shared helper therefore calls `getReadProvider(chainId)` and keeps only the
"reuse the wallet's provider when the scope is the connected chain" optimization.

**Rationale for promoting rather than reimplementing**: `liquidityAdminCommon.js` already documents
the exact rules this feature generalizes — scope is a network not the wallet's network; an
unreadable read is never a zero; authority is read from the contract in scope. Those doc-comments
are the design; moving the code keeps one copy of it.

**Alternatives rejected**:
- *Leave the helper where it is and import it from `components/admin/`* — a `lib/` concern living
  under one feature's component folder; every non-admin consumer would import through it.
- *A React hook only* — some consumers (role sync in `contexts/`, purchase preflight) are not
  components. The primitive is a plain async function; a hook wraps it.

---

## R3 — Which reads must move to the reference chain

**Decision**: Membership resolution moves to the reference chain at the two resolver functions in
`frontend/src/utils/blockchainService.js`, which every membership call site already funnels through:

| Function | Current chain input | Consumers |
|---|---|---|
| `hasRoleOnChain(user, role, chainId)` | wallet chain | `contexts/RoleContext.jsx`, `contexts/WalletContext.jsx` |
| `getUserTierOnChain(user, role, chainId)` | wallet chain | `components/ui/PremiumPurchaseModal.jsx` |

The **membership** branch of each (the `WAGER_PARTICIPANT` / `MembershipManager` path) resolves
against `membershipChainId()`. The **admin-role** branch keeps taking an explicit chain, because
admin roles genuinely are per-chain (R4).

**Rationale**: splitting at the resolver rather than at each caller means the rule is enforced in
one place and cannot be forgotten by a future caller. The two branches already exist inside these
functions as separate code paths — `hasRoleOnChain` branches on the role name before choosing a
contract — so the split follows a seam that is already there.

**Alternatives rejected**:
- *Change every call site* — six sites now, unbounded later, and each is an opportunity to pass the
  wallet chain by habit.
- *Ignore the chain argument entirely* — would silently break the admin-role reads that legitimately
  need a chain.

---

## R4 — Estate-wide console entry vs. per-chain authority

**Decision**: Two distinct resolutions, never conflated.

- **Entry** (`hasAnyRole(ADMIN_ROLES)`): resolved across every chain in the cohort. `RoleContext`
  syncs roles per chain and records *which* chains answered yes, which said no, and which could not
  be read.
- **Authority to write**: resolved per (contract, chain, account) at the point of the control, via
  the existing `readRouterAuthority` shape generalized to any AccessControl contract.

**Rationale**: `liquidityAdminCommon.js` already documents why these cannot be one value, from a
real defect: `isGuardian` means "guardian on the WagerRegistry", and treating it as authority showed
operators an enabled killswitch that reverts. The same doc records the converse failure — an
unreadable authority read must **not** withdraw a control, because an operator who does hold it
concludes there isn't one. Both rules carry forward unchanged; this feature only widens the entry
question.

**Current entry behaviour to preserve**: role state is cached in local storage keyed by
`(address, chainId)` and synced from chain. The sync loop gains a chain dimension; the cache key
already has one, so no storage migration is required — a per-chain entry simply exists for more
chains than before.

---

## R5 — The spec-008 chain-resolution guard still passes, but its stated intent must be amended

**Finding**: `frontend/src/test/chainResolutionGuard.test.js` enforces spec 008 FR-011: user-facing
code must resolve addresses and providers *chain-aware* rather than build-time-bound. It fails a
file that adds a new `getContractAddress(name)` or argless `getProvider()`.

Reference-chain resolution uses `getContractAddressForChain(name, membershipChainId())` — chain-aware,
just with an explicit chain instead of the wallet's — so **the guard passes unmodified**.

**Decision**: the guard's doc-comment says the requirement is the *"wallet's CONNECTED chain"*. That
sentence becomes untrue for the membership path, so it is amended to state the rule the code
actually follows: resolve against an **explicit** chain — the wallet's for wallet-scoped state, the
reference chain for membership, the scoped chain for operator views — never the build-time default.
The mechanical check is unchanged; only the reason it exists is restated correctly.

**Rationale**: a guard whose comment describes a rule the code deliberately breaks trains the next
reader to distrust the guard.

---

## R6 — What "accrued fees" actually means per chain ⚠️

**Finding**: there is exactly **one** undrawn fee balance in the system, and it is not where the
phrase "all chains for accrued fees" first suggests.

- `MembershipManager.accruedFees()` — undrawn membership tier fees, withdrawable via
  `withdrawFees(amount, to)`. **This is the only accruing balance.** Deployed on Polygon (137),
  Amoy (80002), Mordor (63), Hardhat (1337) — and on **no other mainnet**.
- `FeeRouter` (spec 060) — deployed on many more chains, but it **holds nothing**. `FeeRouter.sol`
  forwards the fee to the treasury inside the same transaction (`depositToVaultWithFee`: fee →
  treasury, net → vault, atomic). There is no accrual to read, by design.

**Decision**: the fee overview reports two clearly distinguished things per chain:

1. **Accrued (undrawn)** — `MembershipManager.accruedFees()`, only where a MembershipManager is
   deployed; elsewhere the chain reads *not deployed*, not zero.
2. **Treasury balance** — the configured treasury's payment-token balance on each chain carrying a
   `FeeRouter`, labelled as *received*, not *accrued*.

They are never added together: one is a liability the platform still owes itself, the other is money
already delivered.

**Rationale**: on the mainnet cohort, "accrued fees across all chains" would otherwise be a
single-chain figure dressed up as an estate-wide one — the exact dishonesty FR-023 exists to
prevent. Naming the second source is what makes the sentence true.

**Units**: the payment token differs per chain (Polygon USDC `0x3c49…`, Mordor Classic USD
`0xDE09…`). Cross-chain summing is refused by FR-022. Within the mainnet cohort the accrued figure
is single-chain anyway, so the per-unit rule costs nothing today and prevents a wrong number the
day a second mainnet deployment lands.

---

## R7 — Constitution III: "never leak across testnet/mainnet boundaries"

**Decision**: every estate roster is filtered to the build's cohort before any read.

**Rationale**: constitution principle III requires network-scoped data to stay scoped and never
cross the testnet/mainnet boundary. Read literally against "read from all chains", these conflict.
Cohort filtering dissolves the conflict: "all chains" means all chains *this build may read*. A
mainnet build never reads Amoy; a testnet build never reads Polygon.

This is a gate the plan's Constitution Check treats as **passing**, not as a justified violation.

---

## R8 — Conversion order for the fifteen operator views

**Decision**: convert in this order, so each step is independently shippable and the highest-risk
surface is not first:

1. **Foundation** — `lib/chains/estate.js`, `membershipChainId()`, the per-chain read-result type.
2. **Entry + permissions card** — US2. Nothing else can be reached from the wrong chain until this
   lands.
3. **Membership resolution + purchase routing** — US1, US5. Member-facing, and independent of the
   operator views.
4. **Overview / fee reporting** — US3, the first view to consume the estate helper end-to-end.
5. **Read-mostly views** — Maintenance, Services, Oracle Adapters, Wiring & Tokens.
6. **Write-heavy views** — Tiers, Members, Treasury, Fees, Staking, Deny-list, Callsigns, Admin
   Roles. Each gains a scope selector plus a per-chain authority check.
7. **Emergency + Account Moderation last.** These are the incident-response paths; converting them
   after the pattern is proven on eight other views means the killswitch is the least-experimental
   conversion, not the most.

**Rationale**: Bridge and Supply are already converted and act as the reference implementation
throughout, so every later step has a worked example to match rather than a design to invent.

---

## R9 — Testing approach

**Decision**:
- **Unit** — the estate helper's three-state read result (read / not deployed / unreadable) and its
  refusal to sum across units, tested directly.
- **Resolver** — `membershipChainId()` under both cohorts, proving a testnet build never returns 137.
- **Component** — each converted view: scope to a chain the wallet is not on and assert read state
  renders and write controls are withheld *with a stated reason*; make a chain unreadable and assert
  it renders as unreadable rather than as zero.
- **Guard** — a source-level test, in the spirit of the existing `chainResolutionGuard`, asserting
  that membership resolution does not read the wallet chain and that no view sums balances across
  chains.

**Rationale**: constitution principle II requires tests alongside behaviour. The existing
`AdminBridgeTab` / `AdminSupplyTab` suites (27 and 28 tests) already cover exactly these cases for
the two converted tabs and are the template for the other thirteen.

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Where the reference chain constant lives | R1 — derived in `config/networks.js` from the existing mainnet/testnet pair |
| How reads reach a non-connected chain | R2 — shared estate helper via `getReadProvider`, fixing the current spec-069 bypass |
| Whether every membership call site must change | R3 — no; the two resolvers funnel them all |
| Whether entry and write authority are one question | R4 — no; deliberately separate, per an existing documented defect |
| Whether the spec-008 guard blocks this | R5 — no; it passes, but its stated intent is amended |
| What accrues, and where | R6 — only `MembershipManager.accruedFees`; the FeeRouter holds nothing |
| Constitution III vs. "all chains" | R7 — cohort filtering; gate passes |
| Conversion order | R8 — foundation → entry → membership → overview → read-mostly → write-heavy → incident paths |
| Test strategy | R9 — mirror the existing Bridge/Supply admin suites |

**No NEEDS CLARIFICATION items remain.**
