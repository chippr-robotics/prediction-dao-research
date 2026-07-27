# Quickstart: Safe Receiver (Spec 070)

> ⚠️ **Superseded pending rework.** Design review found 4 critical and 18 major
> issues in this feature's design — see [review-findings.md](./review-findings.md).
> Several statements in this document are falsified there. Do not implement from it as it stands.


**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Runnable validation for the feature. The positive path proves it works; the
**negative paths prove the guarantees**, and those are the ones that matter —
this feature's value is entirely in what it refuses to do.

---

## Prerequisites

```bash
npm install
npm run compile
```

For frontend work:

```bash
cd frontend && npm install
```

Note: `npm run build` is blocked locally by `VITE_PINATA_JWT` in `.env` (CI is
clean). Frontend tests run under `TZ=UTC` for CI parity.

---

## 1. Contract suite

```bash
npx hardhat test test/receiver/
npx hardhat test test/upgradeable/SafeReceiverFactory.upgrade.test.js
```

Expected: all green, including the negative cases below.

### Coverage gate

```bash
npm run test:coverage
```

`test/receiver/**` must be in the `test:coverage` testfiles glob in
`package.json`, and both contracts must be in `coverage-threshold-policy.json`
`gated` at **Tier A** (95% statements / 90% branches). If either registration is
missing the gate passes while measuring nothing — verify the contracts appear by
name in the coverage output, not just that the command exits 0.

### Storage layout

```bash
npm run check:storage-layout
```

Must list `SafeReceiverFactory`. If it does not, the append-only gate is not
covering it and an unsafe upgrade would pass CI silently.

---

## 2. Local end-to-end

```bash
npx hardhat node          # terminal 1
npx hardhat run scripts/deploy/deploy-safe-receiver.js --network localhost
```

Then, in a hardhat console:

```js
const f = await ethers.getContractAt('SafeReceiverFactory', FACTORY)
const [member, payer] = await ethers.getSigners()

// 1. Derive — free, no transaction, no code at the address yet
const addr0 = await f.receiveAddressOf(member.address, 0)
console.log(addr0, await ethers.provider.getCode(addr0))   // 0x — codeless

// 2. Pay it as a plain address, with a bare transfer gas limit
await payer.sendTransaction({ to: addr0, value: ethers.parseEther('1'), gasLimit: 21000 })
console.log(await ethers.provider.getBalance(addr0))       // 1.0 ETH — accepted

// 3. Deploy lazily, then sweep — the member pays gas from their own account,
//    and the receive address never had to hold any
await f.deploy(member.address, 0)
const r = await ethers.getContractAt('SafeReceiveAddress', addr0)
await r.connect(member).transferOut(ethers.ZeroAddress, member.address, 0)  // 0 = all
console.log(await ethers.provider.getBalance(addr0))       // 0
```

**What step 2 proves**: the payability property. A `gasLimit: 21000` transfer
succeeds because the address has no code. This is the measured behaviour that
ruled out putting a screening `receive()` at the address — see `research.md`
§R1.2.

---

## 3. The negative paths — the actual guarantees

Each of these must **fail**, and each corresponds to a spec requirement. A green
suite that does not include these has not validated the feature.

### 3.1 The platform cannot move member funds (FR-008, FR-010, SC-016)

```js
// Upgrade the factory to a hostile implementation that tries to drain a clone
const Hostile = await ethers.getContractFactory('MockHostileReceiverFactory')
await upgrades.upgradeProxy(FACTORY, Hostile)
await expect(hostileFactory.drain(addr0, attacker.address)).to.be.reverted   // NotOwner()
```

The clone's `transferOut` is `onlyOwner`, so no factory implementation — present
or future — can reach the funds. **This is the single most important test in the
feature.**

### 3.2 A sanctioned member cannot sweep (FR-017)

```js
await guard.setDenied(member.address, true, 'test')
await expect(r.connect(member).transferOut(token, member.address, 0))
  .to.be.revertedWithCustomError(guard, 'SanctionedAddress')
// and the balance is unchanged
```

### 3.3 A sanctioned destination is refused (FR-017)

Same shape, with the destination deny-listed. Assert the error names the
destination so the UI can say which side failed (FR-028).

### 3.4 A committed counterparty is enforced by the chain (FR-018)

```js
await f.connect(member).commitCounterparty(1, acme.address)
await guard.setDenied(acme.address, true, 'test')
await expect(r1.connect(member).transferOut(token, member.address, 0)).to.be.reverted
// and: the commitment cannot be changed
await expect(f.connect(member).commitCounterparty(1, other.address))
  .to.be.revertedWithCustomError(f, 'CounterpartyAlreadyCommitted')
```

### 3.5 Screening required but unconfigured refuses to act (FR-020)

