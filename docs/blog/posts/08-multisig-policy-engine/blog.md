# Enough Signatures Is Not Enough: Adding Real Rules to a Shared Vault

*How a small guard contract turns "enough people approved" into "enough people approved, and it obeys the rules" — with no admin key and no way to lock a vault out of its own money*

| | |
|---|---|
| **Series** | Custody & Multisig (part 2) |
| **Part** | 8 of 34 |
| **Audience** | Founders, product managers, and the security-curious |
| **Tags** | `multisig`, `spending-limits`, `treasury-controls`, `security` |
| **Reading time** | ~7 minutes |

## The transaction that had every signature it needed

A three-owner treasury runs a two-of-three multisig: any two owners must approve before money moves. One Tuesday a proposal appears in the queue — send 180,000 USDC to an address nobody recognizes. Owner one approves it from a phone between meetings; the amount looks like the quarterly market-maker payment, and the description says exactly that. Owner two approves an hour later for the same reason. Two approvals: threshold met. The transaction executes. The address belonged to whoever phished owner one and quietly queued the proposal.

Nothing in the multisig failed. That's the uncomfortable part. A multisig has exactly one control — *enough* owners agree — and once that bar is cleared, it will send any amount, to any destination, at any time. Everything else teams rely on is procedure: "we review destinations carefully," "we never approve on mobile," "big transfers get a phone call first." Procedures are rules that live in people's heads, and people approve things between meetings.

Part 1 covered FairWins' shared vaults: a group holds a multisig with a propose-and-approve queue. This post adds the missing layer — a **policy engine** that constrains what an *already-approved* transaction may do, after the threshold is met but before the money moves. The phished proposal above dies at that final step against a per-transaction limit or a recipient allowlist, no matter how many signatures it collected.

The interesting question is *where* such rules can live so they're actually binding. Checks inside the app are only advisory — anyone can talk to the multisig directly. A rules service on a company server is just another party you have to trust. The place that actually works is a **transaction guard**: a contract the multisig itself consults, on-chain, before every execution.

## Where the guard sits

A modern Safe multisig can register a guard contract with a veto over every transaction. Just before executing an approved transaction, the Safe hands the guard the full details; if the guard objects, the transaction never runs.

FairWins' guard is a **single shared contract per network**: one immutable contract holds the rule settings and running totals for every vault that has opted in, filed under each vault's address. Because the multisig itself is the one asking, the guard always knows which vault's rules to apply — no setup handshake needed.

Two properties define the trust model. First, the guard is **restriction-only**: it can block a transaction but never start, approve, or execute one, and it holds no money. Second, **a vault is the only authority over its own rules**: changing a vault's policy is itself a transaction that must clear that vault's normal approval threshold. There is no owner, no admin role, and the guard is deliberately *not* upgradeable — an upgrade key over it would be a master backdoor over every vault's enforcement.

## The rules

Version 1 ships the classic treasury controls, each independently switchable per vault:

- **Per-transaction limit** — per asset; no single outgoing transaction may exceed it.
- **Daily limit** — per asset, over a rolling 24-hour window.
- **Recipient allowlist** — outgoing money may only go to pre-approved addresses.
- **Cooldown** — a minimum wait between money-moving transactions.

A transaction "counts" against these limits when it moves value — sending the native coin, or one of the standard token operations the guard recognizes: transfer, transfer-on-behalf-of, and *approve*. Counting approve matters: approving a spender is a spending grant, and ignoring it would leave an obvious loophole where the vault grants an unlimited allowance and the spender quietly drains it later.

The allowlist has a subtlety worth copying. For token movements it checks the *beneficiary* — whoever ultimately receives or can pull the tokens — not just the token contract being called. For everything else it checks the direct target, so even a transaction the guard can't fully interpret still can't reach an un-approved contract. A locked-down vault genuinely stays locked down.

## Closing the escape hatches first

Limits are worthless if a transaction can step outside the accounting entirely. So while any rule is active, the guard flatly rejects two dangerous shapes:

- **Code that runs inside the vault's own context.** One transaction type lets external code execute with the vault's full authority — it could move funds without tripping any rule, or even rewrite the guard's own settings. Refused outright. (The cost is that a certain batching trick isn't available on rule-governed vaults; since these flows are single-action anyway, nothing is lost.)
- **Gas-refund transactions.** The multisig can be told to reimburse the submitter's gas out of vault funds — an outflow the limits wouldn't otherwise see. Refused too.

Both rejections come back as clear, named errors, so the app can explain exactly why something was blocked instead of guessing at a cryptic failure.

## You can always loosen the rules

The classic failure mode of on-chain rules is locking yourself in: owners set a cooldown of a year, or turn on an allowlist whose only address is now defunct, and the vault is bricked. The fix is a simple, deliberate carve-out. Two kinds of transaction skip all the spending rules entirely: managing the vault itself (owners, threshold, the guard), and changing the vault's own policy. Both still require the vault's normal approval threshold — so the *only* thing exempt is the collective ability to change the rules.

The result: a too-strict policy can always be loosened by the same group consent that set it, and no vault can ever be locked out by its own rules. This isn't just asserted — it's tested against a real multisig deployment, not a stand-in mock.

## What you see is what gets enforced

Owners should learn a transaction breaks policy *before* they spend approvals on it. The guard offers a read-only preview that runs the *exact same* rule check the real enforcement uses, and the app runs every proposal through it first — so what the interface warns you about can never drift from what the chain enforces. Enforcement itself is careful about ordering: the guard reads and evaluates first, then records the updated totals, and never calls out to another contract, so there's no room for the reentrancy trickery that plagues contracts that move money.

## Rules from the very first transaction

A guard attached *after* creation leaves a window where early transactions are unpoliced. So FairWins can wire the guard in during vault creation itself: the guard address and starting rules are part of the setup, baked into the vault's predicted address, and if any part of that setup fails the whole creation is aborted — a half-configured vault can never come into existence. For an existing vault, attachment is ordered so there's never a moment where the guard is half-on.

## Design decisions and accepted limits

**Immutable, not upgradeable — on purpose.** Elsewhere FairWins leans on upgradeable contracts, but the guard has no upgrade path by design: whoever could swap it out could disable every vault's enforcement. Improvements ship as a *brand-new* guard that each vault chooses to adopt through its own approval — consent per vault, never a decision imposed by a single deploy key.

**Fixed daily window, not perfectly rolling.** A truly continuous rolling window would require storing unbounded transaction history on-chain. The simpler fixed-reset window can, in a worst case straddling a reset, allow up to twice the limit — a small, bounded weakening that's disclosed in the interface rather than hidden.

**Uninterpreted transactions pass the spending limits.** The guard values native transfers and the standard token operations; something exotic like a DEX swap passes the *spending* limits unmeasured. It still faces the *allowlist* on its target — so a vault that needs a hard lockdown turns on the allowlist and gets one.

**Conservative accounting.** Totals are recorded before the transaction executes. If the inner action later fails quietly, the spend still counts. Overcounting can only ever restrict, never over-permit — the safe direction to err.

The through-line: every rule that exists is enforced exactly, every gap that exists is named, bounded, and disclosed, and no key anywhere can quietly waive either.

## Further reading

- Safe transaction guards, the mechanism used here — https://docs.safe.global/advanced/smart-account-guards
- The ERC-20 token standard (transfer / approve behavior) — https://eips.ethereum.org/EIPS/eip-20
- CREATE2, the deterministic-address technique that lets a vault commit to its rules up front — https://eips.ethereum.org/EIPS/eip-1014
