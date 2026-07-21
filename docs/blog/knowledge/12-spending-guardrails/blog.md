# What Are Spending Guardrails?

*Why "enough people approved" sometimes isn't enough — and how automatic rules can stop a bad transaction before the money moves*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Security & Custody |
| **Level** | Beginner–Intermediate |
| **Audience** | Anyone responsible for shared or organizational funds |
| **Tags** | `guardrails`, `spending-policy`, `treasury-controls`, `security`, `beginner` |
| **Reading time** | ~6 minutes |

## The transaction that had every approval it needed

Picture a small team treasury run as a shared wallet where any two of three owners must approve before money moves. One Tuesday, a request appears: send a large payment to an address. The amount looks about right for a routine bill, and the note says exactly that. One owner approves it from their phone between meetings. An hour later, a second owner approves for the same reason. Two approvals — the rule is satisfied — and the money goes out.

Except the address belonged to a scammer who had tricked one of the owners into queuing the request. Every approval was real. Nothing about the wallet "failed." And that's the uncomfortable lesson: a shared wallet has exactly one control — *enough people agreed* — and once that bar is cleared, it will send any amount, to any destination, at any time.

Requiring multiple approvals is powerful (it's the topic of its own primer). But approvals answer only one question: *do enough people say yes?* They can't answer *should this particular transaction be allowed at all?* That second question is what spending guardrails are for.

## What they are

**Spending guardrails** — also called spending policies or transaction guardrails — are automatic rules that can block a transaction even when enough people have approved it. They're a second gate, sitting after "everyone agreed" and before "the money actually moves."

The everyday comparison is a **corporate credit card with built-in policy**. Your company card might be declined at a casino, or above a certain amount, or outside approved vendors — not because someone reviewed the purchase in the moment, but because the rules were set in advance and the card enforces them automatically. You could have every intention of buying something legitimate; if it breaks a rule, it simply doesn't go through. Guardrails bring that same idea to a shared crypto wallet.

## Why they exist: rules in people's heads don't bind

Most teams *think* they have spending controls. In practice, those controls are usually procedures — "we review destinations carefully," "we never approve big transfers on mobile," "anything over $10,000 gets a phone call first." Procedures are rules that live in people's heads. And people approve things between meetings, trust a familiar-looking note, and make mistakes when they're busy or rushed.

A guardrail is different because it isn't advice — it's enforcement. The rule is written into the system itself, so it applies every single time, automatically, whether or not anyone remembers it that day. It doesn't get tired, doesn't trust a convincing story, and can't be talked out of it. That's exactly what you want standing between a phished approval and your treasury.

## How it works: rules checked at the last moment

The key idea is *where* the rule lives. A warning inside an app is only advice — a determined user, or an attacker, can go around it. A rules service running on some company's server is just one more party you have to trust, and one more thing that can be offline or overridden.

Guardrails work because they're checked at the final step, right before execution, by the wallet's own logic. Just before an approved transaction runs, the wallet consults its rules. If the transaction breaks one, it's blocked — no matter how many people approved it. Common rules include:

- **A per-transaction limit** — no single payment may exceed a set amount.
- **A daily limit** — total spending is capped over a rolling window of time.
- **An allowlist** — money may only go to a list of pre-approved destinations.
- **A cooldown** — a required waiting period between transactions, so nothing can be drained in a rapid burst.

Notice how each of these would have stopped the phished payment from earlier — the wrong address isn't on the allowlist, or the amount is over the limit, or the cooldown hasn't elapsed. The scammer collected real approvals and still walked away with nothing.

## How this shows up in FairWins

FairWins lets a group add these guardrails on top of a shared vault. A group can switch on rules like a per-transaction cap, a daily cap, an allowlist of approved recipients, and a cooldown between spends — each one optional and chosen by the group. Once set, they're enforced automatically at the moment of every spend.

Two design choices make this trustworthy. First, the guardrail can only ever *restrict* — it can block a transaction, but it can never start one, approve one, or touch the money itself. It's a brake, never an accelerator. Second, **the group is the only authority over its own rules**: changing a vault's guardrails is itself a transaction that must clear the group's normal approval process. There's no hidden administrator who can quietly loosen the rules, and FairWins built this so no master key exists that could override a group's own enforcement. The rules belong to the group, full stop.

## What to watch out for

- **Guardrails complement approvals; they don't replace them.** Multiple approvals make sure the group agrees. Guardrails make sure even an agreed-upon transaction obeys the rules. You want both layers — neither alone is enough.
- **Set limits you can actually live with.** Too tight, and legitimate spending gets blocked at the worst moment; too loose, and the guardrail isn't really protecting anything. Revisit them as the group's needs change (which, done right, itself requires group approval).
- **They stop rule-breaking, not bad judgment within the rules.** A guardrail can block an unknown address, but it can't tell a good approved vendor from a bad one if both are on your allowlist. Guardrails narrow the blast radius of a mistake; they don't remove the need to think.

Approvals ask *do we agree?* Guardrails ask *and does it follow the rules?* For anyone guarding shared money, having the system enforce that second question — automatically, every time — is what turns good intentions into real protection.

## Related deep-dive

Want the engineering details — how a small, restriction-only guard contract enforces these rules on-chain with no admin key? Read [Enough Signatures Is Not Enough](../../posts/08-multisig-policy-engine/blog.md).

## Learn more

- [Safe — modules and transaction guards](https://safe.global/)
- [Ethereum.org: Smart contract security](https://ethereum.org/en/developers/docs/smart-contracts/security/)
- [Investopedia: Internal Controls](https://www.investopedia.com/terms/i/internalcontrols.asp)
