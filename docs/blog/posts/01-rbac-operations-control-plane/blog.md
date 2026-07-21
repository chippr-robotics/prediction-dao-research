# One Action, One Role: RBAC and the Operations Control Plane

*How FairWins maps every privileged action to exactly one on-chain role — and makes the admin console prove it*

| | |
|---|---|
| **Series** | Identity & Access (part 1) |
| **Part** | 1 of 34 |
| **Audience** | Protocol/backend engineers, technical founders |
| **Tags** | `access-control`, `rbac`, `solidity`, `openzeppelin`, `admin-ux` |
| **Reading time** | ~8 minutes |

## The compliance officer who couldn't reach her own tool

Picture a compliance officer at a wagering platform. Her job is narrow and serious: when an address needs to be blocked from the protocol, she adds it to an on-chain deny-list, with a reason recorded on-chain. The smart contract is ready for her — `SanctionsGuard.setDenied` is gated on a dedicated `SANCTIONS_ADMIN_ROLE`, and her multisig holds that role. Nothing else. She cannot pause the protocol, cannot touch the treasury, cannot freeze a wager account.

Then she opens the admin panel and the deny-list tab isn't there.

This was a real gap in FairWins' control-surface audit (G5 in `docs/system-overview/control-surface-audit.md`): the contract defined `SANCTIONS_ADMIN_ROLE`, but the frontend's role model didn't know it existed, so the deny-list view was gated on `DEFAULT_ADMIN_ROLE` instead. The on-chain access control was correct — and operationally useless. To do her job, the compliance officer would have needed full protocol admin, which is exactly the privilege escalation the role was designed to prevent. The alternative was worse: quietly granting her `DEFAULT_ADMIN_ROLE` "just so the tab shows up."

The lesson generalizes. Role-based access control isn't only a Solidity problem. A role that exists on-chain but not in the operator's UI creates pressure to over-grant, and over-granting is how least privilege dies in practice. This post walks through both halves of FairWins' answer: the on-chain role discipline ("one action, one role") and the `/admin` operations control plane that mirrors it, view by view.

## The role inventory: one paid role, six operator roles

