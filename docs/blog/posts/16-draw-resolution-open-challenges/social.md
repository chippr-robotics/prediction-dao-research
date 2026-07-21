# Social & Image — When Nobody Wins and Anyone Can Play: Draw Resolution and Open-Challenge Wagers

## X (Twitter)

How does an escrow contract settle a forecast nobody should win? FairWins added a distinct Draw state (mutual consent, per-resolution-type authority) and open challenges gated by a 4-word claim code that is secretly a keypair. 🔗 <link> #Solidity #SmartContracts

## LinkedIn

Two edge cases separate a demo escrow contract from a finished protocol. First: a forecast between two parties is voided by events — the match is abandoned, the question becomes moot. Neither side should win, but "wait for the deadline and refund" is indistinguishable on-chain from two people forgetting about it. Second: someone wants to post a challenge with no named counterparty — first qualified taker joins — without broadcasting the terms to every mempool observer.

Our latest FairWins engineering post walks through how both were closed:

- A distinct `Draw` terminal state that returns each party exactly their own stake, with authority split by resolution type: mutual consent for participant-resolved wagers, arbitrator-only for third-party, and no human override at all for oracle-settled ones
- Tie handling: an invalid or 50/50 oracle resolution settles as an immediate draw — the protocol refunds rather than inventing a winner
- Open challenges gated by a four-word claim code that doubles as a keypair: discovery, EIP-712 accept authorization bound to the taker's address (front-running defense), and terms decryption from one shareable secret
- The guardrails an unknown counterparty demands: no self-resolution, equal stakes only, tier gating, sanctions screening

These are skill-based forecasts on public information between consenting, screened participants — and the design bias throughout is refund over guesswork.

Read the full post: <link>

Where do you draw the line between admin override and pure protocol rules when a contract outcome becomes undecidable?

#Solidity #SmartContracts #Ethereum #ProtocolDesign

## Image prompt (Gemini / Nano Banana)

Clean modern isometric editorial illustration of balanced settlement and open invitation: at center, a perfectly level glass balance scale holding two identical translucent coin stacks, each connected by a thin light trace flowing back outward to its own side — value returning to where it came from, no winner — beneath a calm geometric arch. To the right, a slightly open door-shaped portal formed of four floating faceted tokens arranged in a vertical line, acting as a key, with a soft path of light leading through it toward the scale. Deep navy background with teal tones on the glass scale, arch, and light traces, and a single warm amber glow on the four-token key and the doorway edge as the only warm accent. Soft diffuse lighting with gentle rim highlights, subtle floating particles, precise fintech-engineering aesthetic, uncluttered composition with generous negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
