# Research: Safe Receiver (Spec 070)

**Date**: 2026-07-27
**Feature**: [spec.md](./spec.md)
**Origin**: GitHub issue #929 — *"Safe Request" — sanctions-screened payments (on-chain enforced settlement)*

This document records the measurements that reframed the feature, the designs
that were rejected and why, and the repo patterns the implementation inherits.
Everything marked **MEASURED** was reproduced on hardhat against the repo's real
`contracts/access/SanctionsGuard.sol` and `contracts/mocks/MockSanctionsOracle.sol`.
Probe contracts were removed afterwards; no measurement artefact remains in the
tree.

---

## R1. Can a receive address reject a deposit from a sanctioned sender?

This is the question the whole feature turned on, because issue #929 and the
owner's follow-up direction both assumed the answer was yes.

### R1.1 Native coin — yes for direct sends, with three holes

Probe: a contract whose `receive() external payable { guard.checkBlocked(msg.sender); }`.

| Payer shape | Result | Verdict |
|---|---|---|
| Clean EOA, full gas | status 1, 34,251 gas, 1.0 ETH delivered | works |
| Sanctioned EOA, full gas | reverts `SanctionedAddress(0x3C44…)`, **0 wei moved** | works |
| Contract using `.transfer()` | reverts (out of gas in callee) | payer locked out |
| Contract using `.send()` | **payer tx SUCCEEDS, 0 wei delivered** | **silent loss** |
| Any payer with `gasLimit: 21000` | fails against *any* contract, incl. an empty `receive()` | payer locked out |
| Sanctioned EOA via `SELFDESTRUCT` | 2.0 ETH delivered, `receive()` never ran | guard bypassed |

**MEASURED** on `evmVersion: paris` (`hardhat.config.js:332`).

### R1.2 The 2300-gas stipend is not negotiable

**MEASURED** marginal cost of the guard call inside `receive()`:

```
empty receive()             21,019
receive(){ checkBlocked }   34,251   → marginal 13,232
receive(){ no-op guard }    24,089   → marginal  3,070
```

A *literal no-op* external staticcall costs 3,070 gas — already above the 2300
stipend that Solidity's `transfer()`/`send()` forward. EIP-2929
`COLD_ACCOUNT_ACCESS_COST` alone is 2,600. No amount of `immutable` caching,
assembly, or guard-side tuning closes that gap; the 13,232 decomposes as
~2,600 (cold guard) + ~2,100 (cold `_denied` SLOAD) + ~2,600 (cold oracle) +
~2,100 (cold SLOAD inside the oracle) + dispatch, and the nested staticcall is
structural to `SanctionsGuard.sol:93-101`.

Two consequences matter more than the cost:

1. **`.send()` fails silently.** It returns `false`, the payer's transaction
   succeeds, and the money never arrives. This is the worst failure mode in the
   entire design space — worse than a revert, because nobody learns anything.
2. **Code at the address is itself a payability regression.** A payer that
   hardcodes `gasLimit: 21000` — the classic "plain transfer" limit — fails
   against *any* contract, including one that does nothing at all. This breaks
   the owner's core requirement ("payable by a plain address QR from any wallet
   or exchange") before sanctions logic even enters the picture.

### R1.3 ERC-20 — no, and not partially

