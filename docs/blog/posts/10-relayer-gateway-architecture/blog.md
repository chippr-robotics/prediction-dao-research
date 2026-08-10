# Censor, Never Steal: Why the Service That Decides Is Never the Service That Signs

*How FairWins runs a funded gas wallet on the open internet by splitting one server into two — a bouncer that decides, and an engine that pays*

| | |
|---|---|
| **Series** | Gasless Rails (part 2 of 2) |
| **Part** | 10 of 34 |
| **Audience** | Product, founders, and the technically curious |
| **Tags** | `gasless`, `infrastructure`, `security`, `design` |
| **Reading time** | ~7 minutes |

---

## The button that spends someone else's money

In [part 1 of this series](../09-intent-based-gasless-payments/blog.md) we covered the friendly half of gasless transactions: on FairWins, a user with no cryptocurrency for network fees can still act. They sign an instruction — "accept this wager," "claim my winnings" — with their wallet, off to the side, for free. Someone else then pays the small network fee to actually submit it. That post ended on an uncomfortable word: *someone*.

Someone has to run a server. That server holds a funded wallet, accepts signed instructions from anyone on the internet, and turns them into paid transactions. Every bad outcome you can picture is on the table: the wallet's key gets stolen; a bot floods the server until the gas budget is gone; a sanctioned wallet slips an action through; one deliberately expensive transaction burns a week's budget in a single shot; or the whole thing falls over at 2 a.m. and people are stuck mid-wager.

FairWins had an extra constraint. The platform's standing rule is *no backend* — just smart contracts, a static web app, and an indexer that reads the blockchain. This gas-paying server is the one deliberate exception, and being the exception raised the bar: if a server has to exist, its potential for damage has to be small enough to describe in a sentence.

The design that shipped does exactly that. One service decides *whether a transaction should exist at all*. A completely different service decides *how it gets paid for and confirmed*. Neither can do the other's job. The goal, in the team's own words: the hosted system can only ever **censor, never steal**.

## The split: a bouncer in front, an engine behind

Picture two machines wired together.

The first is the **bouncer**. It faces the internet, receives each signed instruction, and runs it through a checklist before letting anything through. Is the system paused by its emergency switch? Is this a supported network and action? Who actually signed this — worked out mathematically from the signature itself, never taken on the sender's word? Have we already processed this exact instruction (no double-submitting)? Does the signer pass a sanctions screen and stay under their rate limit? Would this blow the fee budget? Only an instruction that clears every gate gets packaged up and handed onward.

The second is the **engine**. It is a well-known open-source piece of infrastructure, run as-is, that does one unglamorous job well: take a fully-formed transaction, pay for it, and get it confirmed on the blockchain — managing the fiddly mechanics of ordering, pricing, retries, and switching to a backup connection if one fails. Crucially, the engine holds the gas wallet's key. That key lives inside a hardware security module — a tamper-resistant vault that can *use* the key to sign but can never hand the key out.

Between the two machines is a deliberately tiny opening. The engine receives only a finished transaction: where it's going, and how fast to push it. It never sees the original instruction, never learns who signed it, and holds no opinions. All the judgment lives in the bouncer; all the mechanics live in the engine.

That narrow seam buys three things. The engine is **swappable** — it's off-the-shelf, so it could be replaced without touching a line of policy logic. The engine is **auditable by its settings** rather than its code — a plain configuration file pins a spending cap per network and, most importantly, a list of the only addresses it is ever allowed to pay. Even if hijacked, it could only ever pay into FairWins' own contracts. And the policy is **testable without touching a real blockchain**, because it's cleanly separated from the machinery.

Status flows back honestly: the engine tells the bouncer when a transaction is genuinely confirmed on-chain, and only then does the app report it as done. The system never guesses or reports success early.

## Fail closed where money moves

The most telling item on the checklist is the sanctions screen. The smart contracts already screen everyone — so why screen again? Because the gas wallet pays the network fee *before* the contract ever gets a chance to reject the transaction, and "we paid to submit a sanctioned wallet's transaction" is a sentence nobody wants to write. So the bouncer re-checks the true signer against the same on-chain screen.

