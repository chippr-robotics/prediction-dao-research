# Tokenized Cash as the Unit of Settlement: What a Stablecoin Actually Is on the Books

*Stablecoins versus e-money and bank deposits, peg mechanics and reserve attestation, and why an app settles in them — with an honest read on de-peg and issuer risk*

---

| | |
|---|---|
| **Series** | Finance Professional Series |
| **Track** | Money, Yield & Markets |
| **Level** | Intermediate |
| **Audience** | Treasury and payments leads, product managers, risk and compliance officers, allocators |
| **Tags** | `stablecoins`, `settlement-asset`, `tokenized-cash`, `e-money`, `payments` |
| **Reading time** | ~8 minutes |

---

## Which dollar is it, exactly?

When an app tells you a balance is "200 dollars," a finance professional's next question is the right one: *a claim on what, held by whom, redeemable how?* A bank deposit is an unsecured claim on a commercial bank, insured to a limit, settling through the banking system. E-money is a claim on a licensed issuer that must hold safeguarded funds against it. A money-market fund share is a claim on a pool of short-dated instruments, redeemable at (or very near) par. These are different instruments with different risk, different settlement, and different legal treatment — even though each *reads* as a dollar on a screen.

A dollar-pegged stablecoin is another such instrument, and the point of this briefing is to place it precisely among the ones you already know: what it structurally resembles, where the analogy breaks, and why an application would choose it as its unit of settlement despite carrying risks a bank deposit does not.

## The traditional model: how "cash" settles today

In conventional finance, the settlement asset varies by rail. Retail payments settle across bank deposits and card networks; wholesale settles in central-bank reserves; securities settle delivery-versus-payment through infrastructures that exchange the asset and the cash simultaneously to eliminate principal risk. Each rail has an operator, a settlement window (often T+1 or T+2), business hours, and a legal framework governing finality and reversal.

E-money regimes and money-market funds are the closest reference points for what a stablecoin is trying to be. E-money is prepaid value: you hand a licensed issuer fiat, they issue redeemable digital value one-for-one, and regulation requires the fiat be safeguarded — segregated, held in secure assets — so it is there when you redeem. A money-market fund takes cash, holds short-term government and high-quality paper, and lets you redeem shares at approximately par on demand. Both are "dollar-shaped claims backed by conservative assets, redeemable near par." Hold that thought.

## What changes with a stablecoin

A reserve-backed stablecoin — USDC, issued by the regulated firm Circle, is the most common reference — is tokenized cash: a digital bearer-style instrument on a public blockchain, intended to always be redeemable for one dollar. Structurally it is *analogous* to e-money backed by a conservative reserve: the issuer creates a coin when a real dollar arrives, holds reserves against outstanding coins (typically cash and short-dated US government debt), and burns the coin on redemption. Reputable issuers publish regular third-party attestations confirming the reserves exist and match supply.

Note the careful word: *analogous*. A stablecoin is not, by that fact, a regulated e-money instrument or a fund — its legal classification is unsettled and varies by jurisdiction, and this briefing makes no claim of regulatory equivalence. What it shares with those instruments is the *structure*: a redeemable claim backed by a reserve, whose price is pinned by that redeemability.

The peg mechanics are worth stating plainly, because they are what a risk officer actually underwrites. The anchor is arbitrage against redemption. If the token trades at 99 cents on an exchange while remaining redeemable for a full dollar, arbitrageurs buy the cheap token and redeem it for par, and that buying pressure pushes the market price back toward a dollar. The peg holds *because* redemption is credible. Which means the peg is exactly as strong as the reserve behind it and the redemption channel in front of it — and no stronger.

Two properties change everything else. First, settlement is **near-instant, final, and continuous** — no T+2, no business hours, no operator queue. That is a genuine operational upgrade for a payments or escrow application: the moment the transfer confirms, value has moved and cannot be clawed back. Second, it is **programmable** — it can be escrowed by code, released against conditions, and settled inside an application without a bank in the loop. For a real-money app, those two properties are the entire reason to settle in a stablecoin rather than in a volatile crypto asset (whose price won't sit still) or in bank rails (which can't ride the same programmable settlement layer).

## Where it genuinely differs

**Better.** Continuous, near-instant, final settlement; native programmability; global reach without correspondent-banking friction; a transparent, publicly auditable supply. For escrow and cross-border use, these are real advantages over multi-day, business-hours rails.