**MEASURED**: a sanctioned signer's `transfer(guardedReceiver, 500)` →
status 1, exactly one log (the token's own `Transfer`), recipient balance 500.
**Zero recipient code ran.**

- EIP-20 `transfer` has no recipient callback. OZ `ERC20._update`
  (`ERC20.sol:176`) only mutates balances.
- All six configured stablecoins (five Circle USDC deployments + USC) were
  bytecode-scanned for ERC-1363 / ERC-777 / ERC-223 / ERC-677 selectors behind
  their proxies. **None present**; control selectors were present, so the scan
  method is sound. (`frontend/src/config/networks.js:165,252,338,415,496,536,585,638`)
- The only hook-bearing token in the curated registry is LINK on Ethereum
  (ERC-677), and `transferAndCall` is an **opt-in second entrypoint the payer
  chooses**. A hook the payer can decline is not enforcement.

**And the identity is unrecoverable later.** At sweep time a contract can read
`balanceOf(self)` — an amount with no identity. `LOG0`–`LOG4` are write-only and
no opcode reads receipts. The only authenticated-`from` paths
(`transferFrom` / `permit` / EIP-3009) all require the payer to do something
FairWins-shaped, which a plain address cannot demand.

### R1.4 Conclusion

> *"Receive addresses which allow deposit from any non-sanctioned address"*

is **not deliverable as written**. It is impossible for the asset members
actually use, and for native coin it holds only against direct full-gas EOA
sends while locking out two payer shapes, silently losing money from a third,
and remaining bypassable by `SELFDESTRUCT`.

The spec is therefore written to what *is* deliverable: **segregation at
receive time, and enforcement at spend time.**

---

## R2. Designs considered

### Design A — Eagerly-deployed native gate *(rejected)*

Each receive address is deployed up front with a screening `receive()`.

- **Enforces**: direct full-gas EOA native sends from sanctioned addresses
  revert atomically.
- **Cannot enforce**: any ERC-20; contract payers; 21000-gas payers;
  `SELFDESTRUCT`; anything that arrived before deployment.
- **Cost**: ~90k–118k gas per address to mint, +13,232 gas on every payer's
  deposit (a ~63% surcharge over a 21,000-gas transfer).
- **Rejected because** it advertises a guarantee it does not deliver on the
  dominant asset, and its failure modes are silent. A member would believe
  sanctioned funds cannot reach their address while sanctioned USDC arrives
  without a murmur.

### Design B — Pull-based screened deposit *(rejected here; viable as its own feature)*

The payer signs an EIP-3009 `ReceiveWithAuthorization` (or `permit` +
`transferFrom`) and the receiving contract pulls, screening both parties
atomically.

- **Enforces**: genuine, atomic, both-sides screening for USDC. `from` is
  signature-authenticated *by the token*, so `guard.checkBlocked(from)` is
  trustworthy. Selector `ef55bec6` verified present in all five deployed USDC
  contracts; `contracts/interfaces/IERC3009.sol:22-32` already exists in-tree.
- **Cannot serve this feature**: the payer must sign a FairWins-shaped struct.
  An exchange, a cold wallet, a payroll system, or any third-party app cannot.
  The "pay me from anywhere with a plain address" property is lost.
- **Also bypassable by construction**: the destination is still a plain
  address, so anyone can `transfer()` into it unscreened. The screened path is
  opt-in *for the payer*.
- **Status**: this was the original 070 draft ("Safe Request"). It is the only
  design that genuinely screens a stablecoin payment in both directions and
  remains available as future work — but it is a different feature, not this
  one.

### Design C — Quarantine-then-attest *(chosen — the product shape)*

One receive address per counterparty. Deposits are unrestricted. Value is
spendable only on a positive clearance assertion; withheld value is visible and
explained.

- **Enforces**: the member never commingles un-vetted funds into their main
  account. One address per payer turns an unpartitionable fungible balance into
  a **per-address quarantine unit** — this is the mechanism that makes ERC-20
  attribution tractable at all.
- **Cannot enforce**: anything at deposit time. The money is already in the
  member's contract when the decision is made.
- **Handles tainted funds correctly**: they sit in their own address, marked,
  and are simply never swept. This is exactly Bitcoin's model — accept
  everything, protect at spend time.

### Design D — Screen the named actor *(chosen — the on-chain control inside C)*

Screening applies to the party the transaction can attribute: the member
sweeping, the destination, and any counterparty the member committed on-chain.

- Matches every existing FairWins consumer — `WagerPoolFactory.sol:178-186`
  screens `creator` (`msg.sender` for self-submit, the recovered signer for the
  gasless twin), never an inferred upstream party.
- Cheap, precedented, fail-closed, and it screens somebody the contract can
  actually name.

**Shipped design: C (product) + D (on-chain control).**

---

## R3. Why receive addresses are contracts and not plain keys

A serious alternative is N ordinary EOAs derived from the member's existing
seed (spec 041's passkey master seed, or spec 062's key vault). That would give
segregation with zero contracts, zero minting cost, full plain-address
payability, and — unlike the chosen design — *unlinkable* addresses.

It was rejected on one decisive practical point:

> **Value cannot leave a plain address until that address itself holds gas.**

Collecting from 20 EOAs means 20 gas top-ups before 20 sweeps, on every
network, forever. With member-owned contracts the member's own account pays gas
once and directs the sweep, and the addresses never need to hold the gas token
at all (spec FR-021). Contracts also make the on-chain screening of Design D
possible — an EOA can enforce nothing.

Secondary reasons: derivation from the owner's address recovers without the
seed (R5), and the member-owns-the-deployed-contract shape matches the Protect
model the owner asked for.

---

## R4. The UTXO analogy — which half survives

The owner's direction described a UTXO model with change addresses. Half of it
translates and half does not.

**Survives — rotation and per-address quarantine.** Change is a *Bitcoin
protocol necessity*: a UTXO must be consumed whole, so the remainder has to go
somewhere. That pressure does not exist on EVM.

**Does not survive — change addresses.** `transfer(to, amount)` moves exactly
`amount` and leaves the remainder in place. After a partial spend, value left
sitting in address `R` is **exactly as segregated** as value moved to a fresh
`R'`, still attributed to the same counterparty — and **MEASURED** ~90,300 gas
cheaper per spend.

**And the privacy motive does not transfer either.** Bitcoin change addresses
are unlinkable without the xpub. EVM factory clones are publicly linked: anyone
can re-derive `keccak(owner, i)` for `i = 0,1,2…` and enumerate every address a
member owns. Shipping change addresses would *imply* an unlinkability the
architecture does not have — which is worse than not shipping them.

Decision: keep rotation and one-address-per-payer; drop change addresses; state
the linkability plainly (spec FR-007).

---

## R5. Discovery and recovery without a backend

Deterministic derivation makes this strictly better than the Bitcoin precedent
it borrows from.

- Bitcoin needs gap-limit-20 probing because HD addresses leave no registry
  (`frontend/src/lib/bitcoin/wallet.js:120-182`), and it accepts two known
  weaknesses: a payment more than 20 indices ahead is undiscoverable, and an
  issued-but-never-paid address is not recovered after cache loss — so the
  cursor can roll back and **reissue an address**.
- On EVM, address *N* for owner *O* is a pure function of the factory, the
  template's init-code hash, and `salt = keccak(O, N)`. **MEASURED**: predicted
  address matched the deployed address exactly. A fresh device derives
  addresses 0..N locally with **zero RPC calls and zero scanning**, so the
  reissue hazard disappears rather than being inherited.
- Spec 061's research rejected a server-side registry of issued addresses
  because the server would learn the wallet graph. An on-chain factory *is*
  that registry — the trade inverts, and the privacy cost lands publicly. That
  cost is accepted and disclosed (spec FR-007).

**Two traps to avoid:**

1. Both existing clone factories use non-deterministic `Clones.clone`
   (`contracts/pools/WagerPoolFactory.sol:199`; `TokenFactory` ×6).
   `cloneDeterministic` exists in the pinned OZ but has **zero call sites in
   this repo** — this would be the first use, and it is mandatory.
2. If the factory's template pointer is admin-mutable (the
   `WagerPoolFactory.sol:453-458` pattern), changing it changes the init-code
   hash and therefore **moves every future derived address**. A printed address
   must never move (spec FR-030) — bind the template version into the salt, or
   make the template immutable.

