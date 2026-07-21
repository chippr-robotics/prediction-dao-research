# One Contract, Two Halves: Beating a Hard Size Limit Without Moving House

*How FairWins added sixteen new gasless features to a contract that had almost no room left — without changing the address everyone already relies on*

| | |
|---|---|
| **Series** | Contract Architecture (part 2) |
| **Part** | 12 of 34 |
| **Audience** | Product, founders, and the technically curious |
| **Tags** | `smart-contracts`, `architecture`, `gasless`, `design` |
| **Reading time** | ~7 minutes |

---

## A strict page limit, almost reached

Ethereum-style blockchains impose a rule that surprises people the first time they hit it: a deployed smart contract cannot exceed a fixed size — roughly 24 kilobytes of compiled code. It's a hard ceiling baked into the network for a good reason (it stops one contract from forcing every computer on the network to load an unboundedly large program), and it isn't going away. Think of it as a strict page limit on a document that must fit in a single binder.

FairWins' central wager contract had almost filled that binder. When the team set out to add platform-wide *gasless* features — acting without paying network fees yourself — the contract had already compiled to within a hair of the limit: about 116 bytes of headroom left. Not 116 kilobytes — 116 *bytes*, roughly the length of this sentence.

The new work needed far more than that. It called for roughly sixteen new entry points: for every core action — create a wager, accept one, claim winnings, request a refund — a companion version that lets someone act by signing an instruction instead of paying fees directly, each carrying its own signature-checking and anti-replay bookkeeping. Sixteen of those do not fit in 116 bytes. They don't fit in a hundred times that.

The usual escape hatches all had problems. Packing the code more tightly makes every transaction cost users more, forever. Moving logic into separate helper modules is invasive surgery on a live, audited, money-holding contract. And you can't just deploy the new features as a *separate* contract at a *separate* address, because the whole point is that this contract lives at one **stable address** — one identity that the app, the blockchain indexer, and thousands of already-signed instructions all depend on. Move house and you break all of them.

What shipped instead was a neat trick: keep one address, one identity, one public face — but split the contract internally into **two cooperating halves** that share a single set of records.

## One front door, two halves behind it

Here's the arrangement. The contract still presents a single front door at a single address. Behind it sit two halves:

- The **main half** holds everything that was already there — creating wagers, accepting them, claiming payouts — plus a small piece of "receptionist" logic for anything it doesn't recognize.
- The **extension half** holds all the new gasless companions, plus a few rarely-used, non-urgent functions that were moved over simply to free up space in the main half.

When a request comes in for something the main half knows how to do, it handles it directly, exactly as before — no slowdown, no extra cost. When a request comes in for something the main half *doesn't* recognize, that receptionist logic quietly forwards it to the extension half, which does the work and answers as if it had been the front desk all along.

The crucial detail is *how* it forwards. The extension half doesn't run off on its own; it runs *as if it were part of the main contract*, using the same records, address, and identity. To anyone outside — a user, the app, the indexer — there is simply one contract that happens to know how to do everything, with no visible seam. This matters enormously for signed instructions: a signature is bound to a specific contract identity, and because both halves share the exact same identity, an instruction verifies correctly no matter which half carries it out.

Which functions went where was a deliberate sort by *temperature*. The new gasless companions went to the extension. So did **cold** functions — housekeeping tasks with no impatient user waiting, like batch-expiring stale wagers or pulling in an outcome from an external data source — relocated purely to reclaim room. The **hot** paths people use constantly stayed in the main half, paying zero extra cost. Only gasless and housekeeping calls take the small detour.

## The discipline that makes it safe

Two halves sharing one set of records is exactly the setup that, done wrong, corrupts everything. If the two halves disagree by even a little about how those records are organized, one of them will read balances off the wrong shelf. So the defense is structural, not a matter of care: **the record layout is defined in exactly one place** — a shared base that *both* halves are built on. There is no second copy to drift out of sync. Both halves inherit the same shelf plan by construction.