**Worse or different.** No deposit insurance and no chargeback: settlement is final the way cash is final, so an error or a payment to the wrong address has no reversal mechanism. You take **issuer credit and reserve risk** directly — the token is a claim on the issuer's reserve management, not on an insured bank. And you inherit the peg's failure mode: it is maintained, not guaranteed.

## Risk and controls

- **Issuer and reserve risk.** The token is only as good as the reserve behind it and the issuer running it. Favor issuers with conservative, transparent reserves (cash and short-dated government paper), regular attestations from credible auditors, and clear redemption rights. Treat the attestation cadence and reserve composition as ongoing diligence, not a one-time check. Avoid algorithmic designs that attempt to hold a peg through trading mechanics rather than real reserves — several have collapsed, and the label "stablecoin" alone guarantees nothing.
- **De-peg risk.** In stressed markets a fully-reserved stablecoin can briefly trade below a dollar; the notable historical episodes tied to reserve concentration have generally recovered, but "generally recovered" is not "cannot fail." Size exposure and concentration accordingly, and monitor the peg the way you would monitor a money-market fund's shadow price.
- **Settlement-finality and operational risk.** Irreversibility raises the stakes on payment operations: address verification, transaction review, and the custody controls covered elsewhere in this series matter more, not less, than on a reversible rail. There is no back office to unwind a mistake.
- **Custody and counterparty risk.** How the token is held (self-custody versus a third party) reintroduces custody risk on top of issuer risk — two distinct layers to assess separately.
- **Compliance risk.** Transfers are pseudonymous but permanently public. Sanctions screening and applicable AML obligations — including travel-rule considerations where they apply — remain fully in force; the rail's transparency is a tool here, not an exemption. Regulatory classification of stablecoins is evolving and jurisdiction-specific.

## How FairWins approaches this

FairWins uses stablecoins as its unit of settlement precisely for the reasons above: a stake, a group pot, or a payment is denominated and settled in a dollar-pegged token, so every figure a member sees is a plain dollar amount rather than "whatever this coin is worth on payout day." The platform deliberately handles only a short, vetted list of reserve-backed, dollar-pegged tokens — not volatile assets — so the amount agreed is the amount that changes hands. Escrowed stakes are held in stablecoins and payouts arrive in stablecoins, with the finality that makes a code-held escrow trustworthy: once resolved, the winner can claim and no one can strand the funds. Movements pass the same sanctions and membership checks as any other action, on-chain transparency notwithstanding. And where any fee applies, FairWins discloses the exact cost, in dollars, before a member approves — the settlement asset's transparency extended to the platform's own economics. (The core wager escrow itself is denominated and settled in these tokens; it is not a yield product, and no return is implied by holding a stake.)

The honest summary for this reader: a reserve-backed stablecoin is structurally analogous to conservatively-backed tokenized cash, with settlement properties that genuinely beat traditional rails, in exchange for taking issuer, reserve, and finality risk directly and giving up insurance and reversibility. It is the right unit of settlement for a real-money application *because* of those trade-offs, not in spite of your needing to understand them.

*This is educational information for finance professionals, not investment, legal, tax, or regulatory advice. Stablecoins carry issuer, reserve, de-peg, and operational risk; a peg is maintained, not guaranteed, and regulatory treatment varies by jurisdiction and is evolving. Assess any settlement asset against your own risk framework.*

## Related deep-dive

For the engineering details, see [The Wager Lifecycle: How a Handshake Bet Becomes a Payout Nobody Can Strand](../../posts/14-wager-lifecycle-contract/blog.md).

## Further reading

- [Circle — USDC transparency and reserve reporting](https://www.circle.com/usdc) — issuer attestations and reserve composition
- [BIS — Stablecoins and the future of money / cross-border payments](https://www.bis.org/) — central-bank perspective on tokenized settlement
- [IOSCO / FSB recommendations on global stablecoin arrangements](https://www.fsb.org/) — international regulatory framing
- [FATF guidance on virtual assets and the travel rule](https://www.fatf-gafi.org/) — AML/CFT obligations for token transfers
- [Investopedia — Stablecoin](https://www.investopedia.com/terms/s/stablecoin.asp) — plain-English overview of designs and risks
