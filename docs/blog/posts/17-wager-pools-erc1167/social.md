# Social & Image — Wager Pools: ERC-1167 Clones and Address-Keyed Payouts

## X (Twitter)

Group wager pools as tamper-proof ERC-1167 clones: one upgradeable factory, tiny 45-byte proxies, and a payout list where the winner's public address IS the claim code. We built the zero-knowledge version first — testers killed it. 🔗 <link> #PredictionMarkets #Web3

## LinkedIn

How do twelve people escrow a season-long fantasy league on-chain when no outside market can answer "who won our league"? Our one-on-one wager escrow couldn't express it — so FairWins built wager pools as a deliberately parallel system, and made two choices that run opposite to the core design.

The new post covers:

- Why each pool is a tamper-proof minimal-proxy clone (about 45 bytes) stamped out by a single upgradeable factory — and why "the rules cannot change under your escrow" beat upgradeability for bounded-lifetime group funds
- The address-keyed payout list: the creator proposes, the contract checks the amounts sum to the exact pot on-chain, members approve to a fraction-of-joined threshold (minimum two approvals, so no self-dealing lock), and the winner's public address is the claim code — no secrets to exchange
- Gasless collection baked into every pool from day one, plus a stable factory front door that lets a helper service submit on behalf of members while on-chain checks constrain what it can reach
- The honest part: we built and verified the anonymous zero-knowledge version first. Testers rejected the private claim code, so we swapped it for plain public addresses.

Full write-up: <link>

When have you chosen "the rules can't change" over upgradeability for value-bearing contracts — and did it hold up?

#PredictionMarkets #Web3 #ProductDesign #Ethereum

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in isometric style: a large central factory structure resembling a precise geometric machine stamping out a row of small identical translucent cubes along a conveyor path, each cube containing a tiny glowing vault; from one cube, thin luminous lines fan out to a circle of twelve abstract figure tokens arranged around it, with a few lines highlighted returning payouts to three of the tokens. Composition balanced left-to-right with the factory on the left and the circle of tokens on the right, generous negative space, subtle grid floor. Deep navy and teal base palette with a single warm amber accent on the highlighted payout lines and vault glows, consistent with a fintech-engineering brand. Soft directional lighting with gentle rim highlights on the cube edges, no harsh shadows. No text, no logos, no watermarks. Aspect ratio 16:9.