FairWins is a peer-to-peer wager platform — smart contracts escrow stakes and resolve wagers from external oracles. Its access model, documented in `docs/system-overview/roles-and-tiers.md`, is deliberately small: **one user-purchasable role and six core operator roles**, all enforced with [OpenZeppelin AccessControl](https://docs.openzeppelin.com/contracts/5.x/access-control).

The paid role is `WAGER_PARTICIPANT_ROLE`, defined in `contracts/wagers/WagerRegistryCore.sol`. It's required to create or accept wagers and is sold in USDC by `MembershipManager` as a soulbound, time-bound tier (Bronze through Platinum). That's a topic for part 2 of this series. This post is about the other six — the operator roles:

| Role | Defined in | Authority |
|---|---|---|
| `DEFAULT_ADMIN_ROLE` | OZ AccessControl (`0x00`) | Protocol wiring, tier config, treasury withdrawal, role administration |
| `GUARDIAN_ROLE` | `contracts/wagers/WagerRegistryCore.sol` | `pause()` / `unpause()` the registry |
| `ACCOUNT_MODERATOR_ROLE` | `contracts/wagers/WagerRegistryCore.sol` | `freezeAccount` / `unfreezeAccount` |
| `ROLE_MANAGER_ROLE` | `contracts/access/MembershipManager.sol` | Grant/revoke memberships out-of-band |
| `SANCTIONS_ADMIN_ROLE` | `contracts/access/SanctionsGuard.sol` | Discretionary deny-list (`setDenied`) |
| `UPGRADER_ROLE` | `contracts/upgradeable/UUPSManaged.sol` | Replace UUPS proxy implementations |

Every role is a plain `bytes32` keccak hash — no registry contract, no role NFTs, no bespoke permission language:

```solidity
// contracts/wagers/WagerRegistryCore.sol
bytes32 public constant WAGER_PARTICIPANT_ROLE = keccak256("WAGER_PARTICIPANT_ROLE");
bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
bytes32 public constant ACCOUNT_MODERATOR_ROLE = keccak256("ACCOUNT_MODERATOR_ROLE");
```

Beyond the core six, individual registries define narrow roles for their own surface: `TOKEN_ISSUER_ROLE` on `contracts/tokens/TokenFactory.sol`, `FEE_ADMIN_ROLE` on `contracts/fees/FeeRouter.sol`, and `REGISTRY_CURATOR_ROLE` / `MODERATOR_ROLE` / `VERIFIER_ROLE` on `contracts/naming/CallsignRegistry.sol`. Same pattern, scoped to one contract each.

## One action, one role

The discipline that holds the model together: **every privileged function is gated by exactly one role**. Not "admin or guardian," not a points system — one `onlyRole` modifier per entrypoint. The emergency controls in `contracts/wagers/WagerRegistry.sol` are the cleanest illustration:

```solidity
function pause() external onlyRole(GUARDIAN_ROLE) { _pause(); }
function unpause() external onlyRole(GUARDIAN_ROLE) { _unpause(); }

function freezeAccount(address user, string calldata reason)
    external
    onlyRole(ACCOUNT_MODERATOR_ROLE)
```

Configuration setters (`setOracleAdapter`, `setSanctionsGuard`, `setTokenAllowed`, `setMembershipManager`) all take `onlyRole(DEFAULT_ADMIN_ROLE)`. The one interesting exception proves the rule: `setIntentExtension` — which swaps the registry's second facet, and is therefore upgrade-equivalent — is gated on `UPGRADER_ROLE`, not admin, because it changes what code runs behind the proxy.

Upgrades themselves live in a shared base every upgradeable contract inherits:

```solidity
// contracts/upgradeable/UUPSManaged.sol
bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

function __UUPSManaged_init(address admin) internal onlyInitializing {
    __UUPSUpgradeable_init();
    __AccessControl_init();
    _grantRole(DEFAULT_ADMIN_ROLE, admin);
    _grantRole(UPGRADER_ROLE, admin);
}

function _authorizeUpgrade(address newImplementation)
    internal override onlyRole(UPGRADER_ROLE) {}
```

`UPGRADER_ROLE` is separated from `DEFAULT_ADMIN_ROLE` on purpose: it can later be reassigned to a timelock or multisig with no code change, and because `_authorizeUpgrade` is defined once in the base and never removed by an upgrade, the ability to perform *future* upgrades is always preserved.

### The negative space matters as much

`docs/system-overview/roles-and-tiers.md` maintains a table of what each role **cannot** do, and it's worth internalizing why that table exists. A guardian can stop the whole protocol but cannot seize an account. An account moderator can freeze an account but cannot pause the protocol or move treasury funds. A role manager can hand out memberships but cannot revoke admin roles. The compliance officer can block an address but holds no other privilege. The upgrader can ship new logic but cannot grant itself anything. Even `DEFAULT_ADMIN_ROLE` has hard limits: it cannot create wagers on behalf of users, cannot resolve wagers, and cannot move escrowed stakes — there is simply no function for it. When you design a role, write the "cannot" list first; it tells you whether the role is actually narrow or just labeled that way.

## The control plane: role checks flow from contract to UI

The operator side lives at `/admin` (`frontend/src/components/AdminPanel.jsx`), consolidated after the control-surface audit into a grouped **operations control plane**: Control Room, Incident Response, Compliance, Membership & Revenue, Protocol Config, Identity, Access Control, Infrastructure.

The core UI rule mirrors the contract rule: **each view is gated by the on-chain role its actions require, and a group renders only if the operator holds at least one usable view inside it.** The frontend computes role hashes exactly the way the contracts do —

```js
// frontend/src/components/AdminPanel.jsx
const ROLE_HASHES = {
  GUARDIAN: ethers.keccak256(ethers.toUtf8Bytes('GUARDIAN_ROLE')),
  SANCTIONS_ADMIN: ethers.keccak256(ethers.toUtf8Bytes('SANCTIONS_ADMIN_ROLE')),
  DEFAULT_ADMIN: ethers.ZeroHash,
  // ...
}
```

— and checks them via `hasRole(bytes32, address)` against the live contracts. The grouping/gating model itself is a pure function in `frontend/src/components/admin/adminNav.js`, so it's unit-testable without rendering anything:

```js
{
  label: 'Incident Response',
  items: [
    isGuardian && item('emergency', 'Emergency'),
    isAccountModerator && item('moderation', 'Account Moderation'),
  ].filter(Boolean),
},
{
  label: 'Compliance',
  items: [
    (isSanctionsAdmin || isAdmin) && item('deny-list', 'Deny-list'),
  ].filter(Boolean),
},
```

A guardian signing in sees Control Room, Incident Response, and Infrastructure — nothing else. The compliance officer from the opening now sees Control Room and Compliance. The panel isn't enforcing security (the contracts do that); it's making the on-chain permission set legible, so nobody needs to over-grant a role just to make a screen appear.

One subtlety the panel gets right: roles live on different contracts, so grants must be routed to the contract that *defines* the role, not blanket-sent to one registry:

```js
// frontend/src/components/AdminPanel.jsx
const roleHomeContract = (role) => {
  if (role === 'ROLE_MANAGER') return membershipManagerAddr
  if (role === 'SANCTIONS_ADMIN') return sanctionsGuardAddr
  if (role === 'TOKEN_ISSUER') return tokenFactoryAddr
  return wagerRegistryAddr
}
```

The Control Room's Overview tile answers the operator's first question on any bad day: is the protocol live, is the gateway live, is anything paused or killswitched, and *who am I signed in as, with which powers*.

## Design decisions

**Why plain OpenZeppelin AccessControl and nothing fancier?** `bytes32` role hashes checked with `onlyRole` are boring, audited, and universally understood by tooling and reviewers. The one-role-per-action discipline gives you most of what elaborate permission systems promise, without a new trust surface. The cost is granularity: `withdrawFees` today requires full `DEFAULT_ADMIN_ROLE`, and splitting out a dedicated `TREASURER_ROLE` would need a contract upgrade — a documented future candidate, not a config change.

**Why does the UI gate on roles at all if contracts enforce them?** Because the failure mode of a role-blind UI isn't a security hole — it's privilege creep. The G5 gap showed that when the frontend doesn't model a role, operators get granted a bigger one. Modeling every role in the panel is what keeps the on-chain least-privilege design honest in day-to-day operations.

**What's deliberately *not* in the control plane.** Two categories are excluded by policy, not oversight. Anything requiring the air-gapped floppy keystore — UUPS upgrades, `UPGRADER_ROLE` actions — stays on scripted, offline paths (`docs/runbooks/contract-upgrades.md`). And the relay gateway's killswitch and quotas are env/signal-driven with **no remote admin API on purpose**: an authenticated web killswitch would be a new attack surface, and the gateway's worst case is designed to be "refuses to relay," never "steals funds." The panel shows their state read-only and links the runbook.

**Not everything needs a role.** Maintenance sweeps (`batchExpireOpen`, `autoResolveFromPolymarket`, `autoResolveFromOracle`) are permissionless on-chain — anyone can run them, so the Maintenance view is open to any operator. And some contracts (`WagerPool` clones, `MembershipVoucher`, `KeyRegistry`) have **no admin surface by design**: no role can drain or redirect funds because no function exists to do it. The strongest access control is the entrypoint you never wrote.

## Sources

- `docs/system-overview/roles-and-tiers.md` — role inventory, tier table, "cannot do" matrix
- `docs/system-overview/control-surface-audit.md` — full control-surface inventory, gap analysis (G1–G10), control-plane grouping
- `contracts/wagers/WagerRegistryCore.sol`, `contracts/wagers/WagerRegistry.sol` — role constants, `pause`/`freezeAccount` gating
- `contracts/access/MembershipManager.sol` — `ROLE_MANAGER_ROLE`, admin setters, `initialize`
- `contracts/access/SanctionsGuard.sol` — `SANCTIONS_ADMIN_ROLE`, `setDenied`
- `contracts/upgradeable/UUPSManaged.sol` — `UPGRADER_ROLE`, `_authorizeUpgrade`
- `contracts/fees/FeeRouter.sol`, `contracts/tokens/TokenFactory.sol`, `contracts/naming/CallsignRegistry.sol` — registry-scoped roles
- `frontend/src/components/AdminPanel.jsx`, `frontend/src/components/admin/adminNav.js` — role hashes, view gating, role→contract grant routing
- OpenZeppelin AccessControl documentation — https://docs.openzeppelin.com/contracts/5.x/access-control
- OpenZeppelin UUPS / proxy documentation — https://docs.openzeppelin.com/contracts/5.x/api/proxy