```js
// screeningRequired = true, guard = 0 must be unreachable via the setter...
await expect(f.setSanctionsGuard(ethers.ZeroAddress))
  .to.be.revertedWithCustomError(f, 'ScreeningNotConfigured')
```

...and if reached by any path, `screen` reverts rather than passing silently.

### 3.6 A published address never moves (FR-030, SC-013)

```js
const before = await f.receiveAddressOf(member.address, 7)
await upgrades.upgradeProxy(FACTORY, await ethers.getContractFactory('SafeReceiverFactoryV2'))
expect(await f.receiveAddressOf(member.address, 7)).to.equal(before)
```

And assert there is **no** `setReceiveAddressImpl` on the interface at all.

### 3.7 Value sent before deployment is fully retained

Pay an address, then deploy, then sweep, and assert the full amount arrives.
Measured at 118,001 gas for the lazy deploy (`research.md` §R7).

### 3.8 Reentrancy cannot double-spend

Sweep to a destination that reenters `transferOut` during the native send.
Assert the second call reverts and the total moved equals the balance once. Use
`contracts/mocks/ReentrantToken.sol` for the token variant.

---

## 4. Client derivation matches the chain

```bash
cd frontend && TZ=UTC npx vitest run src/lib/receiver/
```

The critical assertion: `deriveAddress.js` output equals
`factory.receiveAddressOf(owner, index)` for a spread of indices including 0 and
a large value. If these ever diverge, a member's published address points
somewhere their funds cannot be reached — verify this before anything else.

---

## 5. Clearance classifier

```bash
cd frontend && TZ=UTC npx vitest run src/lib/receiver/clearance.test.js
```

All twelve cases in [contracts/clearance-model.md](./contracts/clearance-model.md)
must be present. Spot-check the ones most likely to regress:

- Native asset ⇒ fully withheld `unattributable` (never silently cleared).
- Balance read failure ⇒ `read-failed`, asserted to **not** render as `0`.
- Screening called with `{ force: true }` — assert the flag itself, because a
  cached result passing silently is invisible in the output.
- Decomposition invariant `spendable + Σ withheld == total` — inject an
  inconsistency and assert everything withholds.

---

## 6. Availability walk (FR-031 … FR-034, SC-014)

Load Safe Receiver against each network state and confirm the wording differs:

| State | How to produce | Expected |
|---|---|---|
| enforcing | Polygon 137 config | "screened on-chain at settlement" |
| mock oracle | Amoy 80002 / Mordor 63 | described differently — materially weaker |
| no guard | a chain with the factory, no `sanctionsGuard` | segregation works; no screening claimed; names where it is available |
| unreadable | guard address with a failing provider | "temporarily unavailable" — **not** "not supported" |
| not deployed | a chain with no factory | section hidden; stated reason on deep link |

The failure this catches: collapsing "no guard here" and "guard unreadable" into
one message. They mean different things to a member deciding whether to accept a
payment.

---

## 7. Accessibility

```bash
cd frontend && TZ=UTC npx vitest run src/test/receiver.axe.test.jsx
```

Mirrors `src/test/home.axe.test.jsx`. Zero new violations.

---

## 8. Honesty review (manual, blocking)

Not automatable, and the reason this feature exists. Read every string the
member can see and confirm:

- [ ] Nothing states or implies that deposits are screened or blocked (FR-006, SC-015)
- [ ] Withheld amounts always carry a reason (FR-015, SC-007)
- [ ] "Check unavailable" never reads as "this payer is sanctioned" (FR-029)
- [ ] Public linkability of the member's addresses is disclosed (FR-007)
- [ ] Native coin's unattributability is stated, not glossed (FR-014)
- [ ] A mock-oracle network is not described like a real-oracle one (FR-033)
- [ ] No surface implies privacy or unlinkability
- [ ] A sponsored sweep is only labelled sponsored when the submission actually
      returned sponsored (FR-037)

---

## 9. Deployment validation

After deploying to a network:

```bash
npm run verify:<net>              # fails on any unregistered CATALOG key
npm run sync:frontend-contracts   # throws if the per-chain block is missing
```

Then confirm by hand — these fail **silently** if missed:

- [ ] `deployments/` records `safeReceiverFactory`, `safeReceiverFactoryImpl`,
      `safeReceiveAddressImpl`, and `constructorArgs.safeReceiverFactoryImpl = []`
- [ ] a `deployBlocks` entry exists — depositor attribution scans `Transfer`
      logs and is silently dead without it
- [ ] `frontend/src/abis/SafeReceiverFactory.js` and `SafeReceiveAddress.js`
      match the compiled artifacts (ABIs are hand-maintained; the sync script
      emits addresses only)
- [ ] `frontend/src/config/contracts.js` carries the address for this chain
