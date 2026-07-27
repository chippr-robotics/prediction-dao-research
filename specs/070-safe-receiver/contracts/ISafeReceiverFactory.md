# Contract: `ISafeReceiverFactory`

> ⚠️ **Superseded pending rework.** Design review found 4 critical and 18 major
> issues in this feature's design — see [review-findings.md](../review-findings.md).
> Several statements in this document are falsified there. Do not implement from it as it stands.


**Spec**: [../spec.md](../spec.md) | **Plan**: [../plan.md](../plan.md) | **Data model**: [../data-model.md](../data-model.md)

Platform-singleton UUPS contract. It derives receive addresses, deploys them
lazily, records write-once counterparty commitments, and supplies screening
configuration to clones.

> **It is never on the authorization path for member funds.** No function here
> can move, freeze, or redirect value. That property is what makes FR-008,
> FR-009, FR-010 and SC-016 literally true, and it must survive every future
> change to this interface.

**Deployment keys**: `safeReceiverFactory` (proxy), `safeReceiverFactoryImpl`
**Base**: `UUPSManaged` (bundles `UUPSUpgradeable` + `AccessControlUpgradeable`, defines `UPGRADER_ROLE`, reserves 50 slots)

---

## Roles

| Role | Powers | Explicitly NOT |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | `setSanctionsGuard`, `setScreeningRequired` | any access to member funds |
| `UPGRADER_ROLE` | upgrade the factory implementation | change `receiveAddressImpl`; move funds; alter any deployed clone |

There is no guardian role and no pause. See `../plan.md` Constitution Check
note 2 — a pause on `deploy` would strand funds at undeployed addresses.

---

## Initialization

```solidity
function initialize(
    address admin,
    address receiveAddressImpl_,
    address sanctionsGuard_,
    bool screeningRequired_
) external initializer;
```

Calls `__UUPSManaged_init(admin)` **first**, per `docs/developer-guide/upgradeable-contracts.md`.

**Reverts**

| Condition | Error |
|---|---|
| `admin == address(0)` | `ZeroAddress()` |
| `receiveAddressImpl_ == address(0)` | `ZeroAddress()` |
| `screeningRequired_ && sanctionsGuard_ == address(0)` | `ScreeningNotConfigured()` |

`receiveAddressImpl_` has **no setter**. Its init-code hash feeds address
derivation, so changing it would move every future derived address (FR-030). A
new template ships as a new factory deployment.

---

## Derivation

```solidity
function receiveAddressImpl() external view returns (address);

function receiveAddressOf(address owner, uint256 index) external view returns (address);

function isDeployed(address owner, uint256 index) external view returns (bool);
```

`receiveAddressOf` is **pure derivation** — it reads only the immutable template
pointer and touches no per-address state:

```
salt = keccak256(abi.encode(owner, index))
addr = Clones.predictDeterministicAddress(receiveAddressImpl, salt, address(this))
```

It returns the same address whether or not code exists there, and it never
reverts for an unissued index — there is no on-chain notion of "issued". The
client mirrors this computation exactly (`frontend/src/lib/receiver/deriveAddress.js`),
and a test MUST assert client-derived == contract-derived == deployed.

---

## Deployment

```solidity
function deploy(address owner, uint256 index) external returns (address);
```

Deploys the clone at the derived address and calls
`SafeReceiveAddress.initialize(owner, address(this))`.

- **Permissionless.** The owner comes from the salt, not from `msg.sender`, so
  deploying another member's address grants the caller nothing. Permissionless
  deployment means a member is never blocked from reaching their funds by a
  platform gate.
- **Idempotent.** A second call for an already-deployed index returns the
  existing address without reverting. Two concurrent batch sweeps must not make
  one of them fail.
- **Not pausable.** Pausing this would strand funds already sitting at the
  address.

Emits `ReceiveAddressDeployed(owner, index, addr)` on first deployment only.

---

## Counterparty commitment

```solidity
function commitCounterparty(uint256 index, address counterparty) external;

function committedCounterparty(address owner, uint256 index) external view returns (address);
```

