# Atomic Settlement and DvP at T+0

*Settlement finality, the elimination of Herstatt and principal risk, and the real trade-offs against netted T+2 settlement*

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Custody & Settlement |
| **Level** | Advanced |
| **Audience** | Settlement and clearing specialists, risk managers, treasury and collateral leads, market-structure analysts |
| **Tags** | `settlement`, `DvP`, `settlement-finality`, `principal-risk`, `netting`, `market-structure` |
| **Reading time** | ~9 minutes |

## A settlement risk officer reads the timeline

Ask a settlement risk officer what keeps the function honest and you will hear a familiar vocabulary: delivery-versus-payment (DvP), settlement finality, principal risk, Herstatt risk, netting, and the trade date-plus-*n* convention (T+2, now T+1 in several markets) that governs when obligations actually extinguish. Every one of those concepts exists to manage a single uncomfortable fact: in traditional settlement, the two legs of a trade do not complete at the same instant, and the gap between them is where risk lives.

Atomic on-chain settlement collapses that gap to zero. Both legs either complete together or neither does, in a single indivisible step, at T+0. For a professional trained to manage the gap, the natural reaction is a mix of interest and suspicion — because removing the gap removes some risks outright while introducing others, and changes the economics of netting in ways worth thinking through carefully. This briefing works through what genuinely improves, what is merely different, and what a settlement risk team should watch.

## The traditional model: managed gaps and mutualized guarantees

Traditional settlement is a triumph of risk management built around unavoidable delay. Consider its core devices.

**DvP** ensures that delivery of the asset occurs *if and only if* payment occurs, so that neither party delivers without receiving. Central securities depositories and settlement systems implement DvP precisely to remove *principal risk* — the risk of delivering your side and never receiving the other. But DvP as traditionally implemented still runs over a settlement cycle; it guarantees the linkage, not instantaneity.

**Netting** is the reason the cycle exists at all. Rather than settle every trade gross, a clearinghouse nets many offsetting obligations into small end-of-cycle transfers, dramatically reducing the volume and the liquidity that must actually move. Netting is enormously capital-efficient, and the multi-day cycle is partly what makes deep multilateral netting possible.

**Settlement finality** is the legally defined moment an obligation becomes irrevocable — protected in major jurisdictions by settlement-finality law so that a participant's insolvency cannot claw back completed settlements. Until finality, exposure persists.

The most infamous consequence of the gap is **Herstatt risk** — named for the 1974 failure of Bankhaus Herstatt, whose counterparties had paid the Deutsche Mark leg before the bank failed and never received the dollar leg. It is the foreign-exchange face of principal risk: a timing gap across systems or time zones in which one leg settles and the other does not. An entire piece of market infrastructure exists mainly to close that specific gap through payment-versus-payment settlement. That such infrastructure had to be built at all tells you how expensive the gap is.

## What changes on-chain: atomicity as the primitive

On a public blockchain, a transaction is *atomic*: every state change inside it either happens together or the whole transaction reverts and nothing happens. That property, applied to settlement, is what "atomic settlement" means. When a FairWins wager resolves, the winner's claim moves both escrowed stakes in one indivisible action. There is no interval in which one leg has moved and the other has not. Either the payout completes in full or the ledger is unchanged.

Map this onto the traditional devices:

- **DvP becomes structural and instantaneous.** The linkage between legs is not a rule enforced by a settlement system across a cycle; it is a property of the single transaction. The two legs cannot separate because they are not two events — they are one.
- **Settlement occurs at T+0** and, once the transaction is confirmed to finality on the network, the transfer is irrevocable. Because the assets were pre-funded into escrow, there is no post-trade credit exposure waiting to be settled at all — the only thing left to determine is the outcome, not whether the funds exist.
- **Principal risk on the settlement leg is eliminated, not mitigated.** There is no state of the world in which the winner surrenders a claim and fails to receive the stakes, because the claim and the transfer are the same atomic step. The Herstatt-style timing gap has no place to occur.

For settlements denominated in the same on-chain asset — a stablecoin such as USDC on both sides — this is genuinely gap-free. The device built to defeat Herstatt risk is, in this narrow context, made unnecessary by the settlement primitive itself.

## Where it genuinely differs — and the trade-off nobody should skip

