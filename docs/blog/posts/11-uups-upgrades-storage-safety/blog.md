# Renovating a Contract Without Changing Its Address

*How FairWins ships new escrow logic to a live, funds-holding contract — and why an automated safety check runs before every change is allowed in*

| | |
|---|---|
| **Series** | Contract Architecture (part 1) |
| **Part** | 11 of 34 |
| **Audience** | Product, founders, and the technically curious |
| **Tags** | `smart-contracts`, `upgrades`, `safety`, `design` |
| **Reading time** | ~7 minutes |

---

## The move that strands everyone

Picture the escrow contract at the center of a peer-to-peer wager platform. It holds real stakes — dollars in stablecoin, locked between two people who have a bet running. A whole ecosystem points at it: the app, the blockchain indexer, every open wager. Now the roadmap calls for a new kind of wager — open challenges anyone can accept — which means new logic on that same contract.

Here's the catch that makes smart contracts different from ordinary software. A normal app, you deploy the new version over the old one. A smart contract, historically, you cannot edit at all. The only way to "change" one was to deploy a brand-new contract at a brand-new address — and a brand-new contract starts completely empty. Every wager, every balance, every record on the old address gets left behind, **stranded**: still holding people's money, but at an address the app no longer points to. Users would have to be migrated or paid out by hand on every single release.

The fix, in principle, is old news: put a permanent *front door* in front of the logic. The address people use never changes; the logic behind it can be swapped. Think of it as renovating a building without changing its street address — the tenants, the mail, the lease all stay put; only the interior gets redone.

But "just make it upgradeable" is not a plan, because the failure modes are genuinely nasty. Done carelessly, a fresh renovation can be hijacked by a stranger before anyone moves in. A setup step that quietly fails to run can leave the whole thing subtly broken. And — the scariest one — rearranging where the building stores its records can scramble everything already on the shelves, silently, with no warning from any tool. When those records are people's escrowed money, "silently scrambled" is a catastrophe.

So FairWins built the renovation machinery once, made it boring, and made the dangerous part *impossible to slip through*. Seven contracts now sit behind permanent front doors at stable addresses — the wager escrow, the membership system, the fee router, and others — all built on one small shared foundation, all guarded by the same automated check.

## The shape: a permanent front door, swappable rooms

Each upgradeable contract is really two pieces: a thin, permanent **front door** at a fixed address that never changes, and the **current logic** behind it, which is what actually gets swapped during a renovation. FairWins keeps a written record of *both* addresses for every contract. That second address isn't just bookkeeping — the safety check compares any proposed new logic against *the exact logic currently live on that network*, so this record is what lets the check know what it's protecting.

## One shared foundation, not seven copies

The reusable piece is a small shared foundation — a few dozen lines — that every upgradeable contract builds on. It carries no business logic of its own, just the renovation-and-access plumbing everyone needs, wired so the classic mistakes can't be made twice. Three choices are baked in.

**A fresh renovation can never be hijacked.** The raw logic, sitting off to the side before it's wired up behind a front door, is reachable by anyone; left open, a stranger could "move in" first and cause mischief. The foundation permanently locks that side door shut the moment the logic is created. Only the real front door can ever be set up, and only once — closing the textbook attack cold.

**Upgrade power is separate and can never be lost.** The authority to install new logic is its own dedicated key, kept apart from general administration, so it can later be handed to time-delayed or multi-signature governance without touching code. And because the "how to upgrade me" instructions live in the shared foundation every version inherits, no upgrade can accidentally delete the ability to do *future* upgrades. On live networks that key is held on air-gapped, offline storage — with a blunt trade-off: lose it and the contract keeps running forever but can never be renovated again.

**Room to grow is reserved up front.** The foundation sets aside a block of empty, reserved space so shared features can be added later without disturbing anything already in place — which brings us to the single most important rule of the whole system.

## Setup runs once, and the bug everyone hits