**The real cost problem is balance reading, not enumeration.**
`getPortfolioRegistry` yields ~20 assets on Ethereum and ~12 on Polygon
(`frontend/src/config/assetTaxonomy.js:421-497`), polled every 60s
(`usePortfolio.js:41`). Twenty receive addresses × twenty assets = **400 balance
reads per poll**. With ethers batching (`batchMaxCount` 100,
`utils/rpcProvider.js:11`) that is ~4 HTTP requests — tolerable. But batching is
**disabled on ETC 61 and Mordor 63** (`NO_BATCH_CHAIN_IDS`,
`utils/rpcProvider.js:31,44`), which would mean 400 individual requests per
poll. `frontend/src/abis/Multicall3.js` exists with **zero importers**. The plan
must bound the scanned set, introduce Multicall3 deliberately, or replace the
poll with an explicit check — not inherit a 60-second 400-read loop.

---

## R6. Patterns this feature inherits

| Piece | Reuse | Location |
|---|---|---|
| Member deploys and owns; no platform key | Safe vault initializer names only member owners | `frontend/src/lib/custody/safeVault.js:30-43` |
| No upgrade key over member value | "No owner, no admin role, deliberately NOT upgradeable" | `contracts/custody/SafePolicyGuardV2.sol:33-42` |
| Preview an address before signing | The repo's only pure, provider-free CREATE2 predictor | `safeVault.js:64-78`, `:84-97` |
| Preview invalidated on any config change | Whole initializer hashed into the salt | `CreateVaultWizard.jsx:41-46` |
| Member-instantiated clones, admin = config only | `createPool` is `msg.sender`-attributed | `WagerPoolFactory.sol:137-143`, `:454-475` |
| Fail-closed tri-state screening config | `screeningRequired` + `ScreeningNotConfigured()`; setters refuse to null a guard | `WagerPoolFactory.sol:68-70,112-114,285-303,461-465` |
| Clone → factory screening callback | Clones call back rather than holding a guard pointer | `WagerPool.sol:13-17` |
| CEI on issuance + provenance guard | Screen → clone → init → registry write; 1-based ids so `id == 0` means unknown | `WagerPoolFactory.sol:184-186,198-208,316-320` |
| Counterfactual address funded before code | Shipped and tested (spec 041 FR-007) | `specs/041-passkey-wallet-login/spec.md:388-391` |
| First-use deploy folded into the first action | Gated on `isDeployed()` | `frontend/src/lib/passkey/smartAccount.js:314-324` |
| Rotation cursor = max(issued)+1, append-only | Issuance is a **write**, not a read | `frontend/src/lib/bitcoin/wallet.js:45-49,75-89` |
| Peek vs. issue split | Abandoned plans never burn an index | `useBitcoinWallet.js:462-471,493-500` |
| **Fail-safe taint rule** | `spendable` is a *positive assertion*; protected/unverified/pending/unknown all withheld | `frontend/src/lib/bitcoin/coinSelection.js:79-86` |
| Explained balance decomposition | `{confirmed, pending, protected, spendable}` so total ≠ spendable is never mysterious | `coinSelection.js:88-101` |
| Bare, parameter-free QR | EVM QR is bare EIP-55, "no URI scheme" | `components/ui/AddressQRCode.jsx:18-19` |
| Per-asset sweep outcomes | quote → ordered loop → `{asset, status, txHash?, error?}`; one failure never aborts the rest | `frontend/src/lib/recovery/legacyKeys.js:396-450` |
| Gas reserve against a **contract** recipient | `estimateGas` against the real destination, ×1.2, same limit reused at send | `legacyKeys.js:376-391` |
| Per-instance failure isolation | One dead RPC degrades one row, never the estate | `useCustodyVaults.js:116-129` |
| `unreachable` ≠ `not found` | A dead endpoint must never say "your money isn't there" | `safeVault.js:222-253` |
| Strict chain identity | `NETWORKS[chainId]` with an explicit unknown branch, never `getNetwork()` | `useCustodyVaults.js:55-64` |
| Client records keyed (chainId, address), backed up | `{address, chainId, label, addedAt, role}` + `networkScoped: true` | `vaultReferences.js:9-36`; `syncedObjects.js:70-86` |

