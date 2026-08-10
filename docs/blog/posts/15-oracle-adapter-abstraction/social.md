# Social & Image — Three Kinds of Truth, One Referee Slot

## X (Twitter)

One escrow, four referees: resolved prediction markets, live price feeds, on-demand data lookups, and human-judgment disputes. All plug into one slot and answer a single yes-or-no — and an undecidable tie becomes a refund, never a coin flip. 🔗 <link> #PredictionMarkets #Oracles

## LinkedIn

An escrow that settles forecasting wagers needs exactly one fact from the outside world: did the "yes" side win? But the truth behind that fact can live in very different places — a price feed that publishes on-chain continuously, a web service nothing on-chain knows about, or a messy real-world event that needs a human assertion with a dispute window.

Our latest FairWins engineering post covers how one standard slot absorbs all of them — an oracle being the trusted referee that tells the contract who won:

- One slot, one yes-or-no answer, and a "not resolved yet" signal for "nothing to act on"
- Four referees, three ways of working: resolved prediction markets, live price-feed thresholds, on-demand data lookups, and unchallenged-assertion disputes
- Failure semantics that never guess: a 50/50 or invalid market settles as a draw with both stakes returned — no path invents a winner
- Why the escrow never contains any referee-specific code, and how that let the product narrow to a single option with zero changes to the escrow

These are skill-based forecasts on publicly available information, and participants remain subject to applicable law. The design goal is honest settlement — including when the honest answer is "nobody won."

Read the full post: <link>

If you've plugged multiple data sources behind one interface, what convention did you standardize on for "not resolved yet"?

#PredictionMarkets #Oracles #SmartContracts #Web3

## Image prompt (Gemini / Nano Banana)

Clean abstract-geometric editorial illustration of oracle abstraction: three distinct luminous data streams flowing from the left — a smooth continuous wave of stacked tick marks, a dotted request-and-return loop arcing out and back, and a slower stream passing through an hourglass-like dispute chamber — all converging into a single elegant prism-shaped adapter node at center, which emits one clean unified beam continuing right into a simple sealed vault form. The three incoming streams are visibly different in texture and rhythm; the outgoing beam is singular and calm. Deep navy background with teal and cyan tones for the streams and vault, and a single warm amber glow concentrated on the central prism node as the only warm accent. Soft studio lighting, faint grid horizon, precise fintech-engineering aesthetic, generous negative space, balanced left-to-right composition. No text, no logos, no watermarks. Aspect ratio 16:9.
