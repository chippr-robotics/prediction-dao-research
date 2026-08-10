# Ex-Ante Cost Disclosure, Made Mechanical: A MiFID-II Lens on On-Chain Fees

*One auditable rate source, hard caps, and the exact cost shown before you approve — cost transparency as an enforced property rather than a policy*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Compliance, Disclosure & Governance |
| **Level** | Intermediate |
| **Audience** | Compliance officers, product managers, cost-transparency and best-execution leads, fintech operators |
| **Tags** | `fees`, `cost-disclosure`, `MiFID-II`, `transparency`, `governance` |
| **Reading time** | ~7 minutes |

> **Informational, not advice.** This briefing is educational, not legal, regulatory, or investment advice, and it does not assert that any FairWins mechanism is a MiFID-regulated service. Fees are real costs; regulatory treatment varies by jurisdiction.

## The review that fees usually fail

Picture a product or compliance review of a fee schedule. You ask three questions that any cost-disclosure regime — and any honest one — should be able to answer. First: *where does the number the customer sees actually come from, and is it the same number the system charges?* Second: *can the fee change between the moment we quote it and the moment we execute?* Third: *what stops the rate from being raised without limit or without a record?*

In a lot of systems, the honest answers are uncomfortable. The quoted rate is a constant hardcoded in the app; the charged rate lives in a server config; and a third copy sits in the billing code. Three copies of one number, three owners, three release cadences. Someone updates one and forgets the others, and a customer approves a screen reading 0.50% while the system bills 0.60%. That isn't a cosmetic bug — it is the exact failure mode cost-transparency rules were written to prevent.

## The traditional model: MiFID-II ex-ante disclosure

European investment-services regulation — the second Markets in Financial Instruments Directive, **MiFID II** — codified a principle worth borrowing regardless of where you operate: **ex-ante cost disclosure**. Before a client is bound, the firm must disclose the *aggregated* costs and charges of the service and the product, in cash and percentage terms, so the client sees the full cost of the transaction *before* deciding — not reconstructed from a statement weeks later. The regime also pushes against **hidden costs**: charges buried in a spread, embedded in a "free" product, or disclosed only in aggregate where a line item was warranted. The spirit is simple and demanding: the customer should see the real, all-in cost, itemized, up front.

Most fee disclosure is a *policy* — a commitment, honored by process and goodwill, that the number shown matches the number charged. The interesting question for an on-chain system is whether that policy can be made a *property*: something the mechanism itself enforces, so the shown number and the charged number cannot drift apart even if someone wanted them to.

## What changes on-chain

Three moves turn the disclosure policy into an enforced property.

**One auditable rate source.** Every fee the platform can charge lives as a single entry on one on-chain price list, labeled by what it is for. That list is the *only* place any rate lives. The application reads the live rate directly from it to render the disclosure; the charging step reads the same entry to bill. There is no second copy in a server config or a client constant to fall out of sync. When the single source of truth is also the source the interface quotes and the source the charge honors, the "three copies" failure mode simply cannot occur.

**Hard caps, fixed at creation.** Each entry carries not just a current rate but a permanent ceiling set when the entry is created — a maximum no one, including an administrator, can raise. An admin can move the current rate up and down beneath the ceiling; the ceiling itself is immutable. For fees the platform charges directly there is also an absolute company-wide limit (a low single-digit percentage) that no entry can exceed. A cap that can't be lifted is a very different promise from a cap written in a policy document.

**A consent ceiling that closes the timing gap.** This is the elegant part, and it maps directly onto a best-execution instinct. Before a customer signs, the app reads the live rate and shows it. When the customer approves, *that exact rate they saw* travels with the transaction as a ceiling. If an administrator raises the rate while the transaction is in flight, the customer either pays no more than what the screen showed, or the transaction stops and they review again. The confirmation screen stops being a courtesy or a best guess and becomes a limit the system enforces. The disclosure is no longer a statement about the price — it *is* the price ceiling.