**Two things that are not free**: custody today has **zero** `FeeRouter` and
**zero** `ISanctionsGuard` references, and spec 061 never screens a payer.
Depositor screening is new surface, not reuse.

---

## R7. Measured gas

None of these figures existed in the repo before this research.

| Operation | Gas |
|---|---|
| `Clones.clone` mint (non-deterministic — **do not use**) | 134,605 |
| `Clones.cloneDeterministic` mint, first | 117,989 |
| Batched mint, marginal per address (n=20) | **90,299** |
| Batched mint, 20 addresses total | 1,805,981 |
| `sweepERC20`, per address | **55,742** |
| `sweepNative`, per address | **33,350** |
| Lazy deploy at a pre-funded counterfactual address | 118,001 |
| `checkBlocked` inside `receive()` (payer pays) | +13,232 |

Against the paymaster's `PM_MAX_GAS = 3,000,000`
(`services/relay-gateway/src/config/index.js:312`): roughly **33 mints** or
**53 ERC-20 sweeps** per sponsored operation before overhead. The per-account
burst limit is 6 operations/minute (`PM_ACCOUNT_QUOTA_PER_MIN`), so batching
into a single `executeBatch` is mandatory, not an optimisation.

---

## R8. Chain availability

`sanctionsGuard` is recorded on **3 of 9** deployments:

