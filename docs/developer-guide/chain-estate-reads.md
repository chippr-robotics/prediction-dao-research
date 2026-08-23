# Reading across chains: the estate, the reference chain, and honest gaps

**Spec:** [071](../../specs/071-multi-chain-admin-console/) · **Code:** `frontend/src/lib/chains/`,
`frontend/src/config/networks.js`

Two questions the app used to answer with "wherever the wallet is pointed", and now answers
properly.

---

## 1. Membership lives on ONE chain

```js
import { membershipChainId } from '../config/networks'
```

Membership exists in exactly one place per environment cohort — **Polygon (137)** on a mainnet
build, **Amoy (80002)** on a testnet build. It is derived from the existing
`MAINNET_CHAIN_ID`/`TESTNET_CHAIN_ID` pair, never declared again: a second literal `137` is a
divergence waiting to happen, and a hardcoded one silently reads *mainnet* membership in a
testnet build.

**Every membership question resolves there**, whatever chain the wallet is on. `hasRoleOnChain`
and `getUserTierOnChain` enforce this internally for the `WAGER_PARTICIPANT` path and **ignore the
chain you pass** — so a new caller cannot get it wrong by habit. Their admin-role branch still
honours the chain you give it, because admin roles genuinely *are* per-chain.

Purchases settle there too. Membership is only readable from one place if it is also *written* in
one place; a purchase landing elsewhere creates a membership the reference-chain read can never
see.

> **Why this was a bug, not a preference.** On mainnet the `MembershipManager` is deployed on
> Polygon and nowhere else. Reading it on the wallet's chain reported every member on Ethereum,
> Optimism, Base, Arbitrum or ETC as having no membership.

## 2. Everything else spans the cohort

```js
import { cohortChainIds, isInCohort } from '../config/networks'
import { estateNetworks, readAcrossEstate, readProviderFor } from '../lib/chains/estate'
```

The **cohort** is the set of chains this build may read: mainnets for a mainnet build, testnets
for a testnet build. Constitution III forbids network-scoped data crossing that boundary, so
"read every chain" means *every chain this build may read*. Use `cohortChainIds()` — never
`listSupportedChainIds()`, which spans both.

The **estate** is what is deployed on those chains and what it says. Reading it means asking
every cohort chain and reporting **all** of them, including the ones that answered *not deployed*
and the ones that could not be asked.

```js
const results = await readAcrossEstate({
  addressFor: (id) => getContractAddressForChain('membershipManager', id),
  read: ({ provider, address }) => new ethers.Contract(address, ABI, provider).accruedFees(),
  walletChainId, walletProvider,
  unitFor: feeUnitFor,          // required for balances — see the no-cross-unit rule below
})
```

`readAcrossEstate` is concurrent and **never rejects**: one dead endpoint becomes an `unreadable`
entry while its siblings resolve, so no view is held hostage by the slowest chain.

### Providers

**Never build a provider from `NETWORKS[chainId].rpcUrl`.** That bypasses `resolveRpcEndpoints`
and so ignores the member's configured endpoint and failover (spec 069). Go through
`readProviderFor(chainId, walletChainId, walletProvider)`, which reuses the wallet's own provider
when the scope *is* the connected chain and resolves properly otherwise. A source-level test
pins this.

## 3. The three states — and why `?? 0` has nowhere to live

```js
import { readOk, notDeployed, unreadable, isRead, aggregate } from '../lib/chains/chainReadResult'
```

| State | Meaning |
|---|---|
| `read` | the contract answered; `value` is a fact |
| `not-deployed` | there is no such contract here. A **definite** answer — not a zero |
| `unreadable` | the question could not be put. **Not an answer.** Never renders as `0` |

`value` exists **only** on `read`. That is deliberate: a consumer tempted to write
`result.value ?? 0` finds the default has nowhere to live, because the two non-answer states
carry no value at all.

An operator auditing a control surface reads a silent `0` as a fact. That single sentence is why
this type has three states instead of a nullable number.

### Aggregation never crosses units

`aggregate()` returns **per-unit subtotals** plus `partial` and `missing`. There is deliberately
no API returning one figure across units — Polygon USDC and Mordor's Classic USD are not the same
asset, so a single number across them is invented. An `unreadable` chain is excluded and sets
`partial`; a `not-deployed` chain contributes nothing and does **not** set it, because nothing is
missing — there is simply nothing there.

