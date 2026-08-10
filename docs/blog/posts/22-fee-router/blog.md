# One Place for Every Fee: How FairWins Keeps Its Pricing Honest

*How FairWins moved every platform fee into a single, capped, on-chain price list — so the number you see is always the number you pay*

| | |
|---|---|
| **Series** | Finance Surfaces (part 1) |
| **Part** | 22 of 34 |
| **Audience** | Product managers, founders, and the crypto-curious |
| **Tags** | `fees`, `pricing`, `transparency`, `product` |
| **Reading time** | ~6 minutes |

## Three fee systems, three chances to get it wrong

By mid-2026, FairWins had shipped three features that touched money, and each had grown its own way of handling fees. One feature, a marketplace connection, cost members nothing — the partner paid FairWins out of its own economics. Another, prediction-market trading, carried a small, disclosed trading fee that lived in the server's settings. And a third, a savings-style feature that earned yield on idle funds, had no way to make money at all.

The plan was to add a small platform fee to that savings feature. The obvious way to build it was also the wrong way: write the fee into the deposit code, add a copy to the server's settings, and put a matching number in the app so the confirmation screen shows the right percentage. That's three copies of one number, each owned by a different release process. Someone updates one, forgets another, and a member approves a screen that says 0.50% while the system actually charges 0.60%. For a company whose whole pricing philosophy is *you always see the real cost before you approve anything*, a stale number on a screen isn't a cosmetic bug. It's a broken promise.

There's a second problem that no amount of careful configuration solves: timing. Suppose a member is reviewing a deposit at 0.50%, an administrator raises the rate to 0.75%, and the member's transaction happens to go through just after the change. Whatever the screen said, the system charges the current rate. When the fee logic is scattered across three places, there's nowhere to even express the idea "never charge me more than what I was just shown."

FairWins' answer was to make fees a first-class part of the system with a single home: one on-chain price list that is the *only* place any fee rate lives — and to make the payment step itself enforce the promise on the screen.

## A single, tamper-evident price list

Think of it as one shared, public price list living on the blockchain. Every fee the platform can charge is one entry on that list, labeled by what it's for — the savings fee, the trading fee, and so on. Each entry holds just two things that matter to a member: the current rate, and a hard ceiling that rate can never exceed.

That ceiling is the key idea. When a fee is first added to the list, its maximum is fixed forever. An administrator can move the current rate up and down beneath that ceiling, but no one — not even an admin — can raise the ceiling itself. For fees that FairWins charges directly, there's also an absolute company-wide limit of 2.5%, so no single entry can ever be set higher than that.

Some entries on the list are charged directly by the platform. Others are just a published number that a separate part of the system reads and applies elsewhere — the prediction-market trading fee works this way, where the price list simply holds the agreed-upon number everyone references. One list, two uses, no duplicate copies of the number floating around.

Every rate change is recorded permanently and publicly on the blockchain, including who made it. That record *is* the audit history — the admin screen that shows fee changes just reads it back rather than keeping its own separate log that could drift out of sync.

## Charging the fee and delivering the value, all at once

For fees FairWins charges directly, the platform does the whole thing in a single, all-or-nothing transaction. When a member deposits into the savings feature, one step pulls in their money, sends the small fee to the company treasury, and puts the remainder to work on the member's behalf — together, indivisibly.

The "all-or-nothing" part matters. If any piece fails, the entire transaction is undone. The treasury can never end up holding a fee for a deposit that didn't actually happen. And there's a further safeguard: if the member's money would somehow buy them nothing in return, the whole thing reverts rather than letting their principal vanish. The fee is only ever payment for value actually delivered.

Two small design choices show the safety-first mindset. Rounding always favors the member — a fee small enough to round down to nothing is simply charged as zero. And if a particular network was never fully set up with a treasury to receive fees, the system skips the fee entirely and completes the deposit anyway. A setup mistake on FairWins' side can cost FairWins some revenue, but it can never strand a member's money.