The rule when that screen can't give a clear answer is strict: if it says no, reject; if it's *unreachable*, also reject — never "assume it's fine and pay anyway." This is the instinct across the whole checklist: when money is about to move, refuse rather than guess.

## What a total compromise actually buys an attacker

Because of the split, the worst case fits in a small table:

| Part | Holds | Can do | Cannot do |
|---|---|---|---|
| Bouncer | two shared passwords | accept or refuse instructions, screen, rate-limit | sign anything, move funds, fake a signer |
| Engine | the *ability to use* the gas key | pay for transactions to approved addresses only | exceed the spending cap, pay anyone else, touch user funds |
| Hardware vault | the actual gas key | produce signatures | ever reveal the key |
| Gas wallet | a small balance for fees | pay network fees | anything else — it has no special authority |

Take over the entire hosted system and here is your whole prize: the small gas balance, plus the power to refuse service for a while. No user funds are reachable — the stakes sit in escrow contracts that independently verify every signature themselves. No administrative power is reachable — the keys that could change the contracts live offline, on physically separate storage, in an entirely different security tier. The blockchain re-checks and re-screens everything regardless of what the server claims. That's what "censor, never steal" means as an engineering property rather than a slogan.

## One checklist, two gasless systems

FairWins actually runs two flavors of gasless transactions, and this is where the split pays off twice.

The first is the one above: signed instructions submitted on a user's behalf. The second serves the platform's passkey wallets — accounts you unlock with Face ID or a fingerprint (the same WebAuthn standard your phone already uses for passwordless sign-in). For these, FairWins can sponsor the network fee directly, so the user pays nothing.

Rather than build a second server, the same bouncer simply grew a second door. Sponsoring a fee reuses the *same* emergency switch, the *same* sanctions screen, and the *same* rate limits — plus two extra ceilings that cap what any single sponsored action can cost, so one deliberately expensive request can't drain the sponsorship fund. One perimeter, one audit trail, one emergency switch, covering two economically different systems. The same checklist has since taken on the platform's other outside connections too — the collectibles marketplace and the prediction-market trading feature. This bouncer turned out to be the platform's one reusable piece of backend.

## Optional by construction: the never-stranded rule

All of this would still be a liability if people *needed* it. They don't. A firm rule holds throughout: every action that can go through the gas-paying server must also complete perfectly well *without* it, landing exactly the same result on the blockchain — the user just pays their own small network fee.

The app enforces this automatically. Before asking you to sign, it quietly checks whether the server is healthy. If that check fails, the emergency switch is on, the network looks down, or anything goes wrong mid-flow, the app silently routes the very same action through your own wallet as an ordinary paid transaction. Same destination, same result; the only difference is who covered the fee. The sponsored-passkey path behaves the same way — any problem, and the confirmation screen honestly says the user is paying.

Because the worst case is merely "users pay their own fee," the emergency switch is cheap to pull — which means operators will actually pull it when they should.

## Design decisions

**Build the judgment, buy the machinery.** Transaction ordering, fee pricing, and connection failover are solved problems with sharp edges; a mature open-source engine handles them well. The judgment layer — which contracts, which actions, whose signatures, what limits — encodes FairWins-specific calls no off-the-shelf tool could know. The split puts custom code exactly where the custom decisions are.

**Fail closed on money, fail soft on availability.** Screening and address-pinning fail closed — the bouncer would rather refuse than guess. Availability fails soft — every refusal degrades to self-pay. The asymmetry is the whole point: the only thing this infrastructure is ever allowed to break is its own usefulness.

## Further reading

- [WebAuthn / passkeys](https://en.wikipedia.org/wiki/WebAuthn) — the passwordless standard behind Face ID and fingerprint sign-in
- [Account abstraction (ERC-4337)](https://eips.ethereum.org/EIPS/eip-4337) — the standard behind smart-account wallets and sponsored fees
- [Hardware security module](https://en.wikipedia.org/wiki/Hardware_security_module) — the tamper-resistant vault that uses a key without revealing it
- [OpenZeppelin Relayer documentation](https://docs.openzeppelin.com/relayer) — public docs for the kind of execution engine described here
