# UUPS Upgrades Without the Footguns: One Base Contract, One CI Gate

*How FairWins ships new escrow logic to a live, funds-bearing address — and why a storage-layout check runs before every merge*

| | |
|---|---|
| **Series** | Contract Architecture (part 1) |
| **Part** | 11 of 34 |
| **Audience** | Solidity engineers |
| **Tags** | `uups`, `proxy`, `upgradeable`, `storage-layout`, `solidity` |
| **Reading time** | ~9 minutes |

## The redeploy that strands everyone

Picture the escrow contract at the center of a peer-to-peer wager platform. It holds real stakes — USDC locked between counterparties — indexed by a subgraph, addressed by a frontend, referenced by every open wager. Now the roadmap calls for open-challenge wagers: a new creation path, new state, new events, on the same contract.

Before spec 025, FairWins had exactly one way to ship that: deploy a new contract at a new address. And a new contract starts with empty storage. Every wager, every balance, every mapping on the old address is left behind. Existing wagers become **stranded** — still holding funds, but on a contract the app no longer points at. Users get migrated or settled out-of-band on every release. The frontend and subgraph get repointed. Nobody enjoys any of it.

The fix is old news in principle — put a proxy in front of the logic — but the failure modes of upgradeable contracts are notorious enough that "just use UUPS" is not a plan. An uninitialized implementation can be hijacked. A constructor that silently never runs behind a proxy can start your wager IDs at zero. One reordered state variable can scramble the storage of a contract that custodies user money, and Solidity will not warn you.

So FairWins built the upgrade machinery once, made it boring, and made the dangerous part mechanically impossible to merge. Seven contracts now sit behind UUPS proxies at stable addresses — `WagerRegistry`, `MembershipManager`, `TokenFactory`, `ExternalDAORegistry`, `WagerPoolFactory`, `CallsignRegistry`, `FeeRouter` — all inheriting a single ~40-line base, all validated by the same CI gate.

## The shape: ERC-1967 proxy, UUPS logic

