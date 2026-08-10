# The Wager Lifecycle: How a Handshake Bet Becomes a Payout Nobody Can Strand

*How FairWins turns an informal bet into a small set of clear states, two hard deadlines, and a payout that always has a way out*

---

| | |
|---|---|
| **Series** | Prediction Markets — Part 1 |
| **Audience** | Product managers, founders, and the crypto-curious |
| **Tags** | `escrow`, `prediction-markets`, `how-it-works`, `p2p` |
| **Reading time** | ~7 minutes |

> **Responsible-use note.** FairWins wagers are peer-to-peer forecasts on publicly available information. This is skill-based forecasting, not a mechanism for trading on material non-public information or circumventing regulation. All participants remain fully subject to applicable law and compliance obligations in their jurisdiction.

---

## The bet that never pays out

Two colleagues bet 200 USDC on whether a software project ships before the end of the quarter. Both are good for it. Neither wants to hand the money over in advance, and neither wants a third party sitting on it. Both have seen how this ends without structure: the outcome lands, the loser goes quiet, and the "bet" becomes an awkward memory.

The ways an informal wager falls apart are surprisingly countable. The other person never actually puts their money in. The event happens but nobody has the authority to say who won. The event doesn't happen at all — the project is cancelled — and there's no agreed way to unwind. Or the money is locked up and a bug, a dispute, or a person who vanishes leaves it stuck forever.

An escrow system worth building closes every one of those holes on purpose. That is what the FairWins wager engine does. It's less a "betting contract" than a careful set of rules over other people's money, where every situation has a defined set of exits and no situation is a dead end. This post walks through that anatomy: the states a bet can be in, the deadlines that keep it honest, the ways a winner gets decided, and the discipline that makes it safe.

## A handful of states, no dead ends

Think of every wager as moving through a small number of clearly defined states, like stops on a track.

The happy path is short. Someone creates a wager, and their stake is escrowed — locked in the contract, held by code rather than by either person. The wager is now open. The named opponent accepts, their stake is pulled in too, and the wager becomes active. Once the outcome is known, it's marked resolved with a recorded winner, and the winner claims both stakes in a single payout.

The interesting design is in the unhappy paths, because every state that holds money has an exit that needs no cooperation from the other side:

- **The opponent never shows up.** While the wager is still open, the creator can cancel and get their stake back, the opponent can formally decline, or — once the deadline to accept has passed — anyone at all can trigger a refund to the creator.
- **The outcome never lands.** If a wager is active but the deadline to resolve passes with no result, either side can trigger a refund that returns each person's own stake.
- **The event genuinely ties.** Both participants can agree to a draw (or an appointed arbitrator can declare one), and each stake goes home.

One subtlety: cancelling an offer that was never accepted erases the wager entirely and returns the creator's money, because no counterparty history exists yet. Once two people are in, refunds and draws keep the record and simply mark it settled. Either way, the money finds its way back.

## Two hard deadlines

Every wager carries two fixed calendar deadlines set the moment it's created: a deadline to accept and a deadline to resolve. They are specific dates, not vague durations. The accept deadline must be in the future, the resolve deadline must come after it, and both are capped — an offer goes stale within a month, and even a fully active wager has a guaranteed exit within roughly half a year.

That ordering rule means a wager can never become active with its resolution window already closed. The caps mean no wager can hold money hostage forever. Deadlines are the "something always eventually happens" half of the design: the states guarantee which moves are legal, and the deadlines guarantee some move is always eventually available to a single person acting alone.

Notice also who's allowed to trigger the deadline paths. The refund path deliberately pays the original participants no matter who sets it in motion — so a neutral bystander, or an automated helper sweeping up expired wagers, can clean things up without being able to redirect a single cent.

## Deciding a winner

How a wager gets settled is chosen when it's created and locked in for its whole life. There are two broad families.

The human paths put the decision in named hands:

- **Either side may declare.** Mutual-trust settlement, only allowed when both people staked the same amount. On a lopsided bet, the side risking less could simply declare itself the winner and grab the bigger pot — so uneven bets must name a single settler, an arbitrator, or an outside referee instead.
- **One named party declares** — either the creator or the opponent, agreed up front.
- **A neutral arbitrator declares.** Named at creation, required to be neither participant, and the sole decider.

The other family hands the decision to an oracle — the trusted referee that tells the contract who won, an outside source of truth like a market or a data feed that the contract can read. For these wagers, no human declares the result by hand; instead, anyone can trigger an automatic settlement that reads the outcome from the linked source and pays the right side. The system refuses to even create an oracle-settled wager if the referee isn't wired up, or if the question has already been decided — because a bet on a known answer isn't a bet.

Draws follow the same split. For human-settled wagers, a draw needs consent: the first person proposes it, the second confirms, and either can back out before the other agrees, so a one-sided proposal never freezes anything. An arbitrator can call a draw alone. Oracle-settled wagers can't be drawn by hand — a tie there only arises when the referee itself reports a tie.

## Safe by construction: checks before money moves

The system only ever escrows a short, admin-approved list of stablecoins and similar tokens. Every action that moves money follows the same disciplined order, and the payout is the clearest example.

First it checks: is the wager actually resolved, is the caller actually the winner, and has it not already been paid? Only then does it mark the wager as paid — before sending anything — and only then does it transfer the money. Marking "paid" before the transfer is the whole trick: it closes a classic attack where a malicious token tries to re-enter mid-transfer and claim twice. By the time any outside code runs, the wager is already stamped paid. The same "check, record, then move money" order repeats everywhere funds change hands.

The checks stage is also where the compliance layer lives. Before a single token moves, both the sanctions screen and the membership check run against the people involved.

## Why we built it this way

**Exits stay open even when the system is paused.** An emergency pause can stop new wagers from being created or accepted — but it deliberately does not block declaring a winner, settling a draw, or claiming a payout or refund. An emergency brake must never become a way to trap people's escrowed money. Only a targeted, explicitly moderated freeze on a specific account can block that account's exits.

**Fixed dates over countdowns.** Storing real calendar deadlines makes every timeout a simple "are we past this date?" check and lets the app and automated helpers agree on when a wager expires without reconstructing anything.

**One decider per wager, chosen up front.** There's no fallback chain from oracle to arbitrator to participant. Who settles is a commitment both sides accepted at creation. Ambiguity about who gets to call it is exactly the failure mode of the handshake bet, so the system refuses to reintroduce it.

**A stable home that can still improve.** The wager engine lives at a permanent address while its logic can be upgraded in place, with an automated safety check ensuring an upgrade can add to the machine but never scramble the wagers already inside it.

The result is an escrow system you can reason about like a map: a handful of states, a hard clock on every step that holds money, and no place to get stuck. That shape — not any single clever line of code — is what makes it safe to lock 400 USDC between two people who trust the outcome more than they trust each other.

## Further reading

- [ERC-20](https://eips.ethereum.org/EIPS/eip-20) — the token standard behind the stablecoins used as stakes
- [Reentrancy and the "checks-effects-interactions" pattern](https://en.wikipedia.org/wiki/Reentrancy_(computing)) — the class of attack the payout ordering defends against
- [EIP-712 typed-data signing](https://eips.ethereum.org/EIPS/eip-712) — the standard behind accepting an open challenge with a signature
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts) — the audited building blocks used for access control and safe token transfers
