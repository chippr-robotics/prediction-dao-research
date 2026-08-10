# How to Read APY (and Spot Yields That Are Too Good to Be True)

*What that yearly percentage really means, why it moves, and the risks nobody should hide from you*

| | |
|---|---|
| **Series** | Knowledge Base |
| **Track** | Earning & Yield |
| **Level** | Beginner–Intermediate |
| **Audience** | Curious beginners comparing yields before depositing |
| **Tags** | `apy`, `yield`, `risk`, `defi`, `safety` |
| **Reading time** | ~6 minutes |

---

## The number everyone stares at

You open a lending app and every option shows a single, tempting number: **4.1% APY**. **7.8% APY**. **142% APY**. Your eye goes straight to the biggest one — that's human. But that number is the *most* misunderstood thing on the whole screen, and learning to read it properly is the difference between earning steadily and getting burned.

This primer does three things: explains what APY actually means, explains why it's a moving estimate rather than a fixed promise, and gives you an honest tour of the risks — including how to smell a yield that's too good to be true.

## What APY means

**APY stands for Annual Percentage Yield** — roughly, "if conditions stayed exactly as they are right now for a full year, this is about how much your deposit would grow, including earnings on your earnings."

That last part is the "yield" bit: as you earn interest, that interest starts earning interest too (compounding). So APY is a slightly fuller measure than a plain interest rate. If you deposit $1,000 at a steady 5% APY and leave it untouched, you'd have roughly $1,050 after a year.

But read that definition again and notice the load-bearing phrase: *"if conditions stayed exactly as they are right now."* They won't.

## Why APY is variable, not fixed

Here's the single most important thing to internalize: **in DeFi lending, APY is a live estimate, not a fixed rate.** It is a snapshot of this instant's conditions, and it changes constantly — sometimes by the hour.

Why does it move? Because the yield comes from borrowers paying interest, and borrowing demand is always shifting. When lots of people want to borrow, rates rise and your APY goes up. When borrowing dries up, rates fall and your APY drops. Nobody is guaranteeing you the number on the screen — it's simply "the rate right now, projected forward as if nothing changed."

This is very different from, say, a bank CD that locks a fixed rate for a fixed term. A DeFi APY is more like a weather forecast: useful, honestly presented, and definitely subject to change. Treat a displayed APY as "about what I'd earn if today's weather held," never as a contract.

## The risks, stated plainly

Anywhere that grows your money carries risk, and anyone who tells you otherwise is selling something. Here are the real ones, in plain terms:

**Smart-contract risk.** The lending pool is a piece of software. Good software is audited by independent security experts, but no code is provably perfect. A flaw — or a clever attacker — could, in a bad case, cause losses. This risk never fully goes to zero.

**Market and liquidity risk.** These pools lend your money out, so at any given moment much of it is working, not sitting idle. Usually you can withdraw instantly, but in turbulent times the immediately available amount can be temporarily less than your full balance — you may need to withdraw what's free now and come back shortly for the rest. In extreme market events, collateral can also fall in value faster than the system can react.

**Rate risk.** The APY that lured you in can simply drop. You're not locked into today's number, for better or worse.

**No safety net.** This bears repeating because it surprises people coming from banking: DeFi deposits are **not** government-insured. There is no FDIC, no agency that reimburses you if something breaks. The upside of self-custody — nobody can freeze or take your funds — comes with the flip side that nobody backstops your losses either.

## The "too good to be true" test

Now the practical skill. When you see an eye-popping yield, run it through one question: **who is paying this, and why?**

Legitimate yield has a boring, traceable source — real borrowers paying real interest, backed by collateral worth more than they borrowed. If a yield is modestly higher than the pack, it usually just reflects slightly more risk or higher borrowing demand. Fine.

But when a yield is *dramatically* higher than everything around it — 3x, 10x, "guaranteed 40%" — the honest question rarely has a good answer. Often the extra return is really an extra risk in disguise, a temporary bonus that will vanish, or, at the worst end, a scheme paying early depositors with later depositors' money. A useful rule of thumb: **the higher the promised yield, the harder you should look for who's funding it — and the more suspicious you should be if nobody can tell you.** "Guaranteed" and "yield" almost never belong in the same sentence.

## How it shows up in FairWins

FairWins' Earn section shows an estimated APY on each lending vault, and it's honest about what that number is. The rate comes live from Morpho's data, is clearly labeled an **estimate** rather than a promise, and is described as something that changes constantly. FairWins doesn't invent or inflate these figures, charges **no fee** on Earn, and — as everywhere on the platform — shows you the exact cost of any action before you approve it. The app also tells you plainly that returns are variable and not guaranteed, and that you should only deposit what you can afford to have at risk. When a withdrawal is temporarily limited by how much is lent out, the app shows you exactly how much is available right now rather than pretending.

## What to watch out for

- **Treat APY as a forecast, not a promise.** It moves; plan for it to move.
- **Match the deposit to your risk tolerance.** Only lend what you could afford to have at risk — genuinely.
- **Interrogate outsized yields.** If the return is spectacular and the source is fuzzy, walk away. Boring and traceable beats dazzling and unexplained.

Reading APY well isn't about a formula. It's a mindset: the number is real, honestly presented — and it's an estimate about the future, which nobody can guarantee.

## Related deep-dive

Want the engineering details? Read [Earn Without Surprises: Putting Idle Funds to Work, With a Fee You Can See](../../posts/23-earn-erc4626-vaults/blog.md).

## Learn more

- [Investopedia — Annual Percentage Yield (APY)](https://www.investopedia.com/terms/a/apy.asp)
- [Ethereum.org — Decentralized finance (DeFi)](https://ethereum.org/en/defi/)
- [Morpho — Documentation](https://docs.morpho.org/)
