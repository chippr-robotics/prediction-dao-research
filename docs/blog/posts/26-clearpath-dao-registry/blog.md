# ClearPath: A Registry That Owns Nothing

*How FairWins lets you see and act on DAOs across different networks without ever taking custody, keys, or authority*

| | |
|---|---|
| **Series** | Multi-chain Infra (part 1) |
| **Audience** | Product and infrastructure readers curious about DAO tooling |
| **Tags** | `dao`, `governance`, `multi-chain`, `interoperability` |
| **Reading time** | ~7 minutes |

---

## The problem: someone else's DAO, your dashboard

A FairWins member holds a governance position in ENS on Ethereum, a Uniswap delegation on the same network, and membership in a smaller DAO living on Ethereum Classic. Three DAOs, two different governance frameworks, two networks — and no single place to see them together, let alone vote from.

(Quick refresher: a DAO is a "decentralized autonomous organization" — an on-chain group whose members vote on proposals, with the rules enforced by a governance smart contract rather than by a company.)

The instinct of most "DAO aggregators" is to become a middleman: deploy a contract of their own, ask members to delegate their voting power to it, and route votes through something the aggregator controls. That instinct is exactly wrong for a platform whose entire product is holding *nothing* on your behalf. The moment a registry can act on a DAO's behalf, it becomes a liability — a new thing to attack, a new party to trust, a new question every auditor has to reason through.

ClearPath takes the opposite position. It treats an external DAO the way a phone book treats a business: it records that the DAO exists, who noticed it, and what kind of governance it runs — and nothing else. Every action a member takes is signed by that member, sent to the DAO's own contract, and judged by the DAO's own rules. The registry is shared metadata for discovery. It holds no authority, no keys, and no funds.

This post walks the on-chain registry first, then the multi-network layer that was added on top of it without changing a single line of contract code.

## The data model: a few facts and a sanity check

The on-chain piece is a small, upgradeable contract whose entire memory is an append-only list of entries. Each entry records just a handful of facts: the DAO's address, which governance framework it uses, who registered it, when, and a human-readable label.

Two design touches are worth calling out. Entry numbering starts at one, so a "zero" unambiguously means "not registered" — no confusing empty slots. And the contract's storage layout is checked automatically before every upgrade, the same discipline every upgradeable FairWins contract follows, so a future version can never accidentally scramble the existing records.

The "framework" field is intentionally minimal. Today it holds exactly one value: OpenZeppelin's widely-used Governor design (the framework behind countless DAOs). The registry commits on-chain only to what it can actually verify on-chain, and leaves room to add more frameworks — like Aragon or Moloch — later.

## Checking that an address is really a DAO

Anyone can hand the registry any address. Its job is to reject ordinary wallets and random contracts before they pollute shared discovery. It does this with a two-tier check.

