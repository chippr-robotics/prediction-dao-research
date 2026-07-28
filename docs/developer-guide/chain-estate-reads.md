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
  `GUARDIAN_ROLE` on the WagerRegistry is not `GUARDIAN_ROLE` on the BridgeRouter.
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

`frontend/src/test/admin/adminEstateGuard.test.js` enforces 3 and 6 at the source level, with a
documented baseline for views not yet converted.