| Chain | Guard | Oracle |
|---|---|---|
| Polygon 137 | `0x2Dc53d91…` | real Chainalysis `0x40C57923…` |
| Amoy 80002 | `0xdF41355d…` | `MockSanctionsOracle` |
| Mordor 63 | `0xdF41355d…` | `MockSanctionsOracle` |
| Ethereum 1, Optimism 10, Base 8453, Arbitrum 42161, ETC 61 | **absent** | — |

Sponsorship is Polygon-only; Protect custody spans six chains. These three sets
do not coincide, so availability must be the honest intersection stated per
surface (spec FR-031 … FR-034).

**Availability hazard to design around**: the guard is fail-closed
(`SanctionsGuard.sol:45`). If the oracle is unreachable, `isAllowed` returns
false for *everyone*. For a wager entry-point that is correct. This feature
inherits it deliberately — an unreadable guard withholds rather than clears
(spec FR-032) — but the UI must never render that as "you are sanctioned"
(spec FR-029 equivalent, FR-016).

---

## R9. Registration checklist — 2 fail loud, 3 fail silent

Verified failure modes for a new contract in this repo:

**Fail loud** (the run stops):
- `scripts/deploy/verify.js` CATALOG needs **three** entries — proxy, impl, and
  the clone template — mirroring `wagerPoolFactory` / `wagerPoolFactoryImpl` /
  `poolImpl` at `verify.js:203-216`. A missing entry exits 1 on every chain
  carrying the address.
- A missing per-chain `*_CONTRACTS` block makes the sync **throw**
  (`scripts/utils/sync-frontend-contracts.js:209-216`).

**Fail silent** (no error, no coverage):
- `scripts/deploy/check-storage-layout.js:20-31` — unregistered means the
  append-only gate never covers it.
- The `isV2` mapping in `sync-frontend-contracts.js:263-286` — unmapped means
  the sync copies nothing and still reports success.
- The `test:coverage` testfiles glob in `package.json` — a new `test/<domain>/`
  directory not added is never measured.
- `medusa.json` `targetContracts` — already stale (two existing harnesses on
  disk are unlisted), and Medusa only runs in the weekly torture workflow.

Also: **Slither is non-gating** (`|| true`,
`.github/workflows/security-testing.yml:172-174`), so the security-agent review
is the real gate. Frontend ABIs are **hand-maintained**
(`frontend/src/abis/*.js`); the sync script only emits addresses.

---

## R10. Open items carried into planning

- **Real Chainalysis oracle gas** on Polygon is unmeasured; the 13,232 figure
  used `MockSanctionsOracle` (one cold SLOAD) and the production oracle is
  itself a proxy. Treat it as a floor. `test/fork/ChainalysisSanctions.fork.test.js`
  is the harness to pin it.
- **Which named venues hardcode `gasLimit: 21000`** is unverified. The EVM
  consequence is proven; the venue list is not. Check before promising "any
  exchange can pay it" — though the chosen counterfactual design sidesteps this
  entirely, since a codeless address accepts a 21,000-gas transfer normally.
- **Unknown tokens**: a receive address can be paid a token absent from
  `getPortfolioRegistry` (pure bundled config). It would be invisible on every
  balance surface and effectively unsweepable. No `Transfer`-log scan exists to
  cover this. The plan must decide whether to add one or disclose the gap.
- **`getProvider(chainId)`** (`blockchainService.js:120-126`) internally calls
  `getNetwork()`, the fallback CLAUDE.md forbids in custody code. Latent today;
  a receive address on a chain absent from `NETWORKS` would silently read the
  wrong chain.
- **OZ version**: `package.json` pins **5.4.0**, not the 5.6.1 stated in
  `CLAUDE.md`. Verify any `Clones` API against 5.4.0.
- **`eth_getLogs` limits**: depositor attribution reads `Transfer` logs filtered
  by recipient. Some providers cap the block range aggressively (a QuickNode
  Polygon 5-block cap has been observed), and log scanning needs a recorded
  deploy block per chain or it is silently dead — follow the
  `useVaultProposals.js:53-61` precedent of refusing to scan and saying so.