Each upgradeable contract is an [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967) proxy in front of a swappable implementation, using the UUPS pattern ([EIP-1822](https://eips.ethereum.org/EIPS/eip-1822)): the upgrade function lives in the *implementation*, not the proxy, keeping the proxy minimal and the upgrade authorization logic upgradeable itself. The proxy address is the stable one — the address users, the frontend, and the subgraph consume. The implementation changes on every upgrade.

`deployments/<network>-chain<id>-v2.json` records **both**: the proxy under e.g. `wagerRegistry` and the current implementation under `wagerRegistryImpl`. That dual record is not bookkeeping trivia — the storage-layout gate diffs new code against the *recorded deployed implementation*, so the file is what makes the safety check network-aware.

## One base to inherit, not copy

The reusable piece is `contracts/upgradeable/UUPSManaged.sol`. It contains no business logic — just the upgrade and access machinery every adopter needs, wired so the classic UUPS mistakes can't be made twice:

```solidity
abstract contract UUPSManaged is Initializable, UUPSUpgradeable, AccessControlUpgradeable {
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function __UUPSManaged_init(address admin) internal onlyInitializing {
        __UUPSUpgradeable_init();
        __AccessControl_init();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, admin);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    uint256[50] private __gap;
}
```

Three deliberate choices are packed in here.

**The implementation can never be initialized.** The constructor calls `_disableInitializers()`, so a bare implementation contract — the thing sitting at `wagerRegistryImpl`, reachable by anyone — can never be initialized and hijacked. Only the proxy, delegatecalling into this logic, can be initialized, and only once. This closes the textbook UUPS attack where someone initializes the raw implementation, grants themselves the upgrade role on it, and `selfdestruct`s or redirects it.

**Upgrades are least-privilege and non-brickable.** `UPGRADER_ROLE` is separate from `DEFAULT_ADMIN_ROLE`, so upgrade authority can later move to a timelock or multisig with no code change. And `_authorizeUpgrade` lives in the base every implementation inherits — it is never removed by an upgrade, so the ability to perform *future* upgrades is always preserved. On live networks the role is held by an air-gapped floppy-keystore admin; the runbook is blunt about the flip side: lose that key and the contract keeps working but can never be upgraded again.

**The base reserves its own gap.** `uint256[50] private __gap` at the base level means FairWins can add base state later without shifting every child's layout. (The OpenZeppelin `*Upgradeable` parents contribute no sequential slots — they use [ERC-7201](https://eips.ethereum.org/EIPS/eip-7201) namespaced storage.)

## `initialize` replaces the constructor — and one bug everyone hits

Behind a proxy, a constructor runs in the implementation's context and never touches proxy storage. So adopters replace it with a one-time `initialize` guarded by OpenZeppelin's `initializer` modifier. `WagerRegistry`'s version (in `contracts/wagers/WagerRegistry.sol`) calls `__UUPSManaged_init(admin)` first, then does exactly what the old constructor did — with one line that earns its comment:

```solidity
_nextWagerId = 1; // MOVED from the inline initializer (must run behind the proxy)
```

This is the single most common conversion bug, called out in `docs/developer-guide/upgradeable-contracts.md`: an **inline state initializer** like `uint256 _nextWagerId = 1;` runs in constructor context and is silently ignored behind a proxy. Miss it and your wager IDs start at 0 — a bug no compiler flags. The rule: declare bare, assign inside `initialize`.

Later upgrades that need to seed new state get a `reinitializer(N)`. When feature 024 (open challenges) landed as an in-place upgrade, the already-initialized proxy needed its EIP-712 domain set — so `initializeOpenChallenges() external reinitializer(2)` calls `__EIP712_init(...)`, invoked via `upgradeToAndCall` during the upgrade. Fresh deploys set the domain in `initialize` and can never call the reinitializer (version 2 > version 1). State that defaults to zero needs no reinitializer at all.

## Append-only storage, and a gap that shrinks on schedule

Proxy storage safety reduces to one rule: **never insert, reorder, remove, or retype existing state variables — only append.** Each contract ends its state with a trailing reserve, and appended state consumes it. `contracts/wagers/WagerRegistryCore.sol` — the single storage-layout definition shared by both registry facets — shows the rule living through two real upgrades:

```solidity
/// @dev Trailing storage reserve for append-only upgrades. Reduced 50 → 48 when the two
///      open-challenge mappings were appended (feature 024), then 48 → 45 for spec 035
///      (`feeNettingEnabled`+`gasFeeRecipient` pack into one slot, `maxGasFee`, `intentExtension`).
///      Never insert or reorder existing state above this gap.
uint256[45] private __gap;
```

Feature 024 appended two mappings (gap 50 → 48). Spec 035 appended a packed `bool`+`address` slot, a `uint256`, and an `address` (48 → 45). The gap shrinks by exactly the slots appended, so total layout size — and everything above the gap — never moves.

## The CI gate: making the unsafe upgrade unmergeable

Convention alone doesn't survive contact with a Tuesday afternoon. So the rule is enforced by `npm run check:storage-layout` (`scripts/deploy/check-storage-layout.js`), gating in CI via `.github/workflows/test.yml`. Built on OpenZeppelin's `hardhat-upgrades` validators, it runs two checks per contract in `UPGRADEABLE_CONTRACTS`:

- **With a recorded deployment** (an `<key>Impl` address in `deployments/`): `upgrades.validateUpgrade(deployedImpl, Factory, { kind: "uups" })` — the new implementation must be storage-layout *compatible* with what is actually on-chain. A reordered, removed, or retyped slot fails the build before the upgrade can exist.
- **Without one**: `upgrades.validateImplementation(...)` — the unsafe-pattern checks (missing `_disableInitializers`, stray `selfdestruct`/`delegatecall`, non-namespaced base storage).

Adding a contract to the gate is one line — `{ name: "FeeRouter", deploymentsKey: "feeRouter" }` — which is how five later adopters inherited spec 025's safety net for free. The script exits non-zero on any failure; per project constitution, CI fails loudly.

And the check is defense-in-depth, not the last line: the deploy tooling in `scripts/deploy/lib/upgradeable.js` runs the same validation again at execution time. `upgradeProxy({ name, proxyAddress })` calls OZ's `validateUpgrade` *before anything is sent on-chain*, deploys the new implementation, calls `upgradeToAndCall` signed by the `UPGRADER_ROLE` admin, and reports both addresses so `deployments/` records the new `…Impl`. An incompatible upgrade throws locally instead of corrupting funds remotely. `deployProxy` is only for first-time cutover — the runbook warns that re-running the deploy script mints a *new* proxy; to change logic on a live deployment you run an upgrade, never a redeploy.

The pattern has been exercised for real: feature 024 shipped as an in-place upgrade of the `wagerRegistry` proxy, and spec 026's voucher redemption as the first in-place upgrade of the `membershipManager` proxy — same address, all state preserved, ABI grows.

## Design decisions

**UUPS over Transparent proxy.** The upgrade function in the implementation keeps the proxy minimal and lets the authorization policy itself evolve. The cost — an implementation that forgets `_authorizeUpgrade` bricks upgrades — is neutralized by putting the gate in the inherited base, where no upgrade can drop it.

**A shared base instead of per-contract wiring.** Copy-pasted proxy plumbing drifts; drifted plumbing is where initializer lockouts get forgotten. `UUPSManaged` centralizes `_disableInitializers`, the role grants, and the upgrade gate, so an adopter's diff is just: inherit, convert constructor to `initialize`, add a `__gap`, register with the tooling.

**Coexistence over migration at cutover.** The legacy non-upgradeable registry couldn't be retro-wrapped, and on-chain state migration of live escrow was judged unsafe for v1. Spec 025 chose coexistence: legacy wagers stay settle-only on the old address while all new wagers land on the proxy, and the app surfaces both honestly until the legacy side drains.

**No downgrades — roll forward.** There is no automatic rollback. A bad upgrade is corrected by upgrading again to a fixed implementation; the non-brickable gate guarantees that path always exists, and prior implementation addresses live in the deployments file's git history if re-pointing to a known-good build is the fastest fix.

**Honest limits.** Upgradeability is a trust statement, not a free lunch: whoever holds `UPGRADER_ROLE` can replace the code that custodies user stakes. FairWins mitigates with least-privilege role separation, an air-gapped signing key, and a documented path to a timelock/multisig — but "upgradeable" and "immutable" are opposite promises, and the platform makes that choice per contract deliberately (the `MembershipVoucher` bearer NFT, for instance, is intentionally *not* upgradeable).

## Sources

- `specs/025-upgradeable-registry/spec.md` — motivation, coexistence cutover, upgrade-safety clarifications
- `specs/027-upgradeable-membership/` — second adopter (MembershipManager)
- `contracts/upgradeable/UUPSManaged.sol` — shared base (role gate, initializer lockout, base `__gap`)
- `contracts/wagers/WagerRegistry.sol` / `contracts/wagers/WagerRegistryCore.sol` — `initialize`, `reinitializer(2)`, append-only storage history
- `scripts/deploy/check-storage-layout.js` + `.github/workflows/test.yml` — the CI gate
- `scripts/deploy/lib/upgradeable.js` — `deployProxy` / `upgradeProxy` / `getImplementation`
- `docs/developer-guide/upgradeable-contracts.md` — adopter guide, inline-initializer bug
- `docs/runbooks/contract-upgrades.md` — pre-flight, in-place upgrade, rollback, failure modes
- `deployments/mordor-chain63-v2.json` — proxy + implementation records
- EIP-1822 (UUPS): https://eips.ethereum.org/EIPS/eip-1822
- ERC-1967 (proxy storage slots): https://eips.ethereum.org/EIPS/eip-1967
- ERC-7201 (namespaced storage): https://eips.ethereum.org/EIPS/eip-7201
- OpenZeppelin UUPS & Upgrades Plugins docs: https://docs.openzeppelin.com/contracts/5.x/api/proxy#UUPSUpgradeable, https://docs.openzeppelin.com/upgrades-plugins/