Render with `ChainStateTable`, which handles all three states and the partial label.

### The role sweep obeys the same three states

The console's entry decision is itself an estate read — `hasRole` per operator role per cohort
chain — and it is classified by `classifyEstateProbes` (`lib/chains/estateSweep.js`), which fills
`estateRead = { read, notDeployed, unreadable, swept }`.

The rule that makes it honest: **a chain is classified on the probes that had a contract to
read.** `hasRoleOnChain(..., { detailed: true })` reports `deployed: false` when no contract on
that chain could hold the role — Ethereum Classic carries no `WagerRegistry`, so nobody is its
Account Moderator, and that is settled from the address book without a network call. Those probes
say nothing about whether the chain answered.

Collapsing them into `read` is a bug with a specific, bad shape. On a mainnet build only Polygon
carries a contract for *every* operator role; the four spec-067 chains carry the routers and
nothing else, and ETC carries neither. So a total RPC outage produced `read` = five chains that
had "answered" from config, `unreadable` = `[137]`, and an entry state of `denied` — the operator
was shown **"Access Restricted"**, a statement about their permissions, on the strength of zero
successful reads, at exactly the moment an incident commander needs to get in. `unverified`
("Could Not Verify Access", with a retry) is the honest screen, and it is only reachable if
`read` can actually be empty.

`useAdminAccess` also exposes **`settled`** — `swept && curatorAuthority !== null`. Entry can be
granted by the curator authority (one contract read) before the role sweep returns, and in that
window every role flag is still false. Anything acting on the ABSENCE of a flag must wait for
`settled`, or it acts on a fact that is not in yet: `AdminAppShell`'s deep-link redirect did not,
and bounced an entitled operator following a bookmarked link back to the Control Room.

## 4. Operator views: scope reads, gate writes

```js
import { NetworkScopeCard, WriteGate } from '../components/admin/scopeControls'
import { useScopedChain, writeGateReason, writeAllowed } from '../components/admin/scopeGate'
```

- **Scope is a network the operator picks.** `useScopedChain` seeds it from the wallet's chain
  once and **never re-derives it** — an operator mid-audit must not have their reading silently
  re-targeted when a wallet switches networks.
- **A write is one transaction on one named chain.** Gate it on the wallet being there, check
  again at the call site so a stale render cannot send to the wrong network, and name the chain
  in the confirmation.
- **Authority is read from the contract that will enforce it**, never from an app-wide role flag.
  `GUARDIAN_ROLE` on the WagerRegistry is not `GUARDIAN_ROLE` on the BridgeRouter. Use
  `readAuthority` + `authorityGate` from `lib/chains/estate.js`; an app-wide flag may stand in
  only while the first read is in flight, so an operator who does hold the role is not shown an
  empty tab for a round-trip.
- **An unconfirmed authority read keeps the control offered**, and says so. Only a definite "no"
  withholds. Hiding a killswitch because an RPC timed out tells an operator who holds it that
  there isn't one.
- **No control acts on several chains at once.** No bulk pause, no bulk freeze.

## Checklist for a new operator view

1. Roster from `estateNetworks()` (cohort-bounded), not `listSupportedChainIds()`.
2. Scope with `useScopedChain`; do not re-derive it from the wallet.
3. Resolve addresses **and** providers against the *scoped* chain, so they cannot disagree.
4. Render per-chain state with `ChainStateTable` — never collapse unreadable into zero.
5. Gate writes with `writeAllowed`/`writeGateReason`; name the chain on the button and in the
   confirmation.
6. Totals via `aggregate()` only.

`frontend/src/test/admin/adminEstateGuard.test.js` enforces 3 and 6 at the source level. Its
allowlist of unconverted views is now **empty** — every admin view resolves its contract from a
chain it was given. A view mid-conversion may be listed with a measured count and a sentence
saying why; the guard also fails when a listed count drops, so a baseline cannot quietly drift.

`frontend/src/test/admin/adminViewScope.test.jsx` covers the views themselves: two rendered end
to end (deny-list, paymaster) across every per-chain state, and the rest structurally.