That shared base holds something else: the single authoritative version of *what each action actually does*. Rather than writing "accept a wager" twice — once for the pay-your-own-fee path, once for the gasless path — the real logic lives once and simply takes "who is acting" as an input. The direct path passes in the sender; the gasless companion passes in whoever signed the instruction. One body of logic, two ways to reach it — so the two versions of an action *cannot* drift apart in their rules any more than the records can.

And because discipline you can't verify is just hope, the same automated safety check from part 1 of this series was extended to police the two halves. Before any change can merge, it treats the extension half as if it were a proposed upgrade of the main half and confirms their record layouts still line up perfectly. Any drift fails the build before it can ship.

## Turning the whole thing off is a feature

Pointing the front door's receptionist at the extension half is a powerful act — that half runs with full access to the shared records — so the authority to change where it points is the same high-privilege, offline-held key that authorizes upgrades in general. Nobody else can repoint it.

That same pointer doubles as an off switch. Set it to "nowhere" and the entire gasless surface goes dark in one move — the receptionist simply reports "I don't know that function" for every gasless request. That sounds drastic, but it's safe by design, because every gasless action has a pay-your-own-fee twin. Flipping the switch degrades the product to "users pay their own network fees," never to "users are stranded mid-wager." It's a kill switch you can actually afford to use.

## One contract, as far as anyone can tell

For everyone building on top, the seam is invisible. The tooling presents both halves as a single contract with one combined menu of functions; developers call a direct action and its gasless twin on the same object without knowing a boundary exists. The blockchain indexer needs no changes at all, because every event still comes from the one shared address. The split is an internal detail that never surfaces.

*FairWins wagers settle from public-information outcomes via external oracles; participants remain subject to applicable law and compliance obligations in their jurisdictions.*

## Why not the fully general solution?

There's a well-known, more elaborate pattern for exactly this problem — the "Diamond" standard — that lets a single contract fan out to unlimited independently-upgradeable pieces, with on-chain machinery to track which piece handles what. It's the canonical answer to "my contract won't fit," and it deserves an honest comparison rather than a strawman.

If FairWins expected this contract to keep growing indefinitely across many separately-managed modules, that machinery would earn its cost. The team chose the simpler two-half approach for four concrete reasons:

1. **It already had a working upgrade standard.** Switching frameworks would have meant replacing live, audited infrastructure just to solve a size problem — maximum risk for a narrow need.
2. **Tooling and verification are simpler.** The existing safety tooling understands the two-half arrangement out of the box; the general framework is rougher to validate and to verify on block explorers.
3. **Hot paths stay fast.** The general framework routes *every* call through an extra lookup step. Here, common actions dispatch directly at no added cost; only gasless and housekeeping calls take the detour.
4. **Smaller attack surface.** The general framework's routing machinery is its own body of code with a history of subtle bugs. The two-half routing is a dozen lines plus one gated switch.

The trade-offs cut both ways. The two-half design has no on-chain catalog of what the extension can do, and it doesn't gracefully scale past two or three halves — a chain of forwarders would just be a worse version of the general framework. If the extension half ever approaches the size limit itself, the right move is probably to adopt the full framework then, rather than pre-pay for it now.

For one contract, one overflow, and a hard requirement to preserve a live address, a stable public face, an unbroken event stream, and a signing identity that thousands of instructions already trust: two cooperating halves, one shared record layout, and an automated gate was the smallest design that is genuinely safe.

## Further reading

- [EIP-170: contract code size limit](https://eips.ethereum.org/EIPS/eip-170) — the origin of the ~24 KB ceiling
- [EIP-2535: the Diamond standard](https://eips.ethereum.org/EIPS/eip-2535) — the general multi-piece pattern discussed above
- [Upgradeable contracts — OpenZeppelin docs](https://docs.openzeppelin.com/upgrades-plugins/) — the safety tooling this design reuses
- For FairWins-specific details, see the FairWins developer documentation.