## Where it genuinely differs

**Better:** the number-you-see-equals-the-number-you-pay guarantee is mechanical, not procedural. In a conventional stack, "we always show the real cost" depends on three teams keeping three numbers aligned; here, there is one number, and the act of charging re-reads and re-checks it. The rate-change history is a permanent, public event log — who changed what, when — so the audit trail is a byproduct of the system rather than a separate report that can be edited or lost. And a rate that rounds down to nothing on a small amount is charged as zero: rounding is biased, deliberately, toward the customer.

**Different, and worth stating plainly:** the immutable cap cuts both ways. Because a ceiling can never be raised, a ceiling set wrong can't be edited — only abandoned in favor of a fresh entry. That rigidity is precisely the price of a ceiling a customer can rely on. And an on-chain price list governs *the platform's own* fee. It does not, and cannot, absorb every cost a transaction bears — network gas, or a third-party venue's own fee, are separate costs that must be disclosed on their own terms rather than folded silently into one figure. Honest aggregation means showing each real cost as its own line, not collapsing distinct costs into a single friendly percentage.

## Risk & controls

- **Governance risk (rate changes).** The power to move rates beneath the cap is an administrative privilege. The controls that fence it: a permanent per-entry ceiling, an absolute company-wide cap, role separation between who can change a rate and who can register a new entry, and a public change log. The admin gets one convenient screen; the customer gets guarantees anyone can verify.
- **Configuration / availability risk.** Two safe-by-default behaviors matter. If a network was never set up with a treasury to receive fees, the system skips the fee and completes the transaction — a setup mistake costs the platform revenue, never the customer their funds. And if the live rate can't be read on a network that *should* have one, the fee-bearing action stops rather than proceeding on a possibly understated rate. Fail safe, not fail open. Exit paths (withdrawals) are never gated by a fee lookup.
- **Atomicity risk.** For fees charged directly, the fee and the delivery of value happen in one all-or-nothing transaction: if any leg fails, the whole thing reverts, so the treasury can never keep a fee for a transaction that didn't complete.
- **Disclosure-completeness risk.** The residual risk is treating the platform-fee line as the *whole* cost. Where other real costs exist, honest ex-ante disclosure requires each to appear as its own line — never one figure standing in for several.

## How FairWins approaches this

FairWins routes every configurable platform fee through a single on-chain price list — one source of truth, each entry carrying a permanent cap and a low absolute company-wide ceiling for fees it charges directly. Every fee-bearing confirmation shows a clearly named platform-fee line with the live percentage, the absolute amount, and the net amount reaching the service, before any signature; a zero rate shows no fee line and behaves exactly as the pre-fee flow did. The quoted rate travels with the transaction as an enforced ceiling, so a customer can never be charged above what they saw. Where a cost is genuinely additive and separate — a third-party trading venue's own fee, for instance — FairWins discloses it as its own line rather than hiding it or calling it "free." One important, honest note: the platform's yield-earning feature currently charges no FairWins platform fee at all — so it shows no fee line, and no fee is taken.

> **Informational, not advice.** Cost disclosure here is a design property, not a representation of regulatory compliance with MiFID II or any other regime; those obligations depend on your jurisdiction and activity.

## Related deep-dive

For the engineering details, see [One Place for Every Fee](../../posts/22-fee-router/blog.md).

## Further reading

- ESMA on MiFID II costs and charges disclosure: https://www.esma.europa.eu/policy-rules/mifid-ii-and-investor-protection
- Investopedia, "MiFID II": https://www.investopedia.com/terms/m/mifid-ii.asp
- Investopedia, "Total Expense Ratio (TER)" — an example of aggregated cost disclosure: https://www.investopedia.com/terms/t/ter.asp
- ERC-4626: Tokenized Vaults — the shared standard behind the yield feature referenced above: https://eips.ethereum.org/EIPS/eip-4626