Because of how the front-door arrangement works, the normal "set things up when the contract is first created" step runs in the wrong place and gets ignored. So every contract does its initial setup through a special routine that runs exactly once, behind the real front door.

This is where teams get burned. Any starting value set the "old" way — say, "wager numbering begins at 1" — silently never takes effect behind a front door, so wagers would start numbering at zero instead, with no compiler warning. The rule that prevents it is simple: don't set starting values inline; set every one inside that one-time routine. FairWins hit exactly this and calls it out in its developer guide. Later upgrades that need to set up *new* state get their own controlled one-time step, which can only ever run once.

## Append-only records, and a reserve that shrinks on schedule

Here is the rule that keeps escrowed money safe across renovations, stated plainly: **never rearrange, remove, or change the meaning of any record the contract already keeps — only ever add new ones at the end.** Think of the contract's storage as numbered shelves. Insert something in the middle and everything downstream shifts by one; now the contract reads balances off the wrong shelf. So new records only ever go on the end, drawing down from that reserved block of empty space set aside up front.

This isn't theoretical. FairWins' wager registry has been renovated twice this way — the open-challenge feature added a couple of records, a later gasless-payments upgrade added a few more — and the reserve shrank by exactly that much each time, so everything already on the shelves stayed put. The reserve getting smaller over time is the system working as intended; you can read the contract's history in that single shrinking number.

## The gate: making the unsafe change impossible to merge

Good intentions don't survive a busy Tuesday afternoon. So the append-only rule isn't left to discipline — it's enforced by an automated check that runs before any change is allowed to merge, and fails the build loudly if violated. Built on well-regarded open-source upgrade-safety tooling, it compares proposed new logic against *what is actually running on that network right now* and confirms the records line up shelf-for-shelf. Rearrange, remove, or repurpose a shelf and the check fails before the upgrade can even exist.

Adding a new contract to this protection is a one-line change, which is how five later contracts inherited the original safety net for free. And it's belt-and-suspenders: the deployment tooling runs the same validation *again* at the moment of upgrade, before anything is sent to the blockchain — so an incompatible change fails harmlessly on a developer's machine instead of corrupting funds on a live network. To change a live contract you renovate it in place; re-running the *initial* deploy would mint a whole new front door at a new address, so you never do that.

## Design decisions

**A shared foundation instead of per-contract copies.** Copy-pasted plumbing drifts, and drifted plumbing is exactly where a locked side door quietly gets left open. One shared foundation centralizes all the dangerous parts, so adopting it is nearly mechanical: build on the foundation, move setup into the one-time routine, reserve some growing room, register with the tooling.

**Coexistence instead of a risky mass migration.** The old, non-upgradeable registry couldn't be retrofitted, and moving live escrow en masse was judged too dangerous. So old wagers stay settle-only at the old address while every new wager lands on the new front door, and the app shows both honestly until the old side drains naturally.

**Roll forward, never back.** There's no automatic undo. A bad renovation is fixed by renovating *again* to a corrected version — and because the ability to do future upgrades can never be lost, that path is always open.

**Honest limits.** Upgradeability is a trust statement, not a free lunch: whoever holds the upgrade key can replace the code that holds user stakes. FairWins mitigates that with separated keys, offline signing, and a documented path to time-delayed or multi-signature governance — but "upgradeable" and "immutable" are opposite promises, and the platform makes that choice deliberately, per contract. Some, like a bearer collectible meant to be permanent, are intentionally left *un*-upgradeable.

## Further reading

- [Upgradeable smart contracts — OpenZeppelin docs](https://docs.openzeppelin.com/upgrades-plugins/) — the public tooling and patterns this design builds on
- [Proxy pattern (upgradeable contracts) — overview](https://blog.openzeppelin.com/proxy-patterns) — plain-language introduction to the front-door approach
- [The Spurious Dragon hardfork](https://en.wikipedia.org/wiki/Ethereum) — background on why contracts have hard limits at all
- For FairWins-specific details, see the FairWins developer documentation.
