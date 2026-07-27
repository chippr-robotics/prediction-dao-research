# Phase 1 Data Model

**Feature**: `specs/071-multi-chain-admin-console/` | **Date**: 2026-07-27

No persisted schema changes and no on-chain state. These are in-memory shapes and the rules that
govern them. Each entity exists because collapsing it into a neighbour caused, or would cause, a
specific dishonesty.

---

## 1. Environment cohort

The set of chains a build may read.

| Field | Type | Notes |
|---|---|---|
| `isTestnet` | boolean | Taken from the build's primary network (`NETWORKS[PRIMARY_CHAIN_ID].isTestnet`) |
| `chainIds` | number[] | Every supported chain whose `isTestnet` matches, mainnets-first ordering |

**Rules**

- Membership in the cohort is total: every entry in `NETWORKS` carries `isTestnet`, so no chain is
  unclassified.
- **No read may target a chain outside the cohort** (FR-002). This is the mechanism satisfying
  constitution III's testnet/mainnet clause.
- The cohort is fixed at build time. Nothing at runtime widens it.

**Derived from**: `config/networks.js` — existing `NETWORKS`, `PRIMARY_CHAIN_ID`, `isTestnet`.

---

## 2. Membership reference chain

The single chain that is the authority for membership.

| Field | Type | Notes |
|---|---|---|
| `chainId` | number | `137` (Polygon) for the mainnet cohort; `80002` (Amoy) for the testnet cohort |

**Rules**

- Exactly one per build (FR-001). Derived from the cohort, not declared separately (research R1).
- Not operator- or member-configurable at runtime. It is a payment destination; a wrong value sends
  a member's funds to a chain where their membership will never be read.
- Every membership question resolves here regardless of the wallet's chain (FR-003), and every
  membership purchase settles here (FR-006).

**Relationships**: always a member of the current cohort. A reference chain outside the cohort is a
build misconfiguration and must fail loudly rather than resolve.

---

## 3. Chain read result

The outcome of reading one contract on one chain. **The central shape of this feature.**

| Field | Type | Notes |
|---|---|---|
| `chainId` | number | Which chain this describes |
| `status` | `'read' \| 'not-deployed' \| 'unreadable'` | Exactly one |
| `value` | any \| null | Present only when `status === 'read'` |
| `unit` | `{ symbol, decimals, address } \| null` | For balances — which token the value is denominated in |
| `reason` | string \| null | Present only when `status === 'unreadable'`; why the read failed |
| `readAt` | number \| null | Timestamp of a successful read, for per-chain freshness |

**State meanings — these three are never interchangeable (FR-014)**

- `read` — the contract answered. `value` is a fact.
- `not-deployed` — there is no such contract on this chain. A *definite* answer: there is nothing
  here to have a value. Distinct from a zero value.
- `unreadable` — the question could not be put (endpoint down, timeout, malformed response). **Not**
  an answer. Must never render as `0`, as empty, or as absence.

**Rules**

- A consumer may not default `value` when `status !== 'read'`. The type carries no value in those
  states precisely so the default has nowhere to live.
- `unreadable` is never treated as a denial in an authority context — an authority read that fails
  leaves the control offered with authority marked unconfirmed, per the rule
  `liquidityAdminCommon.js` already documents (research R4). Withdrawing a killswitch because an
  RPC timed out tells an operator who holds it that there isn't one.
- `not-deployed` **is** a definite denial in an authority context: there is no contract here to hold
  a role on.

### Aggregation of chain read results

| Field | Type | Notes |
|---|---|---|
| `subtotals` | `{ [unitSymbol]: bigint }` | One per unit — never one grand total |
| `partial` | boolean | True when any contributing chain is `unreadable` |
| `missing` | number[] | Chain IDs excluded from the subtotals, and why |

**Rules**

- Values with different `unit` are **never summed** (FR-022). Polygon USDC and Mordor Classic USD
  are different assets; one figure across them is invented.
- An `unreadable` chain is excluded from every subtotal, and its exclusion sets `partial` (FR-023).
  A partial total is never presented without saying so and naming what is missing.
- `not-deployed` chains contribute nothing and do **not** set `partial` — nothing is missing; there
  is simply nothing there.

---

## 4. Scoped chain

The chain an operator view is currently showing.

| Field | Type | Notes |
|---|---|---|
| `chainId` | number | Operator's choice, from the cohort |
| `isWalletChain` | boolean | Whether the wallet is currently on it — gates writes only |

**Rules**

- Chosen by the operator, defaulting to the wallet's chain when that chain is in the view's roster,
  otherwise the first roster entry (the behaviour `BridgeTab` already has).
- **Does not change when the wallet changes network** (FR-016). Read state must not silently
  re-target under an operator mid-audit; only the availability of write controls changes.
- Independent per view. Scoping the Fees tab to Base does not move the Staking tab.

---

## 5. Per-chain authority

Whether an account holds a given role on a given contract on a given chain.

| Field | Type | Notes |
|---|---|---|
| `chainId` | number | Chain the question was put on |
| `contract` | string | Which contract was asked — the one that will enforce the write |
| `roles` | `{ [roleName]: boolean }` | Answers, only meaningful when `readable` |
| `readable` | boolean | Whether the question could be put at all |
| `deployed` | boolean | Whether there is a contract here to hold a role on |
| `reason` | string \| null | Why unreadable |

**Rules**

- Asked of **the contract that will enforce it**, never inferred from an app-wide role flag
  (FR-019). `GUARDIAN_ROLE` on the WagerRegistry and `GUARDIAN_ROLE` on the BridgeRouter are
  unrelated sets; treating one as the other showed operators an enabled killswitch that reverts.
- Distinct from console entry, which is the estate-wide question "do you hold anything anywhere"
  (FR-009). Entry is a coarse signal and is never authority to act.
- `readable: false` ⇒ controls stay offered, authority shown as unconfirmed. The contract is the
  real gate.

---

## Entity relationships

```text
Environment cohort  ──contains──▶  chain IDs
        │
        ├──exactly one──▶  Membership reference chain   (membership reads + purchases)
        │
        └──each chain──▶   Chain read result            (per contract, per view)
                                    │
                                    └──aggregated──▶  per-unit subtotals + partial flag

Scoped chain  ──selects which──▶  Chain read result a view foregrounds
      │
      └──with wallet chain + Per-chain authority──▶  whether a write control is offered
```

## State transitions

**Membership resolution**

```text
unresolved ──read reference chain──▶ active(tier, expiry)
           │                       └▶ none
           └──read failed─────────▶ unknown  ──retry──▶ (any of the above)
```

`unknown` is never rendered as `none` (FR-004), and a membership-gated action is refused while
`unknown` with the refusal attributed to the failed read (FR-005).

**Console entry**

```text
resolving ──any chain reports a role──▶ granted
          ──all chains answered, none report a role──▶ refused ("you hold no operator role")
          ──no chain could be read──▶ refused ("no network could be read")   ← distinct message
```

An unreadable chain never counts as evidence a role is not held (FR-011).

**Write control availability**

```text
hidden ──wallet not on scoped chain──▶ shown disabled, with "switch to <chain> to act"
       ──wallet on scoped chain, authority readable and held──▶ enabled
       ──wallet on scoped chain, authority readable and NOT held──▶ shown disabled, "role not held here"
       ──wallet on scoped chain, authority unreadable──▶ enabled, authority marked unconfirmed
       ──contract not deployed on scoped chain──▶ hidden, "not deployed on <chain>"
```
