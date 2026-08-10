# Phase 0 Research: Deterministic, cohort-wide contract addresses

Measured, not inferred. Where something was not measured it says so.

---

## R1: How to make compiled output path-independent

**Measured.** With `metadata: { bytecodeHash: "none" }` on the 0.8.24 profile:

| | metadata block | runtime code | CBOR content |
|---|---|---|---|
| before | 51 bytes | 2,090 | `a2 "ipfs" <34-byte multihash> "solc" 000818` |
| after | **10 bytes** | **2,090** | `a1 "solc" 000818` |

The source fingerprint is gone; the compiler version is all that remains. **90 of 96 contracts change**
on that profile alone.

**Decision: `bytecodeHash: "none"`, not `appendCBOR: false`.**

**Rationale**: `appendCBOR: false` removes the block entirely, which buys nothing extra for the goal —
the *code itself* still varies with compiler version, so dropping the version marker does not make
addresses survive a compiler bump. It only makes verification harder by removing the marker verifiers
use to pick a compiler. `"none"` achieves path-independence, which is the actual requirement, and
retains a useful marker.

**Consequence to carry (FR-004)**: after this change the remaining address-moving inputs are the
contract's own code, the compiler version, and the optimizer/EVM settings. A compiler bump is
therefore an **address-moving event** and must be recognised as one — which is a stronger reason for
the exact pinning spec 075 already requires.

---

## R2: Bypassing the upgrades plugin would gut the storage-layout gate

**This is the constraint that most shapes the design, and it is easy to miss.**

`scripts/deploy/check-storage-layout.js` resolves each deployed layout **through the plugin's network
manifest** — its own header says so:

> That call resolves the deployed layout through the network manifest for the CONNECTED chain …
> An implementation recorded in `deployments/` with no layout in any `.openzeppelin/` manifest cannot
> be diffed.