## The confirmation screen becomes a promise the system keeps

Here's the piece that closes the timing gap. Before a member ever signs anything, the app reads the live rate straight from the price list and shows it. Then, when the member approves, that exact rate they saw travels along with the transaction as a ceiling.

The result: if an administrator raises the rate while a member's transaction is in flight, the member either pays no more than what the confirmation screen showed, or the transaction simply stops and they get to review again. The confirmation screen is no longer a courtesy or a best guess. It's a limit the system itself enforces. The one rule everyone building on this must follow is a matter of honesty, not code: never send along a ceiling you didn't actually show the member.

## Honest disclosure, made mechanical

FairWins had this fee philosophy before the price list existed: fees are shown before you approve, as a clearly named line with the real percentage and the real dollar amount — never hidden, never buried inside a spread, never called "free" when it isn't. The price list turns that philosophy into a system with exactly three possible outcomes, and every feature must handle all three:

- **No fee applies here** (this network has no price list, or the fee was never turned on): the feature proceeds with no fee and no fee line at all — behaving exactly as it did before fees existed. A zero fee is invisible, as it should be.
- **A live rate is available**: show it plainly, and carry it along as the enforced ceiling.
- **The rate couldn't be read** on a network that should have one: stop and don't proceed. The one thing a feature may never do is guess low and possibly undercharge in a way that misleads. The deposit flow pauses until the rate can be confirmed — fail safe, not fail open. (Withdrawals are never affected.)

The server side follows the same discipline. It reads published rates from the price list, keeps a short-lived cached copy, and falls back to a labeled default only during an outage — always honestly marked as a fallback. Crucially, the server keeps no fee settings of its own. There's no second place to change a number. An admin edits the one on-chain list, and everything else follows.

## Why build it this way

**One list instead of per-feature fee code.** The old approach — each feature owning its own fee logic — is exactly how the tangle of duplicate numbers happened in the first place. Now a new integration simply *registers an entry* on the list: pick a label, set a ceiling, and reuse the standard show-it-then-charge-it flow. The rate starts at zero, so nothing is charged until someone deliberately turns it on.

**Central configuration is not central trust.** Administrators got one convenient screen, but members got stronger guarantees than before: a permanent ceiling on every fee, an absolute company-wide cap, a rate you can't be charged above once you've seen it, and a public, permanent history of every change. The admin's power is fenced in by limits anyone can verify for themselves.

**You're charged on the way in, never on the way out.** Fees apply when you put money in; withdrawals are always free. It keeps the mental model simple — you saw the cost when you deposited — and keeps the exit path completely independent of any fee lookup.

**Rounding favors you.** On tiny amounts the fee rounds down to zero, and that's charged as zero. A deliberate small bias in the member's favor.

**Honest limits.** The system assumes ordinary, well-behaved digital dollars like USDC; exotic tokens that change their own balances aren't supported. And because a fee's ceiling is permanent, a mistaken ceiling can't be edited — only abandoned in favor of a fresh entry. That rigidity is the price of a ceiling members can rely on. The price list itself can be improved over time to support new kinds of fees, always keeping the same guarantees: show the rate, respect the ceiling, record the change.

The result is a fee system whose most important property is one members never have to think about: there is no path on which the number they were shown and the number they're charged can ever drift apart.

## Further reading

- [ERC-4626: Tokenized Vaults](https://eips.ethereum.org/EIPS/eip-4626) — the shared standard for the yield-earning pools the savings fee wraps
- [ERC-1822 / UUPS proxies](https://eips.ethereum.org/EIPS/eip-1822) and [OpenZeppelin's upgradeable-contract docs](https://docs.openzeppelin.com/contracts/5.x/api/proxy) — the widely used pattern that lets an on-chain system be improved over time without losing its data
- For deeper implementation details, see the FairWins developer documentation.
