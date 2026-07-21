# Social & Image — Three Kinds of Truth, One Interface: The Oracle Adapter Layer

## X (Twitter)

One escrow contract, four oracles: Polymarket resolved markets, Chainlink push feeds, request/callback Functions, UMA optimistic assertions. All collapse to one bool behind IOracleAdapter — and an undecidable tie becomes a refund, never a coin flip. 🔗 <link> #Solidity #Oracles

## LinkedIn

An escrow contract that settles forecasting wagers needs exactly one bit from the outside world: did YES win? But the truth behind that bit can live in very different places — a price feed that publishes on-chain continuously, an HTTPS API nothing on-chain knows about, or a messy real-world event that needs a human assertion with a dispute window.

Our latest FairWins engineering post covers how one Solidity interface absorbs all of them:

- The `IOracleAdapter` seam: an opaque `bytes32` condition id, a single `bool` outcome, and a `resolvedAt == 0` sentinel for "nothing to act on yet"
- Four adapters, three interaction models: Polymarket resolved-market reads, Chainlink Data Feed thresholds, Chainlink Functions request/callback, and UMA Optimistic Oracle V3 assertions
- Failure semantics that never guess: a 50/50 or invalid market settles as a draw with both stakes returned — no path invents a winner
- Why the escrow registry never imports a Chainlink or UMA interface, and how that let the product narrow to Polymarket-only with zero contract changes

These are skill-based forecasts on publicly available information, and the design goal is honest settlement — including when the honest answer is "nobody won."

Read the full post: <link>

If you've integrated multiple oracle providers behind one interface, what convention did you standardize on for "not resolved yet"?

#Solidity #Oracles #SmartContracts #Chainlink #web3

## Image prompt (Gemini / Nano Banana)

Clean abstract-geometric editorial illustration of oracle abstraction: three distinct luminous data streams flowing from the left — a smooth continuous wave of stacked tick marks, a dotted request-and-return loop arcing out and back, and a slower stream passing through an hourglass-like dispute chamber — all converging into a single elegant prism-shaped adapter node at center, which emits one clean unified beam continuing right into a simple sealed vault form. The three incoming streams are visibly different in texture and rhythm; the outgoing beam is singular and calm. Deep navy background with teal and cyan tones for the streams and vault, and a single warm amber glow concentrated on the central prism node as the only warm accent. Soft studio lighting, faint grid horizon, precise fintech-engineering aesthetic, generous negative space, balanced left-to-right composition. No text, no logos, no watermarks. Aspect ratio 16:9.
