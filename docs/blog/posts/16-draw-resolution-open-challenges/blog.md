# When Nobody Wins and Anyone Can Play: Draws and Open Challenges

*The two edge cases that make a peer-to-peer betting app feel finished: settling a wager that has no fair winner, and posting a wager that has no opponent yet*

| | |
|---|---|
| **Series** | Prediction Markets, part 3 |
| **Part** | 16 of 34 |
| **Audience** | Product-minded builders, founders, and the crypto-curious |
| **Tags** | `prediction-markets`, `escrow`, `edge-cases`, `product-design` |
| **Reading time** | ~7 minutes |

---

> **Responsible-use note**: FairWins wagers concern publicly available information and legitimate forecasting between consenting parties. Nothing here is a mechanism for trading on material non-public information or evading applicable law. All participants remain fully subject to the laws, compliance requirements, and professional obligations that apply to them.

---

## Two wagers the happy path can't handle

Dana and Priya each put 200 USDC into escrow on whether a cup final ends in a home win. Mid-week the match is abandoned and rescheduled outside the window their wager described. Neither of them should win.

In the earliest version of FairWins, their only exit was to do nothing: wait for the resolution deadline to pass, then claim a refund, which returns both stakes on a timed-out wager. That works, but it is slow — and on the public ledger it looks identical to two people who simply forgot about their bet. Anyone reading the history later, including a dispute reviewer, could not tell a deliberate "we agree this is void" from plain abandonment.

The second gap sits at the other end of the story. Marcus wants to drop a wager into his group chat: 50 USDC on a public prediction market, first taker gets the other side. But a normal wager names one specific opponent at creation, and only that exact wallet can accept. There was no way to say "whoever wants this, take it" — let alone to do it without broadcasting the private terms to every automated bot watching for fresh escrow.

These are the edge cases that separate a demo from a product. FairWins closed them with two features: **draw resolution** — a deliberate, distinctly recorded "both stakes back" outcome — and **open-challenge wagers** — counterparty-less wagers protected by a four-word claim code.

## A distinct "draw" outcome

The first fix was to give the system a real, named outcome for a draw, separate from a refund. That distinction is the whole point. A timed-out refund and a mutually agreed draw return the same money, but they mean different things, and now the app and its public history can show "settled as a draw" differently from "timed out."

Settlement itself is deliberately boring: each party gets back exactly their own stake. Stakes need not be equal, and no value moves between participants — it is a clean unwind, not a payout. Under the hood it reuses the same safe transfer pattern the refund path already relied on, updating the wager's status before any money moves.

The interesting design question was authority: who is allowed to say "draw"? A unilateral draw would be an attack. The losing side of a live wager would declare a draw the instant the outcome turned against them. So the right to call a draw depends on how the wager resolves in the first place:

- **Wagers the two parties settle between themselves** require *both* of them to agree. The first person to declare a draw simply records a proposal; the second person's confirmation completes it. A pending proposal never freezes the wager — either side can still declare a winner or fall back to the timeout refund, and the proposer can withdraw the offer. "Declining" a draw takes no action at all: just don't confirm.
- **Wagers settled by a named arbitrator** let that arbitrator call a draw alone, consistent with their existing power to name a winner.
- **Wagers settled by an outside data source** (a public prediction market, a price feed) allow *no* human to force a draw — not a participant, not an arbitrator, not an admin. On these, a draw can only come from the data source itself.

Manual draws are also blocked once the resolution deadline passes, because past that point the timeout refund already returns both stakes; a late manual draw would only muddy the record.

## When the market itself ties

Public prediction markets can resolve indecisively — a 50/50 split, or an "invalid" ruling after a dispute. FairWins reads that tie directly from the market and settles the wager as a draw the moment anyone triggers resolution, refunding both sides rather than inventing a winner. A market that resolves cleanly still produces a winner; one that hasn't resolved yet still waits. The system is careful to tell "resolved as a tie" apart from "not resolved yet."

## A wager with no opponent

