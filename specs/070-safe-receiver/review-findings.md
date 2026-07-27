# Design Review Findings — Safe Receiver (Spec 070)

**Date**: 2026-07-27
**Status**: **OPEN — the design in `plan.md` and `contracts/*.md` does not yet hold.**
**Method**: 4 independent adversarial reviewers (security, honest-state, completeness, repo-fact-check) against `spec.md` / `plan.md` / `research.md` / `data-model.md` / `contracts/*` / `quickstart.md`, then per-finding verification against the repo. 36 findings verified, **31 upheld, 5 refuted**. 26 further verifications did not run (session limit) — their candidate findings are listed in §5 as unverified.

Read this before resuming. Several findings falsify claims the design documents currently assert, so the documents are wrong as written, not merely incomplete.

---

## 1. Critical — the design does not currently hold

### C1. The platform can freeze every member's funds

The clone's `transferOut` is its only exit and calls back into the **upgradeable**
factory (`screen(owner)`, `screen(to)`, `committedCounterparty(...)`) before any
transfer, with no try/catch and no rescue by construction. Anything that makes
those calls revert freezes 100% of member funds permanently.

Two one-transaction triggers, both behind a single key
(`UUPSManaged.sol:32-37` grants `DEFAULT_ADMIN_ROLE` and `UPGRADER_ROLE` to the
same address):

- `UPGRADER_ROLE` upgrades the factory to an implementation whose `screen()`
  reverts unconditionally.
- `DEFAULT_ADMIN_ROLE` calls `setSanctionsGuard(x)` with any codeless or
  reverting address — the only stated validation is the zero-address case.
  (Verified empirically: a void-returning external call like `checkBlocked`
  emits `EXTCODESIZE` under the repo's solc 0.8.24, so a codeless guard
  **reverts** rather than silently no-oping.)

A **third** trigger needs no platform key at all: `SanctionsGuard` is fail-closed
(`SanctionsGuard.sol:45,99`), so a Chainalysis oracle outage reverts
`checkBlocked` for everyone. On an exit path, "fail closed" is a fund freeze,
not a withhold — which contradicts `spec.md`'s own Assumption that the
fail-closed behaviour is inherited safely.

**The design inverts its own cited precedent.** `WagerPool.sol:225-227` screens
only on the ENTRY path; its exits `_claimBy` (`:415-427`) and `_refundBy`
(`:447-455`) make **no** factory call. The shipped precedent deliberately keeps
the upgradeable factory off the withdrawal path. Spec 070 puts it on the only
withdrawal path while citing that precedent as straightforward reuse.

Falsifies: FR-008 ("no platform key may … freeze"), and the "cannot move,
freeze, or redirect a single wei" sentence in `plan.md:28`, `plan.md:190`,
`data-model.md:72`, `ISafeReceiverFactory.md:10`.

**Unfixable after deployment**: the clone is immutable, so remediation needs a
new factory + template, which moves every derived address and orphans any
address already printed on an invoice (breaking FR-030, SC-013).

**Direction**: make `SafeReceiverFactory` **non-upgradeable**, exactly as
`SafePolicyGuardV2.sol:36` does for the identical reason (which `research.md`
§R6 already cites approvingly). Pinning the guard into clone immutable state is
necessary but **not sufficient** — it leaves the fail-closed oracle trigger open.
The exit path needs a liveness answer for a dead oracle.

### C2. `receiveAddressImpl` is not immutable

It is ordinary UUPS proxy storage. "Set by `initialize` … no setter" is a
property of *one implementation*, not of the proxy — any upgrade can rewrite the
slot, change the ERC-1167 init-code hash, and move every derived address.
`ISafeReceiverFactory.md` invariant #1, FR-030 and SC-013 are asserted with
nothing enforcing them.

Widened by the verifier: pinning the template alone still leaves a hostile-owner
deploy path, because the upgradeable factory is the CREATE2 deployer and chooses
the `owner` passed to `initialize`. Derivation **and** deployment authority must
leave upgradeable code together.

Compounding: `frontend/src/config/contracts.js` carries no `*Impl` slot, so the
client cannot obtain the template address through the normal sync pipeline —
which client-side derivation requires (see also M-fact-1 in §3).

### C3. A deployed address stops accepting the payments the feature exists to accept

`ISafeReceiveAddress.md` invariant #5 — "`receive()` accepts a plain 21,000-gas
transfer **once deployed**" — is **false, and is falsified by this feature's own
`research.md` §R1.1**. A deployed ERC-1167 stub pays ~2,600 gas for a cold
`DELEGATECALL` before the empty `receive()` body runs. After the design's own
lazy-deploy step a published address permanently stops accepting bare
`gasLimit: 21000` transfers, and `.transfer()`/`.send()` from contract payers
fail — the latter *silently*, which `research.md` §R1.2 itself calls "the worst
failure mode in the entire design space".