## Member activity: the estate ledger (spec 092)

The estate pattern above also carries the MEMBER's activity record. The Account tab's Activity
feed and Stats merge the spec-051 per-chain ledger across the cohort via
`frontend/src/data/ledger/estateLedger.js` (`getDefaultEstateLedger()` in `data/ledger/index.js`
wires the default repository and providers). The full contract is
`specs/092-multi-chain-activity/contracts/estate-activity.md`; the short version:

- The merge sits **above** the per-chain `listEntries` boundary, so normalize's G5 guard (an
  entry's chainId must match its query scope) stays in force; the merge never re-tags an entry.
- **Two disclosure layers, deliberately distinct.** A CHAIN resolves `read`/`unreachable`
  (`chainStates`, with unreachable chains named via `partialChains`); within a `read` chain,
  individual SOURCES keep the existing `staleClasses` degradation, labelled per network in the
  UI ("earn on Polygon"). Don't collapse one into the other: a dead endpoint is not "earn is
  stale", and a broken subgraph is not "Polygon unreachable".
- **Empty ≠ failed.** A chain that read fine and found nothing is `read` with `entryCount: 0`;
  gate "no activity" language on state, never on count.
- **A chain whose NETWORK-backed sources all failed is `unreachable`, not an empty read (#1280).**
  The repository degrades per source rather than throwing, so a total outage used to arrive at the
  merge as an ordinary empty list — indistinguishable from a member with no history, which meant
  `allUnreachable` (and its honest disclosure) could never fire. `listEntries` now returns a
  `readState` (`read` / `unreadable`) and the merge maps `unreadable` to `unreachable`.
  **Reachability is counted over network-backed sources only.** Six of the nine default sources
  (`transfer`, `earn`, `staking`, `bridge`, `liquidity`, `miniapp`) read the client record store
  and fulfil whether or not any network is up; counting rejections across all nine looked right
  and was useless, because `failedSources === sources.length` could never be true on the shipped
  wiring. Sources declare `backing: 'network' | 'client'` (omitted ⇒ `network`, the conservative
  reading) and only the network-backed ones can testify that a chain went unread. `unreadable`
  additionally requires that **nothing at all was collected** — records that did arrive are the
  member's own data and are shown with their failed classes disclosed, never discarded, because
  the merge drops an unreachable chain's entries entirely.
- **Not-deployed is a read of nothing, not a failed read.** A source returning `[]` because its
  contract does not exist on that chain has fulfilled — `wagerLedgerSource` checks the escrow
  address first, or every un-deployed chain would report the wager class stale forever. The
  consequence is worth stating plainly: on a mainnet build only Polygon carries FairWins
  contracts, so under a total RPC outage Polygon goes `unreachable` while Ethereum/Optimism/
  Base/Arbitrum stay `read` with zero entries — which is true, there is nothing on them to read.
  `allUnreachable` (FR-009, "None of your networks could be read") therefore fires only where
  every cohort chain has something to read, e.g. a single-chain testnet cohort. The mainnet
  outage is disclosed by the **partial** path instead: the unreadable chain is named in
  `partialChains`, and `MyAccountView` refuses to call the empty feed "No activity yet".
- **Freshness is a claim about what was READ.** `useAccountStats` stamps
  `{ lastUpdated: now, status: 'fresh' }` on the ledger-derived sections (summary/series/activity)
  only when the whole estate answered; with a chain or a class unread they get
  `{ lastUpdated: now, status: 'partial' }` and the indicator reads "Partly updated Ns ago — some
  sources unread". "Updated 50s ago" beside a panel that just disclosed a failed read is the same
  fabrication as an empty history — but so is `stale`/"showing last known" over entries that were
  in fact just fetched, and over a first load with no last-known data at all. `partial` is a
  fourth status for that reason, and it is not sticky: the next complete read is `fresh` again.
  The wallet-balance section is unaffected — it reads the connected wallet on its active chain,
  not the estate.
- Dedup is by `entryId` (identity embeds chainId), which also collapses reference-chain sources
  (membership) answering from several scopes.
- Wager lookups downstream are keyed `(chainId, wagerId)` — wager #12 exists independently on
  two chains.

`frontend/src/test/ledger/estateLedger.test.js` pins one case per contract guarantee.