Open challenges attack the second gap. The creator posts a wager with no named opponent, escrows their own stake as usual, and ties the wager to one clever thing: a **four-word claim code**, drawn from the standard BIP-39 word list that crypto wallets use for recovery phrases. Four words out of 2,048 gives roughly seventeen trillion combinations. The code is generated on the creator's own device and never sent to any server.

The trick is that the code *is* a key. Run the four words through a fixed recipe and you get a cryptographic keypair, plus a separate key that unlocks the wager's encrypted terms. That one shareable secret does three jobs at once:

1. **Discovery.** The code points to the single live wager it belongs to. Without it, an open challenge is one anonymous entry among many.
2. **Authorization to accept.** To take the wager, you prove you hold the code by signing a short, structured message with the code's key. Crucially, that signature is bound to the taker's own wallet address — so a bot that copies a pending "accept" transaction out of the network's waiting area cannot reuse the signature for itself. Re-signing requires the code.
3. **Readability.** The same secret decrypts the private terms — which is what makes an open challenge possible at all, since you cannot encrypt terms to a specific recipient when you don't yet know who the recipient is.

The first valid acceptance locks in the taker as the opponent, flips the wager to active, and frees the code's fingerprint for reuse. Uniqueness only has to hold among challenges that are open right now, so nothing piles up in storage forever.

## Guardrails for an unknown counterparty

An unknown taker changes the threat model, so open challenges carry extra rules:

- **No self-resolution.** A lone unknown party can never be the sole judge of the outcome. Open challenges must resolve by an outside data source, by mutual agreement, or by a named arbitrator.
- **Equal stakes only.** Both sides post the same amount. A publicly shared code with lopsided odds would invite people to snipe only the favorable side; equal stakes make it a race about *who* takes the bet, not an economic edge.
- **Higher tier to create, any active member to take.** Posting a code-gated wager is a Silver-and-above privilege, while accepting runs the same checks as any named opponent — sanctions screening of both parties, active membership, concurrency limits — with no membership backdoor.
- **No decline, one clean cancel.** There is no "decline" on an open challenge; the creator canceling an unaccepted challenge is the only way to release it early.
- **Party separation.** The creator can't take their own challenge, and a named arbitrator can't take it either — a check that has to run at accept time, because the opponent was unknown when the wager was posted.

Layer the market-settled version on top and the platform's most trustless combination falls out for free: a challenge anyone with the code can take, settled automatically by a public market, timeline derived from the market's own end date, and refunding both sides if that market resolves invalid.

## Design decisions

**A draw is a new outcome, not a new kind of judge.** The list of who can resolve a wager is untouched. A draw is simply a new thing that can *happen*, permitted or forbidden depending on the resolution type. That kept every ordinary wager's path exactly as it was.

**Mutual consent over unilateral mercy.** Requiring both sides to agree on a participant-settled draw costs a second confirmation, but it removes the "losing side declares a draw" grief entirely — and because an unconfirmed proposal never locks anything, the worst a stalling counterparty can do is nothing.

**No admin override for stuck data sources.** A market that never resolves falls back to the deadline refund, which already returns both stakes. Adding a human override there would have created exactly the trusted party the whole design works to avoid.

**A fast code recipe, honestly scoped.** Turning the four words into a key is deliberately cheap. Because the code's public fingerprint sits on-chain, a determined attacker with dedicated hardware could in principle grind through the seventeen-trillion space. FairWins accepts that residual risk openly, scopes the guarantee to casual guessing, and asks the interface to say so for meaningful stakes. The recipe is versioned, leaving room to swap in a slower, harder-to-crack method later without breaking existing wagers.

Edge cases are where escrow apps earn trust. A wager that can end with nobody winning, and begin with nobody on the other side, is a wager system that has met its users.

## Further reading

- [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712) — the standard behind the signed "accept" message
- [BIP-39: Mnemonic code word list](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) — the word list the four-word claim code draws from
- [Polymarket documentation](https://docs.polymarket.com) — how public prediction markets resolve, including ties and invalid outcomes
