# Quickstart: proving the address scheme

Each scenario maps to a guarantee in [contracts/address-scheme.md](./contracts/address-scheme.md) and
a success criterion in [spec.md](./spec.md).

**Two standing rules**, both from defects this repository has actually hit:

- **Delete `artifacts/` and `cache/` before any byte comparison.** The digest gate has been observed
  reporting `OK` on stale artifacts after a *failed* compile (#1090).
- **A gate passing is not evidence it still checks anything.** Every gate below is mutation-tested:
  break the property, confirm the failure.

---

## S1 — Executable code is unchanged *(G1 / SC-001, FR-002)*

The stop condition. Capture before, adopt the setting, compare after.

```bash
rm -rf artifacts cache && npm run compile
cp -r artifacts /tmp/artifacts-before
# adopt metadata: { bytecodeHash: "none" } on BOTH compiler profiles
rm -rf artifacts cache && npm run compile
node scripts/codegen/compare-stripped.js /tmp/artifacts-before artifacts
```

**Expected**: per-contract report, all identical after stripping the appended block.

**Reference values** measured on 0.8.24:

| | metadata block | runtime | CBOR |
|---|---|---|---|
| before | 51 B | 2,090 B | `a2 "ipfs" <34B> "solc" 000818` |
| after | **10 B** | **2,090 B** | `a1 "solc" 000818` |

**If any contract's stripped code differs**: stop. That is behaviour change, and the safety argument
does not cover it.

---

## S2 — Moving a file moves no address *(G1 / SC-002)*

The property the whole feature rests on. **Do this before relying on any predicted address.**

```bash
node scripts/deploy/predict-addresses.js > /tmp/addresses-before.json
git mv contracts/access/SanctionsGuard.sol contracts/access/guards/SanctionsGuard.sol
# update importers
rm -rf artifacts cache && npm run compile
node scripts/deploy/predict-addresses.js > /tmp/addresses-after.json
diff /tmp/addresses-before.json /tmp/addresses-after.json && echo "PASS: zero addresses moved"
git checkout -- . && git clean -fd contracts/access/guards 2>/dev/null
```

**Expected**: no diff. Before the change this test *should* fail — run it both ways, because a test
that cannot fail proves nothing.

---

## S3 — Predictions match reality *(G2)*

A free correctness check: ten contracts are already deployed deterministically, so predictions can be
checked against chains rather than against the tool that produced them.

```bash
node scripts/deploy/predict-addresses.js --compare-deployed
```

**Expected**: every already-CREATE2 contract's prediction matches its recorded address — **using the
pre-change bytecode**. After the metadata change these five deliberately diverge (they become
`transitional`, R5), which is the point of S6.

---

## S4 — Identifier collisions fail the build *(G2 / FR-011)*

```bash
# temporarily give two contracts the same identifier
npm run compile      # or the dedicated check
# expected: FAILS at build time, naming both contracts
```

**Not acceptable**: discovering this at deploy time. By then a transaction has been spent and one
contract is sitting at the other's address.

---

## S5 — Parity is real, not coincidental *(G4 / SC-004)*

**Two disposable chains with *different transaction histories*.** A single chain, or two fresh chains,
would pass even if addresses still depended on the deployer's nonce — so it would prove nothing.

```bash
npx hardhat node --port 8545 &        # chain A
npx hardhat node --port 8546 &        # chain B
# advance B's deployer nonce so the two histories differ
node scripts/ops/burn-nonce.js --network localhost8546 --count 7
npm run deploy:local -- --network localhost8545
npm run deploy:local -- --network localhost8546
diff <(jq -S . deployments/localhost8545.json) <(jq -S . deployments/localhost8546.json)
```

**Expected**: identical addresses for every contract whose configuration does not differ.

**If they differ**: the nonce is still an input somewhere — the deployment did not go through the
deterministic path.

---

## S6 — The upgrade-safety gate did not quietly lose coverage *(G6)*

**The most likely silent failure in this feature.** The gate resolves layouts through the upgrades
plugin's manifest; deploying proxies another way writes no entry, so contracts become undiffable
**while the gate keeps passing**.

```bash
npm run check:storage-layout | tail -3
```

**Expected**: `26 live implementation(s) diffed`, `4 declared unverifiable`, 7 chains, exit 0 —
**the count must not drop**. Then prove it still bites:

```bash
# insert a slot above existing state in a UUPS contract and shrink __gap
npm run check:storage-layout    # expected: FAILS, naming contract + live impl
git checkout -- contracts/
```

Then confirm the new path records layouts:

```bash
# deploy a proxy deterministically to a disposable chain, then:
ls .openzeppelin/            # expected: a manifest entry exists for it
```

---

## S7 — No window between deploy and initialize *(G5 / SC-005)*

Prove by **attempting to interpose**, not by reading code.

```bash
# from a second account, attempt to initialize the proxy the factory is deploying
node scripts/ops/attempt-init-race.js --network localhost8545
```

**Expected**: impossible — there is no block in which the proxy exists uninitialized. A test that
merely observes "it was initialized" does not distinguish *no window* from *a window nobody used*.

Also confirm FR-015 — closing the window did not move the address:

```bash
node scripts/deploy/predict-addresses.js --compare-deployed
```

---

## S8 — Deployment refuses to do something else *(G3)*

```bash
# occupy a predicted address with an unrelated contract, then deploy
# expected: STOPS, reports the address as occupied by something unexpected
# re-run a completed deployment
# expected: recognised as already deployed, skipped, no transaction
# point at a chain with no deployment facility
# expected: reports it unavailable BEFORE deploying; never falls back
```

The last is the important one: a silent fallback produces a working deployment at an unpredictable
address and looks like success.

---

## S9 — The estate report classifies everything *(G7 / SC-008)*

```bash
node scripts/ops/estate-consistency.js
```

**Expected**: all 51 contracts classified — consistent, inconsistent, exception (stateful),
exception (transitional), or unknown. **Zero unclassified.**

Sanity checks against what is already known:

- 48 contracts reported as present on some chains but not all
- `wagerRegistry`, `membershipManager` → exception (stateful)
- the five CREATE2 contracts → exception (transitional), **not** consistent
- `accountFactory` / `accountImpl` → inconsistent-by-mechanism, not exceptions: they share an address
  on 8 chains by nonce coincidence, which is not a guarantee

Then confirm honesty about the unknown:

```bash
# point one chain at an unreachable endpoint
node scripts/ops/estate-consistency.js
# expected: that chain reported UNREACHABLE — never as "contract absent"
```

---

## S10 — Nothing was deployed to a live chain *(FR-020 / SC-006)*

```bash
git diff --stat origin/main -- deployments/ | grep -v localhost || echo "PASS: no live-chain records changed"
```

**Expected**: no changes to any live network's record. This feature establishes and proves the scheme;
deploying the estate under it is separate work.
