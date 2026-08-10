# The address scheme: what it guarantees, and where it stops

The contract this feature offers to the rest of the repository. Guarantees are stated with their
boundaries, because a determinism guarantee that is quietly conditional is worse than none — it gets
trusted.

---

## G1 — An address does not depend on where its source lives

Moving a file, renaming a directory, or changing build tooling does not move any address.

**Boundary**: it *does* depend on the contract's code, the compiler version, and the optimizer/EVM
settings. A compiler bump moves every address and must be treated as an address-moving event, not as
routine maintenance.

**How it holds**: compiled output no longer embeds a fingerprint of the source. Measured — the
appended block carries the compiler version and nothing else.

---

## G2 — An address is known before deployment

Every contract's address is computable without contacting a chain, and a deployment that lands
somewhere else fails loudly.

**Boundary**: computable *given the salt and the compiled bytes*. It says nothing about whether the
address is free on a target chain — that is G3.

---

## G3 — A deployment never silently does something else

| Situation | Behaviour |
|---|---|
| address free | deploy, verify it landed as predicted |
| address holds our contract | recognised as already deployed, skipped |
| address holds something else | **incident** — stop, do not proceed |
| deployment facility absent on the chain | **stop before deploying** — never fall back to a non-deterministic deploy |

The last row is the one worth stating explicitly. A silent fallback would produce a working
deployment at an unpredictable address, which is precisely the drift this feature exists to end, and
it would look like success.

---

## G4 — Configuration does not influence an address

Two chains configured differently get the same address for the same contract.

**Boundary**: this is *why* deployment and configuration are separate steps, and separating them is
what would otherwise open a window for someone else to configure first. G5 closes it.

**Trap**: the intuitive fix for G5 — putting configuration back into the constructor — would destroy
G4. The two guarantees must be read together.

---

## G5 — There is no moment when a contract is deployed but unconfigured

Deployment and configuration occur in one transaction, so the window is absent rather than narrow.

**Boundary**: this covers configuration performed as part of deployment. Later administrative changes
are a separate concern with their own access control.

**Not "low risk, accepted"**: the window does not exist today — this feature would create it. Closing
it is therefore a matter of not introducing a hazard, not of eliminating an existing one.

---

## G6 — The upgrade-safety gate keeps its coverage

Deploying deterministically must leave the storage-layout gate reaching **at least** as many live
implementations as before.

**Why it is a guarantee and not an implementation note**: the gate resolves layouts through the
upgrades plugin's manifest, written at deploy time. Deploying proxies another way writes no entry, so
every contract deployed the new way would become undiffable — **and the gate would keep passing**,
reporting success over shrinking coverage.

**How it holds**: every deterministic proxy deployment records its layout explicitly, and the coverage
count is asserted rather than assumed.

**This is the guarantee most likely to be broken silently.** Treat a drop in coverage as a failed
deployment, not as a reporting quirk.

---

## G7 — The estate's state is reported honestly

Every contract is classified as consistent, inconsistent, or a recorded exception. None unclassified.

| Report says | Means |
|---|---|
| consistent | same address everywhere it is deployed, at the deterministic address |
| inconsistent | differs across chains, or is not at its deterministic address |
| exception — stateful | holds live state; cannot move under any scheme; permanent |
| exception — transitional | deterministic today, moving to a new deterministic address |
| unknown | a chain was unreachable — **not** the same as absent |

**Boundary**: the report describes; it does not fix. 48 of 51 contracts are currently inconsistent
and will remain so until they are deployed under the scheme.

---

## What this scheme does not promise

- **It does not make already-deployed contracts consistent.** Nothing moves. A cohort becomes
  consistent when contracts are deployed under the scheme, which is separate work.
- **It does not survive a compiler change.** See G1's boundary.
- **It does not make stateful contracts movable.** They are permanent exceptions.
- **It does not make configuration identical across chains.** Configuration stays chain-specific by
  design; it simply stops determining addresses.
