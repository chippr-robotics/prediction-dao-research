# Phase 1 Data Model: what determines an address

This feature creates one new record (the exception register) and changes what *determines* the values
in two existing ones.

---

## 1. Address determinants

The inputs that decide where a contract lands. The whole feature is about shrinking this list to
things that are true properties of the contract.

| Input | Today | After |
|---|---|---|
| Contract's own code | yes | yes |
| Compiler version | yes | yes |
| Optimizer / EVM target settings | yes | yes |
| **Source file paths and names** | **yes** | **no** — the change in R1 |
| **Deployer's transaction count** | **yes, for most of the estate** | **no** — CREATE2 |
| **Chain-specific configuration** | **yes, for proxies** | **no** — init data leaves the constructor |
| Salt (identifier + tenant prefix) | for the 10 already deterministic | yes, for all |

**Validation rules**

- Executable code must be unchanged by this feature (FR-002). Only the appended provenance block may
  differ.
- After adoption, a change to a remaining determinant is an **address-moving event** and must be
  recognised as one (FR-004). The compiler version is the live one to watch — which is a further
  reason the exact pinning from spec 075 matters.

---

## 2. Contract identifier

The stable name that, with the compiled bytes, decides the address.

| Field | Rule |
|---|---|
| identifier | unique across the contract set; a collision is a **build** failure, not a deploy failure (FR-011) |
| tenant prefix | preserved — spec 072 gives tenants distinct addresses from the same contract, and that must survive |
| stability | once used to deploy, an identifier must never change; changing it silently relocates the contract |

---

## 3. Predicted address

Where a contract *will* deploy, computed without contacting a chain (FR-006).

| Field | Meaning |
|---|---|
| contract identifier | which contract |
| predicted address | derived from deployer, salt, and initcode hash |
| deployed address | from the per-chain record, when present |
| status | `match` / `mismatch` / `not deployed` / `unknown (chain unreachable)` |

**`unknown` is a distinct status on purpose.** An absent contract and an unreachable chain call for
opposite actions — one is a deploy, the other is a retry — so collapsing them into a single "missing"
is the specific dishonesty FR-018 forbids.

---

## 4. Recorded deployment addresses

`deployments/*.json`. **Format unchanged** (FR-019); 155 addresses across 9 networks.

What changes is that entries become *checkable* against predictions rather than being the only record
of where something is.

---

## 5. Exception register (new)

Contracts that cannot occupy their deterministic address. **Permanent records, not a backlog.**

| Field | Meaning |
|---|---|
| contract + chain | which deployment |
| current address | where it actually is |
| reason | why it cannot move |
| classification | `stateful` / `transitional` |

### `stateful` — cannot move, ever

The contract holds live user state and value at its address. Moving it would strand that state.
Includes `wagerRegistry` and `membershipManager`, and in practice every proxy already carrying user
state on a given chain.

These are **not** counted for or against consistency. They are the honest part of the answer, and
SC-008 requires them shown as exceptions rather than as gaps.

### `transitional` — deterministic today, moving to a new deterministic address

The five contracts that already have genuine CREATE2 cross-chain parity, whose addresses this
feature's metadata change moves (R5):

| Contract | Legacy address | Chains sharing it |
|---|---|---|
| `safeProposalHub` | `0x94b5b38c…` | 6 — arbitrum, base, etc, mordor, optimism, polygon |
| `backupPointerRegistry` | `0x664ACAd4…` | 2 — mordor, polygon |
| `openERC20Impl` | `0xd8e67c6c…` | 2 — mordor, polygon |
| `openERC721Impl` | `0x02819fd0…` | 2 — mordor, polygon |
| `restrictedERC20Impl` | `0x0dd67e2a…` | 2 — mordor, polygon |

Nothing deployed moves. But a *future* deployment lands at the new address, so these five are
mid-move until every chain is redeployed. **They must not be reported as consistent while
transitional** — they are consistent with each other at the legacy address and will be consistent at
the new one, and reporting either alone would be false.

---

## 6. What is NOT an exception, and why the mechanism is recorded

Fifteen addresses coincide across chains via plain CREATE — same deployer, same transaction count.
This includes `accountFactory` and `accountImpl` on **8 chains each**, `safePolicyGuardV2` and
`policyGuardSetup` on 6, and the fee/bridge/liquidity routers.

**These are coincidences, not guarantees.** They hold only while every chain's deployer nonce stays in
step, and break silently the first time one diverges. They are in scope to be *made* deterministic —
not exceptions.

> Recording the mechanism beside each address is what prevents two opposite errors: treating a nonce
> coincidence as a guarantee (it is not), and treating the metadata change as a threat to
> `accountFactory` (it is not — bytecode is not currently an input to that address). Both errors were
> reachable from the address list alone. `accountFactory` carries a further caveat from R6: moving it
> onto CREATE2 *makes* bytecode an input to an address that member wallets derive from, so it is its
> own decision rather than part of a sweep.
