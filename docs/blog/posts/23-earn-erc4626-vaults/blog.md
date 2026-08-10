# Earn Without Surprises: Putting Idle Funds to Work, With a Fee You Can See

*How FairWins lets members earn yield on idle stablecoins without ever handing over custody — and charges its fee in the open, in the same transaction*

- **Series:** Finance Surfaces (part 2)
- **Part:** 23 of 34
- **Audience:** Product managers, founders, and the crypto-curious
- **Tags:** `yield`, `savings`, `non-custodial`, `fees`, `transparency`
- **Reading time:** ~7 minutes

---

## The idle-money problem, and two tempting shortcuts

FairWins members hold stablecoins — digital dollars like USDC — in their accounts between wagers. In the stretch between one payout landing and the next wager being created, that money just sits there. Members asked the obvious question: can it earn something in the meantime? And the team ran straight into the two answers most consumer crypto apps reach for.

The first tempting shortcut is to take custody: build your own savings product, pool everyone's deposits, and manage the strategy in-house. That quietly turns a wager-escrow platform into an asset manager — holding member money and taking on exactly the kind of trust obligations the rest of FairWins is deliberately designed to avoid.

The second tempting shortcut is the hidden skim: route deposits into someone else's yield product, quietly keep a slice of the return, and let members discover the difference only if they go looking. Plenty of "earn" features work this way. It's also precisely the kind of quiet markup FairWins' own standards forbid — every fee is shown before you approve it, or it doesn't exist.

The Earn feature avoids both traps. Deposits go **straight from the member's own account into established, third-party yield pools** — curated lending vaults run by Morpho, a well-known protocol, on Ethereum and Polygon — with FairWins never holding the money. And the platform fee, when one is turned on, is charged **in the very same transaction**, by an on-chain price list that refuses to charge a penny more than the rate the member was shown.

## A "vault," in plain terms

Before going further, one piece of vocabulary. In this world, a **vault** is just a shared pool that earns yield. Many people deposit the same kind of digital dollar into one pool; the pool lends those dollars out and earns interest; and each depositor owns a proportional slice, which grows as the interest accrues. When you want out, you redeem your slice for your share of the pool.

There's a widely adopted standard for how these pools behave, called ERC-4626. Because it's a standard, any app can deposit into, check, and withdraw from any compliant pool in a consistent way — the same reason a standard electrical outlet lets any appliance plug in. Morpho's vaults follow it fully, which is what let FairWins connect to them cleanly.

## Half one: deposits that never touch a FairWins wallet

Because these vaults follow a common standard, the basic Earn experience needed **no FairWins smart contracts and no FairWins server** in the money path at all. The app finds available vaults through Morpho's public directory (the same curated list the Morpho app itself uses), reads each member's balance directly from the blockchain, and lets members claim earned rewards through the standard distributor.

One curation detail is worth mentioning because it protects members: FairWins only surfaces vaults that can honestly report their own deposit and withdrawal limits. A newer vault design that hides those limits is deliberately left out — because showing members accurate limits is load-bearing here, not decoration.

Before any deposit, the app runs several safety checks: it rejects amounts that are zero, more than the member has, or over the vault's cap; it approves only the **exact amount** — never an open-ended, unlimited permission; it does a dry run first, so a vault-side rejection surfaces *before* the member signs; and on a full exit it redeems the member's entire slice, so no tiny remnant gets stranded.

Members using a passkey wallet — the same face-or-fingerprint login standard (WebAuthn) your phone uses — can approve the whole thing with a single tap. Throughout, custody never changes hands: the vault deposits directly in the member's name, and the resulting slice sits in the member's own account, not FairWins'.

Notably, Earn first shipped with **no platform fee at all**. Morpho has no built-in way to reward an app for sending it deposits, so there was no clean way to earn revenue on the connection — and rather than bolt on a rushed fee, FairWins made fee-free operation an explicit, documented decision and deferred the revenue question to later.

## Half two: the fee, and why it belongs on-chain

"Later" is this feature's second half. The key decision: a platform fee charged on top of someone else's yield product must be **all-or-nothing** — the fee and the deposit happen together in one transaction, or neither happens. The naive alternative, two separate steps ("send us the fee, then deposit the rest"), can leave a member stranded halfway: fee paid, deposit failed, treasury holding money for a service that never happened.