Atomic T+0 settlement is not free lunch; it is a different point on the risk-efficiency frontier. Two consequences deserve honest attention.

**The netting trade-off.** Netting's efficiency comes precisely from delay: batching many obligations over a cycle so that only small residual amounts move, minimizing the liquidity that must be on hand. Pure atomic gross settlement gives that up. Every settlement moves the full amount, at the moment it occurs, from pre-funded balances. You buy the elimination of the settlement gap by *pre-funding* — committing the full principal up front rather than economizing on liquidity through multilateral netting. For a bilateral, pre-collateralized wager this is exactly the right trade: there is no portfolio of offsetting exposures to net, and the capital was going to be locked anyway. For a high-volume trading book, the calculus is entirely different, and it would be dishonest to pretend atomic gross settlement dominates netted settlement in every context. It does not. It dominates when the value of eliminating principal and finality risk exceeds the liquidity cost of pre-funding — which is precisely the case for the escrowed, bilateral contests FairWins settles.

**Finality cuts both ways.** Irrevocable T+0 settlement removes reversal games, failed-trade queues, and the credit exposure of the settlement window. It also removes the unwind. There is no fail, no buy-in, no chargeback, no settlement-system judgment call in an edge case. That raises the premium on correct pre-trade controls and on the integrity of the process that determines the outcome, because once the atomic step fires there is nothing to reverse.

## Risk and controls: the advanced read

- **Settlement finality risk (probabilistic vs. legal).** On-chain finality is achieved when a transaction is confirmed deeply enough that reversal is economically implausible — a probabilistic finality that hardens quickly on modern networks, as opposed to the statutory finality of traditional systems. A settlement team should understand its chosen network's finality characteristics and confirmation policy, and treat "confirmed to finality" as the moment exposure ends.
- **Resolution / oracle risk.** Atomicity guarantees the *transfer* is clean; it does not guarantee the *outcome* fed into it is correct. Where an external source of truth resolves the contest, that source is the load-bearing dependency. FairWins fixes the deciding authority at creation so it cannot be quietly swapped, and refuses to open a contest on an already-decided question.
- **Liquidity and pre-funding cost.** The counterpart to zero settlement gap is full up-front commitment. That is capital locked for the contest's life — a familiar cost to anyone who posts margin, and the explicit price of removing principal risk.
- **Smart-contract and operational risk.** The atomic step is only as sound as the code executing it and the instruction that triggers it. State is recorded before value moves (the standard re-entrancy defense), only approved settlement assets are used, and — because there is no unwind — pre-trade correctness matters more, not less.
- **Compliance.** Faster, final settlement does not shorten your obligations. Sanctions and eligibility checks run before value moves; classification and treatment of these arrangements vary by jurisdiction and are evolving.

## How FairWins approaches this

FairWins settles bilateral, pre-funded contests atomically at T+0: both escrowed stakes move to the winner in one indivisible, irrevocable step, so DvP is structural rather than procedural and the Herstatt-style gap has nowhere to open. It deliberately trades the liquidity efficiency of netting — which offers little to a pair of fully collateralized principals — for the elimination of principal and settlement-window risk, while being explicit that finality means no unwind and that the outcome source, not the transfer, is the assumption to guard.

*This briefing is educational and informational only. It is not investment, legal, tax, or regulatory advice. Settlement mechanisms and their regulatory treatment vary by jurisdiction and are evolving; assess your own obligations with qualified advisors.*

## Related deep-dive

For the engineering details, see [The Wager Lifecycle](../../posts/14-wager-lifecycle-contract/blog.md).

## Further reading

- CPMI–IOSCO Principles for Financial Market Infrastructures (DvP and settlement finality): <https://www.bis.org/cpmi/publ/d101a.pdf>
- BIS on the Herstatt case and settlement risk in FX: <https://www.bis.org/publ/cpss17.htm>
- Delivery versus payment (DvP) — Investopedia: <https://www.investopedia.com/terms/d/deliveryversuspayment.asp>
- Settlement finality and the move to shorter cycles (T+1) — DTCC: <https://www.dtcc.com/ust>
- Atomic settlement and tokenization — BIS working material: <https://www.bis.org/publ/work1178.htm>