That manifest is written by `upgrades.deployProxy` **at deploy time**. So deploying proxies through a
CREATE2 factory instead — which is the entire point of this feature — writes no manifest entry, and
every contract deployed the new way silently becomes undiffable. The gate would keep passing while
covering less, which is the worst possible failure mode for a safety gate and exactly the class this
repository has been bitten by twice (#1084, #1090).

**Decision**: every deterministic proxy deployment must record its layout explicitly. The plugin
exposes what is needed — confirmed present in the installed version:

```
validateImplementation   (already used by the gate at check-storage-layout.js:309)
deployImplementation
forceImport
```

Flow: validate the implementation → deploy implementation and proxy via CREATE2 → **`forceImport` the
proxy** so the manifest records its layout → then the existing gate works unchanged.

**Verification obligation**: the deterministic path must be proven to leave the gate's coverage count
**no lower than before**. A deploy that raises the undiffable count is a regression, not a side
effect.

**Alternatives considered**: teaching the gate to read layouts from compiled artifacts instead of the
manifest (rejected — it would stop comparing against what is *actually deployed*, which is the whole
point); accepting reduced coverage (rejected outright — it protects 26 live implementations).

---

## R3: Proxy address parity requires init data out of the constructor

**Measured.** Initializers take chain-specific addresses:

```
FeeRouter.initialize(address admin, address treasury_)
MiniAppRegistry.initialize(address admin, address curator, address membershipManager_, …)
CallsignRegistry.initialize(address admin_, address membershipManager_, address sanctionsGuard_, …)
```

A proxy's CREATE2 address derives from its initcode, which is the proxy's creation bytecode **plus its
constructor arguments** — and those arguments are `(implementation, initData)`. With `initData`
carrying the values above, two chains configured differently get different proxy addresses **even
though both used CREATE2**. That is why "just use the factory" does not reach the goal.

**Decision**: deploy the proxy with **empty init data**, so its initcode depends only on the
implementation address, then initialize in a separate call. Address parity then reduces to
implementation parity, which R1 + CREATE2 provides.

**This is what creates the window** the spec's US3 closes: between deployment and initialization the
proxy is uninitialized and anyone may call `initialize` first.

---

## R4: Closing the window — atomic deploy-and-init

**Decision**: a small factory contract that, in one transaction, CREATE2-deploys the proxy and calls
`initialize`. The factory is itself deployed through the Safe Singleton Factory, so it has the same
address on every chain and can be reasoned about once.

Because both actions occur in a single transaction, **there is no observable state in which the proxy
exists uninitialized** — no window to front-run, rather than a narrow one. This satisfies FR-012
without relying on the project being too small to be a target.

**FR-015 is the constraint that makes this non-obvious**: closing the window must not move the
address. It does not, because the proxy's initcode is still `(implementation, "")` — the factory
calling `initialize` afterwards is a *message call*, not part of the initcode. Naively "fixing" the
window by putting init data back into the constructor would close it and destroy parity at the same
time. That trap is the reason FR-015 exists.

### R4a: Authority model — DECIDED: permissioned

**Decision (2026-08-09): the factory is permissioned.** Only an authorised deployer may use it.

**The trap this decision walks into, and the constraint that avoids it.** A factory's own address is
derived from its initcode, which includes its constructor arguments. So embedding an owner makes the
**factory's address a function of that owner** — and if the owner were chain-specific, the factory
would land at a *different address on every chain*, destroying the determinism it exists to provide.
A permissioned factory implemented naively defeats the entire feature.

**Why it is nonetheless safe here — measured**: the deployer is a single address across the whole
estate, identical on all 7 chains that record one:

```
amoy · arbitrum · base · mainnet · mordor · optimism · polygon
  -> 0x52502d049571C7893447b86c4d8B38e6184bF6e1   (1 distinct deployer)
```

**Binding requirement**: the authorised party embedded in the factory MUST be an address that is
identical on every chain in the cohort. This is a property of the *scheme*, not an implementation
detail — a future move to a per-chain admin (a Safe deployed at differing addresses, for instance)
would silently fork the factory address. The design must therefore either embed a chain-independent
address, or bind authority to `msg.sender` via the salt so nothing is embedded at all.

**Consequence to carry into the security review (FR-021 / T030)**: the authorised party today is a
**hot EOA**, and issue #966 already records that every live contract is admin-ed by that one key.
This decision adds another privileged position to it. That is a reason to sequence the admin handoff,
not a reason to reverse the decision — but the review must consider it explicitly rather than
inheriting it silently.

**Alternative not taken**: permissionless, with the salt providing uniqueness. Simpler and adds no
privileged position, but any party could occupy a predicted address first — and because addresses are
now *published in advance* by design, that is a materially easier target than it would be otherwise.
The permissioned model was chosen for that reason.

---

## R5: Adopting this moves the five contracts that are deterministic today

An honest consequence that must not be buried: the five contracts with genuine CREATE2 cross-chain
parity — `safeProposalHub` (6 chains), `backupPointerRegistry`, `openERC20Impl`, `openERC721Impl`,
`restrictedERC20Impl` — derive their addresses from bytecode that this change alters.

**Nothing deployed moves.** But a *future* deployment of one of them lands at a new address, different
from its existing siblings. So for those five, adopting the scheme temporarily makes parity worse
before a redeployment makes it better.

**Decision**: record these five explicitly as being in a transitional state, with both the legacy
address and the new deterministic address. Do not present them as consistent when they are mid-move.

This is the sharpest illustration of the spec's core assumption: the scheme is established here, and
the estate becomes consistent only when contracts are deployed under it.

---

## R6: Both compiler profiles, and the account-stack caveat

The repository has two profiles: 0.8.24 (the bulk) and 0.8.23 (the vendored account closure, spec
041). The measurement covered only 0.8.24 — hence "90 of 96".

**Decision**: both adopt the setting, so no contract is left with a path-dependent address.

**Caveat requiring care**: `accountFactory` and `accountImpl` share one address across **8 chains**
today — via plain CREATE (deployer + nonce), so bytecode is not currently an input. Moving them onto
CREATE2 *makes* bytecode an input to an address that member wallets derive from. The passkey account
address a member holds is a function of the factory address, so this must not be changed casually.
Treated as its own decision in the design phase, not folded into a sweep.

---

## R7: Verification impact

Removing the source fingerprint means a verifier comparing embedded provenance reports a **partial**
rather than exact match. Verifiers that recompile from declared settings (Etherscan, Blockscout —
both already used by `scripts/deploy/verify.js`) are unaffected, because the setting is part of the
declared compiler input they replay.

**Decision**: accept, and record it in the deploy runbook so a future partial-match result is
recognised as expected rather than investigated as an incident. The repository has already accepted a
partial-match consequence once, deliberately, for the same class of reason (PR #1089).

---

## R8: Salt scheme and collisions (FR-011)

The existing `generateSalt` / `SALT_PREFIXES` in `scripts/deploy/lib/constants.js` already tenant-
prefixes salts (spec 072), so tenants get distinct addresses from the same contract — a property to
preserve, not remove.

**Decision**: keep the existing scheme and add a **collision check** — two identifiers must not map to
one salt, and the check must fail the build rather than the deploy. A collision discovered at deploy
time has already cost a transaction; discovered at build time it costs nothing.

**Not measured**: whether any current identifier pair collides. Must be checked before the scheme is
relied upon.

---

## R9: What is in scope, and what is permanently not

**In scope**: contracts intended to exist on more than one chain and not yet holding live state on a
given chain.

**Permanently out** — stateful contracts already deployed cannot move regardless of scheme, because
their state and value live at their current address. From the deployment records these include
`wagerRegistry` and `membershipManager` (live wagers and memberships), and in practice every proxy
already carrying user state on a given chain.

**Decision**: these are recorded exceptions with reasons (FR-016), reported as exceptions rather than
as gaps, and never counted toward or against consistency. The spec deliberately does not promise they
will be cleaned up, because they will not be.
