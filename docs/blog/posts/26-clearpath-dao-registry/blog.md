# ClearPath: A Registry That Owns Nothing

*How FairWins references external DAOs as first-class, multi-network citizens without taking custody, keys, or authority*

| | |
|---|---|
| **Series** | Multi-chain Infra (part 1) |
| **Audience** | DAO tooling and infrastructure engineers |
| **Tags** | `dao`, `registry`, `multi-chain`, `interoperability` |
| **Reading time** | ~9 minutes |

---

## The problem: someone else's DAO, your dashboard

A FairWins member holds a governance position in ENS on Ethereum mainnet, a Uniswap
delegation on the same chain, and membership in Olympia — an OpenZeppelin Governor DAO
living on Ethereum Classic. Three DAOs, two frameworks, two networks, and no single
place to see them together, let alone vote from.

The instinct of most "DAO aggregators" is to become a middleman: deploy a proxy, ask
members to delegate to it, route votes through a contract you control. That instinct is
exactly wrong for a platform whose entire product is non-custodial escrow. The moment a
registry can act *on behalf of* a DAO it references, it becomes a liability — a new
attack surface, a new trust assumption, a new thing an auditor has to reason about.

ClearPath (specs `030-clearpath-standard-daos` and `042-clearpath-multi-network`) takes
the opposite position. It treats an external DAO the way a phone book treats a business:
it records that the DAO exists, who noticed it, and what kind of governance it runs — and
nothing else. Every action a member takes is signed by that member, against the DAO's own
contract, gated by the DAO's own rules. The registry is metadata for shared discovery. It
holds no authority, no keys, and no funds.

This post walks the on-chain registry first, then the multi-network layer that was
grafted on top of it without touching a single line of Solidity.

## The data model: five fields and a code probe

The on-chain piece is `contracts/clearpath/ExternalDAORegistry.sol`, a UUPS-upgradeable
contract that inherits the shared `contracts/upgradeable/UUPSManaged.sol` wiring. Its
entire state is an append-only entry table:

```solidity
struct Entry {
    address dao;
    Framework framework;
    address registrant;
    uint64  registeredAt;
    string  label;
}

IMembershipManager public membershipManager;
uint256 public externalCount;
mapping(uint256 => Entry) private _entries;
mapping(address => uint256) private _idByDao; // 0 = not registered (ids start at 1)
mapping(address => uint256[]) private _byRegistrant;

uint256[45] private __gap;
```

Ids start at 1 so that a zero from `_idByDao` unambiguously means "not registered." The
trailing `__gap` reserves storage slots for future fields, and the layout is registered in
`npm run check:storage-layout`, which gates CI — the same discipline every upgradeable
FairWins contract follows, so an implementation swap can never silently reorder state.

`Framework` is an enum, and today it holds exactly one value:

```solidity
enum Framework {
    OZGovernor // 0 — OpenZeppelin Governor (Olympia + any IGovernor DAO)
}
```

That single value is deliberate. The registry commits on-chain only to what it can
actually validate on-chain, and leaves the enum extensible (Aragon, Moloch, Safe named as
later candidates in the interface comments).

## Validating that an address is really a DAO

Anyone can pass an arbitrary address to a registration call. The registry's job is to
reject EOAs and random contracts before they pollute shared discovery. It does this with a
two-tier probe in `_isGovernor`:

```solidity
function _isGovernor(address dao) internal view returns (bool) {
    if (dao.code.length == 0) return false; // EOA
    try IERC165(dao).supportsInterface(type(IGovernor).interfaceId) returns (bool ok) {
        if (ok) return true;
    } catch {}
    // Defensive fallback: a real Governor answers these views; a random contract reverts.
    try IGovernor(dao).COUNTING_MODE() returns (string memory mode) {
        if (bytes(mode).length == 0) return false;
        try IGovernor(dao).votingPeriod() returns (uint256) {
            return true;
        } catch {
            return false;
        }
    } catch {
        return false;
    }
}
```

