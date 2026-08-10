# What Is a Multisig Wallet?

*A joint account for the blockchain age — where money only moves when enough people say yes*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Security & Custody |
| **Level** | Beginner |
| **Audience** | Anyone curious how groups hold money safely on-chain |
| **Tags** | `multisig`, `custody`, `security`, `shared-treasury`, `beginner` |
| **Reading time** | ~5 minutes |

## The problem with one key

Imagine your family's entire savings sat in a single drawer, and there was exactly one key to that drawer. Whoever holds the key can take everything, anytime, no questions asked. Lose the key and the money is gone forever. Have it stolen and the thief owns it all. You'd never run a household — let alone a business — that way.

Yet that's how an ordinary crypto wallet works. A normal wallet is controlled by one secret key. Whoever has that key controls the money, completely. For a personal wallet that's manageable. But what about a group — a club treasury, a company's funds, a shared pot between friends? Handing all of it to one person's single key is asking for trouble. A **multisig wallet** solves exactly this.

## What it is

**Multisig** is short for "multi-signature." A multisig wallet is a shared wallet that requires *several* approvals before any money can move — not just one.

The closest everyday comparison is a **joint checking account that needs two signatures on every check**, or a bank vault with several keyholders where the door only opens when enough of them turn their keys at the same time. No single person can walk off with the contents. The group decides together, by design, not by good manners.

## Why it exists: "M-of-N"

Every multisig is set up with two numbers, usually written as **M-of-N**.

- **N** is the total number of owners — the people who each hold one key.
- **M** is how many of them must approve before money moves.

A **2-of-3** multisig has three owners, and any two of them must agree to send funds. A **3-of-5** has five owners and needs three. You choose the numbers to fit the group.

This simple setup buys you two kinds of protection at once:

- **No single point of failure.** If one person's phone is stolen, one laptop is hacked, or one owner goes rogue, the money is still safe. A thief with one key out of three in a 2-of-3 wallet can't do anything alone.
- **No single point of lockout.** You don't lose everything if one key is lost. In that same 2-of-3, the other two owners can still move the funds and set things right.

That balance — safety without fragility — is why serious on-chain organizations, company treasuries, investment funds, and careful groups of friends overwhelmingly hold their money in a multisig rather than a single-key wallet.

## How it works, step by step

You don't need to understand the cryptography to grasp the flow. A multisig transaction goes like this:

1. **Someone proposes a transaction** — say, "send 500 USDC to this address." Proposing isn't sending; it just puts the request on the table.
2. **The other owners review it.** Each can see exactly what's being asked: the amount, the destination, the purpose.
3. **Owners approve.** Each approval is signed with that owner's own key. Approvals accumulate.
4. **Once the threshold is met** — enough owners have approved to satisfy the M-of-N rule — the transaction can execute, and only then does the money actually move.

Until that threshold is reached, nothing happens. The funds sit safely, waiting for the group to agree. It's genuinely a group decision, enforced by the wallet itself rather than by trust or paperwork.

## How this shows up in FairWins

FairWins lets a group hold a **shared vault** — a treasury that belongs to the whole group rather than to any one person. Under the hood, these vaults use **Safe**, the most widely used and battle-tested multisig on Ethereum and related networks, rather than anything home-grown. The group can then act *as the group*: place a wager or send a payment from the shared vault, with the money only moving once enough co-owners have approved.

Because it's a standard Safe, a group's existing multisig can be brought in just by its address, and the vault works with the wider Safe ecosystem too. FairWins deliberately builds this so the group's control never depends on a company server being online — the coordination happens on the blockchain itself. The point is simple: a group's shared money should require the group's shared consent, and no single person, not even FairWins, should be able to move it alone.

## What to watch out for

- **Choose M and N thoughtfully.** Too few required signatures and you lose the safety benefit; too many and day-to-day spending becomes painful, or a couple of unavailable owners can stall the group. Many treasuries land on 2-of-3 or 3-of-5 for a reason.
- **Losing keys still matters.** A multisig protects you from losing *one* key. Lose enough keys to drop below the threshold — for good — and the funds can become unreachable. Owners should each safeguard and back up their own key.
- **Approvals deserve real attention.** A multisig only helps if owners actually check what they're approving. Two people who both rubber-stamp a proposal without reading it have simply agreed to the same mistake. (There's a companion idea — spending guardrails — that adds automatic rules on top of approvals; that's a topic of its own.)

A multisig turns "trust one person completely" into "let the group decide together." For anyone holding money on behalf of others, that shift is the whole point.

## Related deep-dive

Want the engineering details — how FairWins coordinates a shared vault using nothing but the blockchain, no company server required? Read [Shared Vaults Where No One Person Can Move the Money](../../posts/07-safe-multisig-custody/blog.md).

## Learn more

- [Ethereum.org: What is a multisig wallet?](https://ethereum.org/en/developers/docs/smart-contracts/security/#multisignature-wallets)
- [Safe — the multisig FairWins uses](https://safe.global/)
- [Investopedia: Multisignature Wallet](https://www.investopedia.com/terms/m/multisignature.asp)
