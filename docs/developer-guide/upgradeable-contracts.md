# Making a contract upgradeable (reusing `UUPSManaged`)

This guide shows how to make a value-bearing contract upgradeable by reusing the shared primitives built in
spec 025 — **without reimplementing** the proxy, authorization, storage-safety, or deploy machinery
(the PR #724 ask). `WagerRegistry` is the reference adopter (spec 025); `MembershipManager` (spec 027) is the
second, with voucher redemption (spec 026) shipped as its first in-place upgrade — both are now live.

Background: [ADR-004](../adr/004-upgradeable-registry-uups.md). Operations:
[runbooks/contract-upgrades.md](../runbooks/contract-upgrades.md).

## What you reuse (don't rebuild)

| Piece | Where | What it gives you |
|-------|-------|-------------------|
| `UUPSManaged` base | `contracts/upgradeable/UUPSManaged.sol` | UUPS + AccessControl, `UPGRADER_ROLE`, `_disableInitializers`, non-brickable `_authorizeUpgrade`, base `__gap` |
| Storage-layout gate | `scripts/deploy/check-storage-layout.js` + CI `test.yml` | Blocks reordered/removed/retyped (state-corrupting) upgrades |
| Deploy/upgrade tooling | `scripts/deploy/lib/upgradeable.js` | `deployProxy` / `upgradeProxy` / `getImplementation`, records proxy+impl in `deployments/` |

## Steps to make `YourContract` upgradeable

### 1. Inherit the base and swap OZ bases to their `*Upgradeable` variants

```solidity
import {UUPSManaged} from "../upgradeable/UUPSManaged.sol";
// e.g. ReentrancyGuardUpgradeable / PausableUpgradeable from @openzeppelin/contracts-upgradeable IF needed

contract YourContract is IYour, UUPSManaged /*, ReentrancyGuardUpgradeable, ... */ {
```

`UUPSManaged` already brings `AccessControlUpgradeable` — do not also list it. Only add the upgradeable bases
your contract actually uses (e.g. `MembershipManager` needs neither reentrancy nor pause).

### 2. Replace the constructor with a one-time `initialize`

```solidity
function initialize(address admin, /* ...your args... */) external initializer {
    __UUPSManaged_init(admin);     // FIRST — UUPS + AccessControl; grants DEFAULT_ADMIN_ROLE + UPGRADER_ROLE
    // __ReentrancyGuard_init(); __Pausable_init();  // only those you inherit
    // ... your former constructor body, verbatim ...
}
```

**Critical:** move any **inline state initializers** into `initialize` (e.g. `uint256 x = 1;` →
declare `uint256 x;` and set `x = 1;` inside `initialize`). Inline initializers run in constructor context
and are **ignored behind a proxy**. This is the single most common conversion bug — `WagerRegistry`'s
`_nextWagerId = 1` is the canonical example.

Do not write your own constructor; the implementation's constructor is inherited from `UUPSManaged` and calls
`_disableInitializers()` (so a bare implementation can never be initialized).

### 3. Keep storage append-only and add a `__gap`

Add a trailing reserve after your last state variable:

```solidity
uint256[50] private __gap;
```

When a later upgrade adds state, append it **after** existing variables (it consumes `__gap`); never insert,
reorder, remove, or retype existing storage. If a new variable needs seeding, add a `reinitializer(N)`
function (state that defaults to 0 needs none).

### 4. Register it with the tooling

- Add `{ name: "YourContract", deploymentsKey: "yourContract" }` to `UPGRADEABLE_CONTRACTS` in
  `scripts/deploy/check-storage-layout.js` so CI validates it.
- Deploy via `deployProxy({ name: "YourContract", initArgs: [...] })` in your deploy script; it records
  `yourContract` (proxy) and `yourContractImpl` in `deployments/`.
- Verify the implementation (empty constructor args) in `verify.js`.

### 5. Tests

- Route existing tests through a proxy (see `test/helpers/proxy.js` for the `WagerRegistry` pattern, or use
  the `hardhat-upgrades` plugin's `upgrades.deployProxy`).
- Add upgrade-lifecycle tests (see `test/upgradeable/`): deploy, in-place upgrade preserves state, only
  `UPGRADER_ROLE` upgrades, re-init reverts, storage-incompatible upgrade is rejected.

## The membership → voucher path (worked example)

1. **MembershipManager** (spec 027 — ✅ implemented): inherits `UUPSManaged`; `constructor(admin, paymentToken_,
   treasury_)` converted → `initialize`; `_tiers / _memberships / authorizedCallers / paymentToken / treasury /
   accruedFees / sanctionsGuard / memberTermsHash` kept append-only with a trailing `__gap`; deployed via
   `deployProxy` and registered in the storage-layout check (`{ name: "MembershipManager", deploymentsKey:
   "membershipManager" }`). Behavior-neutral cutover (memberships are 30-day time-bound, so the legacy
   coexistence window drains in ~a month); `WagerRegistry` is repointed via `setMembershipManager(proxy)`.
2. **Voucher redemption** (spec 026 — ✅ implemented): two parts. The tradable asset is a **separate,
   immutable** `MembershipVoucher` (`contracts/access/MembershipVoucher.sol`) — an ERC-721 bearer claim that is
   intentionally **not** upgradeable (a bearer asset's rules must not change after purchase, and it minimizes
   the attack surface on a USDC-taking contract). Only the **mutable redemption logic** (screening, Terms,
   grant) is added to the membership proxy as its **first in-place upgrade** — append the voucher pointer +
   `redeemVoucher`/`setVoucher`, then `upgradeProxy({ name: "MembershipManager", proxyAddress })`. No membership
   redeploy, no state migration, no broad role grant — exactly mirroring how feature 024 lands on the
   WagerRegistry proxy. (So: don't make the voucher upgradeable; do ship its redemption logic as an upgrade.)

## Don'ts

- Don't copy-paste the UUPS wiring into your contract — inherit `UUPSManaged`.
- Don't add a constructor with logic — use `initialize`.
- Don't insert/reorder storage — append only, behind `__gap`.
- Don't bypass `check:storage-layout` — it is the guardrail against fund-corrupting upgrades.
