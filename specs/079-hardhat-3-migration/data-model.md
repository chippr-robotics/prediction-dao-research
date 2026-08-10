# Phase 1 Data Model: the records this migration must not corrupt

This migration creates no new data. It changes the *inputs* to four existing records, each of which
is authoritative for something that cannot be reconstructed if it goes wrong.

---

## 1. Compiled-output record

**Where**: `specs/075-monorepo-workspaces/baseline-bytecode.json`
**Authoritative for**: detecting unintended changes to compiled contracts.

| Field | Meaning |
|---|---|
| artifact path | identifies the contract |
| digest | fingerprint of the compiled bytes |

**What changes**: all 96 bytecode-producing contracts get a new digest. The 49 entries with `0x`
bytecode (interfaces) do not change.

**Validation rule (FR-001)**: a digest change is acceptable **only** when the metadata-stripped
executable code is identical. The record stores digests, not bytes, so it cannot itself prove this —
the proof requires retaining the pre-migration artifacts and comparing stripped bytes directly (R2).

**State transition**: re-recorded exactly once, in Phase 4, with the consequence stated (FR-002).
Test-only wrapper contracts (R4) enter as **additions**; any of them appearing as a *modification to
a shipped contract* is a defect.

---

## 2. Upgrade-safety record

**Where**: the plugin's validations cache, compared against live implementations.
**Authoritative for**: whether an upgrade is append-only and therefore safe.

| Field | Meaning |
|---|---|
| storage layout | field order, types, gap sizes per contract |
| live implementation address | the deployed layout being diffed against |

**What changes**: nothing in the data. Only the *access path* changes — v4 no longer exports the
private module the check reads it through (R1).

**Validation rules**:
- Must reach **≥26** implementations across **≥7** chains (SC-002).
- Must continue to report the **4** implementations declared undiffable, with their recorded reasons,
  rather than silently dropping them (FR-003).
- Must **reject** a deliberately corrupted layout (SC-003) — proven by mutation, not by passing.
- An unreachable chain is `unreachable`, never "no incompatibility found".

---

## 3. Recorded deployment addresses

**Where**: `deployments/*.json` — 155 addresses across 9 networks.
**Authoritative for**: which contract lives where. Constitutionally "the source of truth".

**What changes**: nothing. This migration deploys nothing (SC-006) and does not alter the file
format (FR-013).

**The hazard is indirect and silent** (R5): these files are keyed by chain id
(`hardhat-chain1337-v2.json`), and Hardhat 3's default network is chain id **31337** rather than the
configured **1337**. A script that connects to the default instead of the configured network reads or
writes the wrong record while appearing to work. Mitigation is an explicit chain id plus a test that
asserts the connected id is the configured one.

---

## 4. Deterministically-addressed contracts (FR-006)

**Authoritative for**: the property that a contract has the *same address on every chain*.

A CREATE2 address derives from the creation bytecode; a plain CREATE address derives only from
deployer and nonce. **Only the CREATE2 set is affected by a metadata change** — which narrows this
from "20 shared addresses" to a specific five.

### Affected — CREATE2 *and* real cross-chain parity today

| Contract | Address | Chains sharing it |
|---|---|---|
| `safeProposalHub` | `0x94b5b38c…` | **6** — arbitrum, base, etc, mordor, optimism, polygon |
| `backupPointerRegistry` | `0x664ACAd4…` | 2 — mordor, polygon |
| `openERC20Impl` | `0xd8e67c6c…` | 2 — mordor, polygon |
| `openERC721Impl` | `0x02819fd0…` | 2 — mordor, polygon |
| `restrictedERC20Impl` | `0x0dd67e2a…` | 2 — mordor, polygon |

**Consequence**: deploying any of these to a **new** chain after the migration lands at a *different*
address than its existing siblings, breaking the property the determinism was chosen to provide.
Nothing already deployed moves.

### CREATE2 but no parity to lose

`voucherBatchMinter` — deployed deterministically, but its addresses **already differ per chain**
(`0x929A8E97…` amoy, `0xc26F02da…` mordor, `0x4b50d24c…` polygon) because its constructor takes a
chain-specific voucher address. Nothing to break.

`WagerPool`, `MockPolymarketCTF`, and the `…V2` token variants are in the CREATE2 set but have no
recorded cross-chain shared address.

### NOT affected — shared via plain CREATE, not CREATE2

These share addresses across chains because they were deployed by the same deployer at the same
nonce. **Bytecode is not an input to their address**, so the metadata change does not move them:

`accountFactory` and `accountImpl` (8 chains each — the passkey account stack), `safePolicyGuardV2`,
`policyGuardSetup` (6 chains), `feeRouter` / `feeRouterImpl`, `bridgeRouter` / `bridgeRouterImpl`,
`liquidityRouter` / `liquidityRouterImpl`, `keyRegistry`, `sanctionsGuard`,
`chainlinkDataFeedAdapter`, `verifyingPaymasterSigner`.

`entryPoint` (`0x5FF137D4…`, 8 chains) is the canonical external ERC-4337 EntryPoint — not built
here at all.

> **This distinction is the finding.** Before making it, the apparent blast radius included the
> passkey `accountFactory` on 8 chains — which would have meant a member's account address ceasing to
> be chain-independent. It does not, because that address never depended on bytecode. Recording the
> mechanism alongside the address is what keeps a future reader from re-raising the same false alarm.

**Validation rule**: deploying any contract in the *affected* table to a chain it is not yet on is a
decision requiring explicit sign-off, not a routine operation.
