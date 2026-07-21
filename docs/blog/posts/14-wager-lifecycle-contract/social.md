# Social & Image — The Wager Lifecycle Contract

## X (Twitter)

A P2P escrow contract is really a state machine over other people's money. FairWins' WagerRegistry: 7 states, 2 hard deadlines (30d accept / 180d resolve), 8 resolution authorities — and no state without a unilateral exit. Anatomy inside. 🔗 <link> #Solidity #SmartContracts #web3

## LinkedIn

Informal bets fail in predictable ways: the counterparty never commits their stake, nobody has authority to declare the winner, the event never resolves, or the money gets stuck. Building an on-chain escrow that closes every one of those holes is a design exercise in state machines, not just token transfers.

Part 1 of our Prediction Markets series dissects FairWins' `WagerRegistry` — the peer-to-peer wager escrow contract — as a lifecycle:

- Seven explicit states (Open → Active → Resolved/Refunded/Draw) where every state that holds funds has an exit requiring no cooperation from the other party
- Two absolute deadlines per wager (acceptDeadline, resolveDeadline) with hard caps of 30 and 180 days, so escrow can never be stranded indefinitely
- Eight resolution types — participant-declared, arbitrator, and oracle-driven (Polymarket, Chainlink, UMA) — each fixing exactly one settlement authority at creation
- Checks-effects-interactions discipline on every token movement, and why exit paths deliberately stay open even when the contract is paused

If you're building anything that escrows funds between untrusting parties, the lifecycle framing here generalizes well beyond wagers.

Read the full post: <link>

What's your approach to guaranteeing liveness in escrow contracts — timeouts, keepers, or something else?

#Solidity #SmartContracts #Ethereum #DeFi #Engineering

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric abstract-geometric style: a stylized circular flow of seven connected glass-like nodes arranged as a state diagram, with glowing directional arrows tracing paths between them — one bright path flowing forward through three nodes to a vault-like cube releasing two coin streams, and secondary escape paths looping back from every node toward a safe-return gate. Two small hourglass forms sit on the connecting edges, suggesting deadlines. Deep navy and teal base palette with a single warm amber accent lighting the winning path and the hourglasses; soft rim lighting, subtle depth-of-field, generous negative space, fintech-engineering mood, precise and technical rather than playful. No text, no logos, no watermarks. Aspect ratio 16:9.