The primary path is the clean one: [ERC-165](https://eips.ethereum.org/EIPS/eip-165)
`supportsInterface` against the `IGovernor` interface id. But not every governor implements
ERC-165 correctly — many older Governor deployments don't — so the fallback probes two
`IGovernor` views that a real governor answers and a random contract reverts on:
`COUNTING_MODE()` (with a non-empty-string sanity check) and `votingPeriod()`. Every call
is wrapped in `try/catch`, so a probe against a hostile contract that reverts, or one that
returns garbage, degrades to `false` rather than propagating.

Note what the contract imports: `IGovernor` from OpenZeppelin, the *interface only* — never
the `Governor` implementation. That keeps the registry free of the Cancun `mcopy` opcode
that OpenZeppelin 5.4.0's `GovernorUpgradeable` pulls in transitively, which is precisely
why the registry compiles and deploys on pre-Cancun Ethereum Classic / Mordor where a full
native Governor cannot. Today the registry is deployed only on Mordor (chain 63); its proxy
and implementation are recorded in `deployments/mordor-chain63-v2.json` as
`externalDAORegistry` / `externalDAORegistryImpl`.

## Registration is metadata, not power

The public entrypoint is small, and its comments are load-bearing:

```solidity
function registerExternalDAO(address dao, Framework framework, string calldata label)
    external
    returns (uint256 id)
{
    if (dao == address(0)) revert ZeroAddress();
    if (_idByDao[dao] != 0) revert AlreadyRegistered();
    if (
        uint8(membershipManager.getActiveTier(msg.sender, DAO_MEMBER_ROLE)) <
        uint8(IMembershipManager.Tier.Silver)
    ) revert InsufficientMembershipTier();
    if (!_isGovernor(dao)) revert NotAGovernor(dao);
    // ... assign id, store Entry, emit ExternalDAORegistered
}
```

Registration is gated by a MembershipManager tier of **Silver or above** — a light spam
control. But look at what it deliberately does *not* do. There is no sanctions screen and
no `recordCreate` quota consumption, because registration is read-only metadata: it moves
no value and confers no power. Screening a signer and burning a creation quota are for
value-moving actions; recording that a public governance contract exists is neither.

This is invariant **INV-4** from the spec's data model — *no external authority*: the
registry confers ClearPath no role, key, or call-authority over a registered DAO. The
`registrant` field records who noticed the DAO, not who owns it. Every governance action a
member later takes — vote, queue, execute, propose — is constructed as a user-signed
transaction against the DAO's own contract and authorized by the DAO's own rules. The
registry is never in the loop. INV-5 pins the other axis: registries are per-network, and
cross-network registration is rejected — a DAO tracked on one chain never leaks into
another's scope.

## Layering multi-network on top — without a contract change

Spec 030 shipped the registry but wired ClearPath's *availability* to it: the whole module
self-disabled anywhere `ExternalDAORegistry` wasn't deployed, which meant everywhere except
Mordor. That was wrong, because the reads are pure client-side RPC — the gate was
unnecessary. Spec 042 removed it, and the striking thing is that it did so as a
**frontend-only** change. There is no new or changed on-chain contract; the registry stays
deployed only where it already is.

The multi-network layer rests on three moves, all in config and client code:

**1. An open network model.** Networks are declared in
`frontend/src/config/networks.js`, and each network's `capabilities` getter gained a
`clearpath` flag. A ClearPath-only network — Ethereum mainnet is the first — sets
`clearpath: true` while `dex`, `passkeyAccounts`, `polymarketSidebets`, and `friendMarkets`
are all false and it carries no wager deployment. So mainnet can host governance without the
app ever implying that wagers or swaps run there; each other feature self-discloses as
unavailable. Adding a network is pure config: an entry with an RPC URL, USDC address, and
`clearpath: true`.

**2. Registry-optional tracking, aggregated across every network.** Availability is now
capability-driven, not registry-gated: `useClearPath().isSupported = capabilities.clearpath
&& !!reader`. The on-chain registry becomes an *optional shared-discovery overlay* used
where deployed. On a registry-less network, a member tracks a DAO by address into a
device-local store (`trackedDaoStore.js`, `localStorage` keyed by `chainId + wallet`).
`listExternalDAOs()` then scans every `clearpath`-capable chain in parallel via
`Promise.allSettled`, so an unreachable RPC on one chain degrades that chain honestly
without blanking the others. For each chain it merges three sources, de-duplicated and
strictly scoped to that one chain:

```
on-chain registry entries  (iff a registry is deployed on THAT chain)
+ device-local tracked DAOs (per chainId + wallet, on THAT chain)
+ curated known DAOs        (config/clearpath/knownDaos.js, on THAT chain)
```

Every row carries its own `chainId`. Tracking needs no transaction and no network switch;
only a *write* — registering on a registry network, or voting/queueing/executing/proposing
against a DAO — requires being on that DAO's chain, and those surfaces render a "Switch to
X" button (via wagmi's `useSwitchChain`) when the connected chain differs.

**3. Pluggable per-framework connectors.** ClearPath reads any OpenZeppelin `IGovernor`
DAO generically, but Uniswap governance is GovernorBravo/Compound-style — a different
interface. So the single connector became a connector layer in
`frontend/src/components/clearpath/connectors/`: `ozGovernor.js` (framework 0) and
`governorBravo.js` (framework 1, with id-based `queue`/`execute` and `getPriorVotes` voting
power). `detectFramework(reader, address)` probes OZ via `COUNTING_MODE`, then Bravo via
`proposalCount` + `quorumVotes`, else `'unknown'`. Adding a framework — Aragon, Morpho — is
a new module plus one entry in an ordered resolver; the UI, data router, and notifications
don't change.

Reads resolve subgraph-first (`daoDataSource.js`): a governance subgraph when one is
configured for `(chainId, dao)` and a gateway key is present, otherwise the connector's
bounded, chunked on-chain live indexer, otherwise a truthful empty/partial/error state —
never fabricated data.

## Design decisions

- **Interface over implementation.** Importing only `IGovernor` — not `Governor` — is what
  lets one registry serve Olympia on pre-Cancun ETC and ENS on mainnet from the same
  bytecode. It also means the registry never has to know how a governor tallies votes; it
  only proves the address answers governor-shaped questions.

- **Validate on-chain, extend off-chain.** The Solidity `Framework` enum stays minimal
  (`OZGovernor` only) because that is all the contract can validate. GovernorBravo support
  lives in the frontend ABI mirror and connector layer, where framework detection is a
  client-side probe. The chain commits only to what it can check.

- **Registry-optional, not registry-required.** Making the on-chain registry a shared
  overlay rather than an on/off switch is what unlocked mainnet with zero deploy. The
  trade-off is honest: device-local tracking has no cross-device sync in this cut, and a
  member's tracked list lives in their browser. Shared discovery — the registry's real
  value — remains available wherever the contract is deployed, and any member can promote a
  locally-tracked DAO onto a registry network.

- **Degrade honestly.** `Promise.allSettled` across chains, `try/catch` around every probe,
  and explicit empty/partial/error states are the same doctrine throughout FairWins: a
  feature that can't reach data says so, rather than showing a plausible lie. A wrong
  subgraph id is treated as worse than none, since the router simply falls back to the live
  scan either way.

## Sources

- `contracts/clearpath/ExternalDAORegistry.sol` — the on-chain registry
- `contracts/clearpath/interfaces/IExternalDAORegistry.sol` — public interface, events, errors
- `specs/030-clearpath-standard-daos/spec.md`, `.../data-model.md` — pillars, invariants INV-1…INV-5
- `specs/042-clearpath-multi-network/spec.md`, `.../data-model.md` — network-agnostic layer, connectors
- `docs/developer-guide/clearpath-multi-network.md` — the three pillars, data sourcing, scoping
- `deployments/mordor-chain63-v2.json` — recorded `externalDAORegistry` / `externalDAORegistryImpl`
- `contracts/upgradeable/UUPSManaged.sol` — shared UUPS proxy/auth base
- [ERC-165: Standard Interface Detection](https://eips.ethereum.org/EIPS/eip-165)
- [OpenZeppelin Governance (`IGovernor`)](https://docs.openzeppelin.com/contracts/5.x/api/governance)
- [Compound GovernorBravo](https://docs.compound.finance/v2/governance/)