FairWins solves this with its single on-chain price list — the one and only home for every platform fee. Each fee is one labeled entry with a current rate and a permanent ceiling it can never exceed. The Earn fee registers at a ceiling of 2.5%, with a live rate of **zero** until an administrator deliberately sets one.

When a fee is active, a single transaction does the whole job: it pulls in the member's money, sends the small fee to the treasury, and deposits the remainder into the vault with the member as the owner. If any step fails, the entire thing is undone — the treasury can never keep a fee for a deposit that didn't go through. Three safeguards carry most of the design's weight:

**The rate you saw is a hard ceiling.** The app sends back the exact rate it displayed. If an administrator raises the rate while a member's transaction is in flight, the transaction stops rather than charging the higher number. A member can never pay more than what was on the confirmation screen — enforced by the system, not by good manners.

**A missing treasury skips the fee; it never loses funds.** If some network was never set up with a treasury to receive fees, the system simply deposits the full amount, fee-free. A setup mistake costs FairWins revenue; it never strands a member's principal.

**No value, no charge.** If the member's money would somehow buy them nothing in the vault, the whole transaction reverts rather than taking a fee for nothing.

Rounding always favors the member — a fee small enough to round to nothing is charged as zero — and the system deliberately supports only ordinary, well-behaved digital dollars like USDC.

## The disclosure promise: three outcomes, no fourth

Before the deposit screen ever shows a confirm button, the app reads the live rate and lands in exactly one of three states:

1. **No fee applies** (this network has no price list, or the Earn fee was never turned on): the flow proceeds fee-free, behaving *exactly* as it did before fees existed. No fee line appears — because implying a fee that isn't charged is as dishonest as hiding one that is.
2. **A live rate is available**: the deposit screen shows a clearly named "FairWins platform fee" line — the percentage, the dollar amount, and the net amount reaching the vault — before any signature. The rate the member saw is pinned to the transaction as its ceiling.
3. **The rate couldn't be read** on a network that should have one: the screen **blocks the deposit** with an honest "we couldn't confirm the fee right now" message. Proceeding on a possibly-understated rate isn't an option, and neither is silently assuming zero.

There is deliberately no fourth outcome. Every rate change, meanwhile, is public and permanent, forming the audit history the admin panel reads back — and each charge is a matching public record, so the fee taken always equals the transfer to the treasury in the same transaction.

## Why build it this way

**A fee on the way in, not a cut of your yield.** FairWins takes a small percentage of the principal at deposit and touches nothing afterward. A performance fee — a cut of the returns — would require FairWins to sit inside the yield path and effectively hold member deposits, which is exactly the custody the platform refuses. An entry fee keeps positions purely member-owned.

**One price list, not a fee per feature.** The next yield integration just registers a new labeled entry — a configuration change, not new code — reusing the same charge-and-deposit path, ceiling, consent limit, and public record. The alternative, every feature inventing its own fee handling, is how platforms end up with rates hardcoded in three places and no audit trail.

**Honest failure over a smooth guess.** Much of the design's care goes into refusing to guess: a rate that can't be read blocks the action rather than defaulting to zero; an unconfigured fee is treated as no fee rather than an unknown fee; a missing treasury skips rather than reverts. The rule underneath all of it: the member either sees the true number, or the action doesn't happen.

Worth naming honestly: the fee only touches deposits, so withdrawals are always free — the system can't hold an exit hostage. And the yield itself is entirely Morpho's. FairWins doesn't guarantee any particular return, and the vaults carry their own risk as third-party software — which the Earn screen states plainly, right under a required "Powered by Morpho" credit.

## Further reading

- [ERC-4626: Tokenized Vaults](https://eips.ethereum.org/EIPS/eip-4626) — the shared standard behind the yield pools this feature connects to
- [Morpho documentation](https://docs.morpho.org/) — the third-party lending protocol whose vaults power Earn
- [OpenZeppelin contract libraries](https://docs.openzeppelin.com/contracts) — the widely used building blocks for safe token handling and upgradeable on-chain systems
- For deeper implementation details, see the FairWins developer documentation.