**Requires a product decision** (raised with the owner, not yet answered):
rotate-on-sweep so every advertised address is always codeless (matching spec
061's never-reuse rule), keep persistent per-payer addresses and disclose the
degradation, or rotate the address behind a stable label.

### C4. Recovery cannot bound its walk, and can reissue a published address

No artifact defines how a fresh device learns **how many** indices were issued.
The cursor is `max(local records) + 1`, which is 0 on a device with no records
and no backup, so recovery cannot bound a derive-and-probe walk.

An index that was issued and published but never paid and never deployed has
**no on-chain trace at all** and is unrecoverable by any mechanism the design
describes — so a no-backup recovery rebuilds a cursor below it and reissues that
address to a different counterparty.

Falsifies: FR-003/SC-004 (never reissue) and FR-027/SC-012 (100% recovery with
no local data). `data-model.md` §3.2 and `research.md` §R5 currently claim the
Bitcoin reissue hazard "does not apply" / "disappears" — **delete those claims**.
Deterministic derivation removes Bitcoin's *discovery* weakness; it does not
remove *cursor* loss.

Note: an on-chain `issuedCount` bumped at issuance would conflict with FR-001
("at no cost and with no transaction").

---

## 2. Major — 18 upheld

### Contract semantics

- **M1. Permissionless `deploy(owner, index)` is a griefing weapon.** Addresses
  are publicly enumerable by design, so anyone can irreversibly place code at a
  chosen member's entire future index range and destroy bare-transfer payability
  (C3 weaponised). → gate on `msg.sender`; add an EIP-712 `deployWithSig` twin
  via `SignerIntentBase.sol` for the sponsored path.
- **M2. `amount == 0 ⇒ entire balance` moves withheld value by construction**,
  resolving the balance at mining time — including value that arrived after
  clearance was computed. Contradicts FR-023, SC-006 and the balance-changed
  edge case. → the app must never pass 0; consider `ZeroAmount()` (consistent
  with `StakingRouter.sol:228`).
- **M3. `commitCounterparty` is an irreversible fund trap.** Write-once with no
  clear, screened on every `transferOut`: a counterparty that later becomes
  deny-listed permanently freezes that address in an immutable contract with no
  rescue. It also buys little — the counterparty is member-asserted and never
  verified against who actually paid, so it constrains only honest members.
  → timelocked clear (request → 7 days → clear), both evented.
- **M4. `SanctionedAddress` cannot distinguish "sanctioned" from "oracle
  unreachable"** — the guard is fail-closed, so both produce the identical
  revert. `spec.md`'s edge case, FR-032, `research.md` §R8 and
  `clearance-model.md`'s wording rules have **no mechanism behind them**.
  → client-side three-way disambiguation using `isDenied()` + `sanctionsOracle()`
  + an oracle probe. Probe the oracle's *answer*, not just its presence, or a
  genuine Chainalysis hit is under-accused as "unavailable".

### Clearance and availability

- **M5. The decomposition invariant fires after any partial spend.** Steps 6–8
  compare full inbound history against current balance with no accounting for
  outflow, so `Σ deposits > balanceOf` and step 8 permanently withholds the
  entire remainder under a fabricated `read-failed`. This breaks US4, the
  feature's own partial-spend story. → net outflow into `accounted`, or
  attribute against `total` explicitly.
- **M6. `ReceiverAvailability` ignores `screeningRequired`.** The reachable
  state (guard deployed, readable, real oracle, `screeningRequired == false`)
  renders as `available-enforcing` — "screened on-chain at settlement" — while
  `screen()` is a documented no-op. Fix the **contract semantics first**;
  patching only the client ratifies a `screen()` behaviour that contradicts both
  FR-017 and the `WagerPoolFactory.sol:285-291` precedent it cites.
- **M7. `available-mock-oracle` has no detection design.** Nothing says how the
  client tells a real Chainalysis oracle from `MockSanctionsOracle`, so
  `availability.js` cannot produce the state FR-033 exists for. (Accessor is
  `sanctionsOracle()`, not `oracle()`.)

### Native coin — two upheld findings, same root

- **M8/M9. Native has no exit path.** `clearance-model.md` step 4 withholds 100%
  of native permanently as `unattributable`; FR-023/SC-006 forbid sweeping
  withheld value; the withheld-only-address edge case forbids even offering a
  sweep. Yet `spec.md` invites native (US1 AS-2), states an edge case
  ("retained in full and is sweepable") that is false for it, and `quickstart.md`
  §2 ships a native sweep as the canonical happy path. **Requires a product
  decision** (raised, unanswered): member attestation, acknowledge-and-sweep, or
  tokens-only. Whichever is chosen, the consequence must be disclosed *before*
  the member publishes an address.

### Batching, gas and recovery

- **M10/M11. Per-item failure isolation is unachievable on the passkey rail.**
  `CoinbaseSmartWallet.executeBatch` bubbles any inner revert, so one item's
  `NothingToTransfer()` / `SanctionedAddress` / `NativeTransferFailed()` reverts
  the whole batch — contradicting FR-022/SC-011 and `plan.md`'s own "Batch
  semantics" paragraph. → make `transferOut` return `bool moved` instead of
  reverting on zero, and manufacture isolation client-side by pre-flight
  filtering before submission. State the atomicity honestly.
- **M12. "Gas is paid once" is false for classic wallets.** The first sweep of
  each address is two signed transactions (`deploy` then `transferOut`), so
  collecting from N payers costs up to 2N. FR-021 and US3's narrative overstate
  it; SC-010 is already worded correctly. Also: `research.md` §R7's "53 ERC-20
  sweeps per sponsored op" omits the lazy deploy and is ~3× optimistic.
- **M13. FR-027 is internally contradictory.** The non-batching fallback bounds
  reads by local state that does not exist on a fresh device, so recovery must
  either scan (forbidden by FR-027) or be silently partial (forbidden by
  SC-012). → split into FR-027a (derivation is scan-free — holds) and FR-027b
  (discovery, narrowed and honest).
- **M14. Backend-free recovery breaks across the design's own upgrade path.**
  `plan.md` mandates that a new template ships as a new factory, but nothing
  records the historical generation set, and `getContractAddressForChain`
  returns exactly one address per key per chain. Addresses from generation 1
  become underivable after generation 2 ships. → carry an ordered per-chain
  generation list, or use coexisting versioned keys (the spec-068 precedent).
- **M15. Retirement has a field and a lifecycle arrow but no flow** — no FR, no
  UI, no semantics, and no mechanism that can uphold "never reissued after
  retirement" across a fresh-device recovery.

---

## 3. Minor — 9 upheld

- **Fee-on-transfer invariant is unsatisfiable.** `ISafeReceiveAddress.md`
  invariant #7 promises exact-or-revert, but `SafeERC20.safeTransfer` validates
  only the return value. It also cites a `spec.md` edge case that does not
  exist, and `TransferredOut` reports the requested amount, not the delivered
  one. → report delivered rather than revert; reverting would permanently strand
  such tokens in a no-rescue clone.
- **`clearance-model.md` step 7's `'unavailable'` branch is unreachable** —
  `useAddressScreening` emits only `clear | restricted | uncertain`, so
  `screening-unavailable` is never produced and the document's own test cases 4
  and 10 cannot pass. Fail-safe, but the doc is wrong.
- **The "never word uncertainty as guilt" rule is anchored to nothing.** Six
  documents assert it citing FR-028/FR-029, which are about backup labels and
  address-ownership lookup. → add a real FR.
- **Hiding the section entirely on undeployed networks** is the "silently inert
  surface" FR-034 forbids, and a member with funded addresses elsewhere gets no
  signal. → follow the CustodyPanel pattern the plan already cites, not
  Collect/Predict.
- **`screening-not-configured`'s "recoverable by switching networks"** names an
  action that cannot recover the value.
- **No disclosure of confirmation count** before the first signature on the
  classic rail, while the sponsored rail has exactly that duty (FR-037).
- **Portfolio aggregation** is neither designed nor declared out of scope.
- **The new "Receive" nav label already means Bitcoin rotating addresses
  in-product** (`NetworkPanel.jsx:19`). Two of the reviewer's sub-claims were
  wrong (Request is not under Transfer and is not a nav item), but the label
  collision is real.
- **`deployBlocks` names the wrong store** in the registration checklist.

---

## 4. Refuted (5)

Recorded so they are not re-raised: five candidate findings did not survive
verification, including the US7 batch-split sizing sub-claim and parts of the
nav-collision framing.

---

## 5. Unverified candidates (26)

The verification pass hit the session limit before reaching these. They come
from the same reviewers and are plausible but **unconfirmed** — verify before
acting. Themes: `__gap` sizing vs `UUPSManaged`'s own 50-slot reservation;
Multicall3 config absence; the `evmVersion: paris` citation in `research.md`
§R1.1; the `screeningRequired == false` row's divergence from
`WagerPoolFactory` semantics; missing address-book / activity-ledger /
notification integration; no admin surface or role-handoff plan for the
factory's setters; no oracle-outage runbook; FR-018 vs FR-019 reconciliation;
three FR citations in the contract docs pointing at the wrong requirements;
forced-screening call volume; and several `quickstart.md` coverage gaps.

Full detail: workflow run `wf_6ce24ec2-e82`.

---

## 6. What survives

The **product framing is not in question**. Nothing here challenges:

- the measurements in `research.md` §R1 (deposit screening is undeliverable),
- segregation-with-spend-time-control as the honest reframe,
- one-address-per-payer as the mechanism that makes token attribution tractable,
- dropping change addresses,
- accepting and disclosing public linkability.

What failed review is the **contract architecture and several algorithm
details** — principally putting an upgradeable factory on the only exit path,
treating proxy storage as immutable, and asserting a payability property the
feature's own research refutes.

## 7. Resuming

1. Answer the two open product questions (C3 address reuse, M8/M9 native coin).
2. Rework the contract architecture around a non-upgradeable derivation +
   deployment authority (C1, C2, M1) and give the exit path a dead-oracle
   liveness answer.
3. Fix the algorithm defects (M2, M4, M5, M6) and the recovery model (C4, M13,
   M14, M15).
4. Correct every falsified claim in `plan.md`, `data-model.md`,
   `contracts/*.md`, `research.md` §R5 and `quickstart.md` — several documents
   currently assert things that are not true.
5. Re-run `/speckit-analyze` once the artifacts agree again.