The clean path uses a common Ethereum convention called [ERC-165](https://eips.ethereum.org/EIPS/eip-165), which lets a contract answer "do you support this interface?" A well-behaved Governor says yes. But many older Governors never implemented that convention correctly, so there's a fallback: the registry asks two questions a real Governor can answer and a random contract chokes on — essentially "how do you count votes?" and "how long is your voting period?" Every probe is wrapped so that a hostile or broken contract simply fails the check rather than causing trouble.

One quiet but important choice: the registry borrows only the *description* of a Governor — the shape of its questions — not a full Governor implementation. That keeps the contract lean enough to deploy on older networks like Ethereum Classic, and it's the same trick that lets one registry serve a small DAO there and ENS on Ethereum from the same code.

## Registration is metadata, not power

Registering a DAO is gated only by a light membership requirement — Silver tier or above — purely as spam control. But look at what registration deliberately does *not* do. There's no sanctions screen and no consumption of any "creation" quota, because registration moves no value and confers no power. Those heavier checks are reserved for actions that move money.

This is the core principle: **no external authority.** The registry gains no role, no key, and no ability to call anything on a DAO it records. The "who registered it" field notes who *noticed* the DAO, not who owns it. Every governance action a member takes later — voting, queueing, executing, proposing — is a transaction that member signs, sent to the DAO's own contract, authorized by the DAO's own rules. The registry is never in the loop. And registries are strictly per-network: a DAO tracked on one network never leaks into another's scope.

## Adding multi-network support — without a contract change

The first version of ClearPath tied its very availability to the registry: the whole feature switched itself off anywhere the registry wasn't deployed, which meant everywhere except the one network it launched on. That was a mistake, because reading a DAO's state is just a direct query to that network — no registry required. The fix removed the gate entirely, and the striking part is that it was a **frontend-only** change. No new or altered contract; the registry stays deployed only where it already was.

The multi-network layer rests on three moves, all in configuration and app code:

**1. An open network model.** Each network now declares whether it supports ClearPath. A ClearPath-only network — Ethereum is the first — can host governance while every other FairWins feature (wagers, swaps, and so on) honestly reports itself as unavailable there. Adding a network becomes pure configuration: a name, a connection URL, and a "supports ClearPath" flag.

**2. Registry-optional tracking, aggregated across every network.** The on-chain registry becomes an optional shared-discovery overlay used where it's deployed. On a network without one, a member can still track a DAO by address in local, device-only storage. When ClearPath builds your list, it scans every ClearPath-capable network in parallel, so an unreachable network degrades just that one entry honestly without blanking the rest. For each network it merges three sources — the on-chain registry (where one exists), your device-local tracked DAOs, and a curated list of well-known DAOs — de-duplicated and strictly scoped to that single network.

Tracking a DAO needs no transaction and no network switch. Only a *write* — registering, or voting, queueing, executing, proposing — requires being connected to that DAO's network, and those screens show a clear "Switch to X" button when you're on the wrong one.

**3. Pluggable per-framework connectors.** ClearPath reads any OpenZeppelin-style Governor generically, but Uniswap's governance uses a different, Compound-style design. So instead of one hard-wired reader, ClearPath has a small library of connectors, one per framework, and a detector that probes an unknown DAO to figure out which one it is. Adding support for a new framework is a new connector plus one line in an ordered list — the rest of the interface doesn't change.

Underneath, reads prefer a fast indexed source when one is configured for a given DAO, fall back to reading the contract directly when it isn't, and otherwise show a truthful empty, partial, or error state — never fabricated data.

## Why we built it this way

**Describe, don't embody.** Borrowing only the *shape* of a Governor, never a full implementation, is what lets one registry serve DAOs on a lightweight older network and on Ethereum alike. It also means the registry never needs to know how a DAO tallies votes — only that the address answers governor-shaped questions.

**Validate on-chain, extend off-chain.** The contract's list of frameworks stays minimal because that's all it can truly verify. Support for other governance styles lives in the app, where detection is a lightweight probe. The chain commits only to what it can check.

**Registry-optional, not registry-required.** Making the on-chain registry a shared overlay rather than an on/off switch is what unlocked Ethereum with zero new deployment. The honest trade-off: device-local tracking doesn't sync across your devices in this version. But shared discovery — the registry's real value — is available wherever the contract is deployed, and any member can promote a locally-tracked DAO onto a registry network.

**Degrade honestly.** Scanning networks in parallel, guarding every probe, and showing explicit empty/partial/error states is the same doctrine throughout FairWins: a feature that can't reach its data says so, rather than showing a plausible lie.

## Further reading

- [ERC-165: Standard Interface Detection](https://eips.ethereum.org/EIPS/eip-165) — how contracts advertise what they support
- [OpenZeppelin Governance](https://docs.openzeppelin.com/contracts/5.x/api/governance) — the Governor framework behind many DAOs
- [Compound's GovernorBravo](https://docs.compound.finance/v2/governance/) — the alternative governance design ClearPath also reads