Records, **write-once**, the counterparty an address was issued to. Once
committed, every `transferOut` from that address screens the counterparty
on-chain (FR-018) — the member's declaration becomes chain-enforced rather than
app-recorded.

`msg.sender` is the owner; a member can only commit their own indices.

**Reverts**

| Condition | Error |
|---|---|
| already committed | `CounterpartyAlreadyCommitted(index)` |
| `counterparty == address(0)` | `ZeroAddress()` |
| `counterparty == msg.sender` | `SelfCounterparty()` |

A commitment that could be changed later would not be a commitment, so there is
deliberately no update and no clear.

Emits `CounterpartyCommitted(owner, index, counterparty)`.

---

## Screening

```solidity
function screen(address account) external view;

function sanctionsGuard() external view returns (address);
function screeningRequired() external view returns (bool);
```

`screen` is the indirection clones call (the `WagerPool.sol:13-17` callback
pattern — clones do not hold their own guard pointer, so a guard redeploy does
not orphan them).

Semantics — the fail-closed tri-state from `WagerPoolFactory.sol:285-303`, **not**
the silent no-op of `WagerRegistryCore._screen`:

| `screeningRequired` | guard set | Behaviour |
|---|---|---|
| `true` | yes | delegates to `guard.checkBlocked(account)`; reverts `SanctionedAddress(account)` when blocked |
| `true` | no | reverts `ScreeningNotConfigured()` — **never proceeds unscreened** (FR-020) |
| `false` | either | no-op — segregation and client clearance still apply; the UI states no on-chain screening applies here (FR-031) |

`checkBlocked` is `external view` ⇒ STATICCALL ⇒ no reentrancy surface, so it is
safe as the first check before any effect.

---

## Admin

```solidity
function setSanctionsGuard(address guard) external;      // DEFAULT_ADMIN_ROLE
function setScreeningRequired(bool required) external;   // DEFAULT_ADMIN_ROLE
```

- `setSanctionsGuard(address(0))` reverts `ScreeningNotConfigured()` while
  `screeningRequired` is true — an admin cannot silently disable screening by
  nulling the guard.
- `setScreeningRequired(true)` reverts `ScreeningNotConfigured()` when no guard
  is set.

Emits `SanctionsGuardUpdated(guard)`, `ScreeningRequiredUpdated(required)`.

**These are the factory's entire mutable surface, and none of it touches funds.**

---

## Events

```solidity
event ReceiveAddressDeployed(address indexed owner, uint256 indexed index, address indexed receiveAddress);
event CounterpartyCommitted(address indexed owner, uint256 indexed index, address indexed counterparty);
event SanctionsGuardUpdated(address indexed guard);
event ScreeningRequiredUpdated(bool required);
```

`ReceiveAddressDeployed` is indexed by owner so a client can enumerate deployed
addresses from logs as a cross-check — but enumeration never *depends* on it,
because derivation already covers recovery (FR-027).

---

## Errors

```solidity
error ZeroAddress();
error ScreeningNotConfigured();
error CounterpartyAlreadyCommitted(uint256 index);
error SelfCounterparty();
```

`SanctionedAddress(address)` propagates from `ISanctionsGuard` unchanged, so the
client can distinguish "screening refused this" from every other failure and
name the party (FR-028).

---

## Invariants the test suite must prove

1. `receiveAddressOf(o, i)` is stable across a factory **upgrade** — the whole
   point of an immutable template.
2. No function on this interface can transfer, approve, or otherwise move value
   held by any clone. Assert by upgrading the factory to a hostile
   implementation that *tries* and showing the clone still refuses.
3. `deploy` is idempotent and never reverts on a redeploy.
4. `screen` reverts `ScreeningNotConfigured()` — not silence — whenever
   `screeningRequired && guard == address(0)`, on every path that consumes it.
5. `commitCounterparty` is genuinely write-once, including across a factory
   upgrade.
6. Client-side derivation matches on-chain derivation for a spread of
   `(owner, index)` values including index 0 and a large index.
