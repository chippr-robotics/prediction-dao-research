# Contract: `ISafeReceiveAddress`

> ⚠️ **Superseded pending rework.** Design review found 4 critical and 18 major
> issues in this feature's design — see [review-findings.md](../review-findings.md).
> Several statements in this document are falsified there. Do not implement from it as it stands.


**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

The member's receive address. An ERC-1167 minimal clone of an **immutable**
template, deployed lazily by `SafeReceiverFactory` at a deterministic address.

**Deployment key** (template only): `safeReceiveAddressImpl`
**Clones are never recorded in `deployments/` or `contracts.js`** — they are
derived, not registered.

---

## The one invariant that matters

```
transferOut  requires  msg.sender == owner
```

**Not `onlyFactory`.** The factory supplies screening configuration and is never
consulted for authorization. Consequences, all of them intended:

- A hostile factory upgrade cannot move a single wei (FR-008, FR-010, SC-016).
- There is no platform rescue path. The member's own `transferOut` is the only
  exit — the absence *is* the safety property, following `IBridgeRouter.sol:10-13`
  (FR-009).
- Batching is the member's account's job, not the factory's. A passkey account
  batches with `executeBatch`; a classic wallet sends sequentially.

`owner` is written once at `initialize` and has **no setter and no transfer**.

---

## Lifecycle

```solidity
function initialize(address owner_, address factory_) external initializer;
```

Called by the factory immediately after `cloneDeterministic`. The template's
constructor calls `_disableInitializers()` so the template itself can never be
initialized or used to hold value.

**Reverts**: `ZeroAddress()` on either argument; re-initialization reverts via
the initializer guard.

Because `initialize` is called in the same transaction as the clone deployment
and the derived address depends only on `(owner, index)`, there is **no
initialization front-running surface** — a front-runner who deploys the clone
first still produces a clone owned by the salt's owner.

---

## Receiving

```solidity
receive() external payable;
```

**Deliberately empty.** No screening, no event, no bookkeeping.

This is the direct consequence of `research.md` §R1:

- Screening here cannot fit the 2300-gas stipend a `.transfer()`/`.send()` payer
  forwards, so it would lock out contract payers and — worse — make `.send()`
  payers lose money silently.
- It would achieve nothing for tokens, which invoke no recipient code at all.
- Any code here, even an event, breaks payers that hardcode a 21,000-gas limit.

Keeping it empty maximises payability (FR-002). Deposits are unscreened, the
feature says so plainly (FR-006), and the control lives at `transferOut`.

There is no `fallback()`. An unexpected call with data reverts rather than being
silently accepted.

---

## Moving funds out

```solidity
function transferOut(address token, address to, uint256 amount) external;
```

The only path by which value leaves. `token == address(0)` means the network's
native coin. `amount == 0` means the entire balance of that asset.

**Order of operations** (checks-effects-interactions; every check precedes every
transfer):

1. `msg.sender == owner`, else `NotOwner()`
2. `to != address(0)`, else `ZeroAddress()`
3. `factory.screen(owner)` — the member (the named actor)
4. `factory.screen(to)` — the destination
5. `factory.screen(counterparty)` when `factory.committedCounterparty(owner, index) != 0` — FR-018
6. resolve `amount` (0 ⇒ full balance); revert `NothingToTransfer()` if zero
7. transfer — `SafeERC20.safeTransfer` for tokens; for native,
   `(bool ok, ) = to.call{value: amount}("")` with the return value checked,
   reverting `NativeTransferFailed()` (the `BridgeRouter.sol:363-368` pattern —
   **never** `.transfer()` or `.send()`)

Guarded by `nonReentrant`. Steps 3–5 are STATICCALLs and cannot reenter; step 7
is the only external call that can, and it happens after every check with no
state left to corrupt.

**Reverts**

| Condition | Error |
|---|---|
| caller is not the owner | `NotOwner()` |
| `to == address(0)` | `ZeroAddress()` |
| owner, destination, or committed counterparty is blocked | `SanctionedAddress(address)` (from the guard) |
| screening required but unconfigured | `ScreeningNotConfigured()` (from the factory) |
| nothing to move | `NothingToTransfer()` |
| native send rejected by the destination | `NativeTransferFailed()` |

Emits `TransferredOut(token, to, amount)`.

### How the index is known

The clone needs its own `index` to look up a committed counterparty. Two options
for the implementer, decided at build time and recorded here so the choice is
not silently made:

- **Store it**: add `uint256 index` alongside `owner`, set at `initialize`. One
  extra SSTORE per deployment (~20k gas, once).
- **Reverse-lookup**: the factory records `indexOf[clone]` at deploy. Also one
  SSTORE, but on the factory, and it adds factory state.

**Recommendation: store it in the clone.** It keeps the clone self-contained,
keeps the factory's state minimal, and avoids a second cross-contract read on
every transfer.

---

## What this contract deliberately does not have

| Absent | Why |
|---|---|
| `rescue` / `sweepTo` callable by anyone but the owner | It would be custody (FR-009) |
| owner transfer | An owner that can change is an owner that can be stolen |
| upgradeability | A platform upgrade key over member funds is the backdoor `SafePolicyGuardV2.sol:36-38` refuses (FR-010) |
| pause | Pausing a member's withdrawal is custody |
| fee logic | Launch rate is zero; dead fee code in an immutable value-holding contract is a review liability. A fee means a new template version. |
| `fallback()` | Unexpected calldata should revert, not be absorbed |
| deposit accounting | Impossible for tokens (`research.md` §R1.3); a partial implementation would imply a completeness it cannot have |

---

## Invariants the test suite must prove

1. **Only the owner can move funds** — the factory cannot, the admin cannot, an
   arbitrary caller cannot. Include a hostile-factory-upgrade test: upgrade the
   factory to an implementation that tries to drain a clone, and assert it
   fails.
2. **Value sent before deployment is fully retained** and sweepable after lazy
   deployment, for both native and tokens.
3. **A screening failure moves nothing** — assert balances unchanged for the
   owner-blocked, destination-blocked, and counterparty-blocked cases.
4. **`amount == 0` sweeps exactly the full balance** and leaves zero residual.
5. **`receive()` accepts a plain 21,000-gas transfer** once deployed — the
   payability property the empty body exists to protect. (Note: this asserts the
   *deployed* case; the undeployed case is a codeless address and trivially
   accepts one.)
6. **Reentrancy**: a malicious destination that reenters `transferOut` during the
   native send cannot double-spend. Use `contracts/mocks/ReentrantToken.sol` and
   a reentrant native receiver.
7. **A fee-on-transfer token either delivers the exact amount or the call
   reverts** — the payee is never quietly short-paid (spec edge case).
8. **The template itself cannot be initialized** (`_disableInitializers`) and
   holds no value.
