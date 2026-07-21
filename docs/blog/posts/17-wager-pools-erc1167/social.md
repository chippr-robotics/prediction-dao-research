# Social & Image — Wager Pools: ERC-1167 Clones and Address-Keyed Payouts

## X (Twitter)

Group wager pools as immutable ERC-1167 clones: one UUPS factory, 45-byte proxies, and a payout matrix where the winner's address IS the claim code. We built the ZK version first — testers killed it. 🔗 <link> #Solidity #SmartContracts #ERC1167

## LinkedIn

How do twelve people escrow a season-long fantasy league on-chain when no oracle can answer "who won our league"? Our 1v1 wager registry couldn't express it — so FairWins built wager pools as a deliberately parallel system, and made two choices that run opposite to the registry's architecture.

The new post covers:

- Why each pool is an immutable ERC-1167 minimal-proxy clone (45 bytes of runtime code) stamped out by a single UUPS factory — and why "the rules cannot change under your escrow" beat upgradeability for bounded-lifetime group funds
- The address-keyed payout matrix: creator proposes, the contract validates sum == escrow on-chain, members approve to a fraction-of-joined threshold (minimum two approvals, so no self-dealing lock), and the winner's public address is the claim code — no secrets to exchange
- Baking EIP-712 gasless twins and EIP-3009 joins into immutable bytecode, plus factory forwarders that let a relayer whitelist one stable address while on-chain provenance checks constrain reachable targets
- The honest part: we built and empirically verified the Semaphore/Groth16 anonymous version first. Testers rejected the private claim code, and the spec directory name is the fossil record.

Full write-up: <link>

When have you chosen immutability over upgradeability for value-bearing contracts — and did it hold up?

#Solidity #SmartContracts #Ethereum #Web3 #ProtocolEngineering

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in isometric style: a large central factory structure resembling a precise geometric machine stamping out a row of small identical translucent cubes along a conveyor path, each cube containing a tiny glowing vault; from one cube, thin luminous lines fan out to a circle of twelve abstract figure tokens arranged around it, with a few lines highlighted returning payouts to three of the tokens. Composition balanced left-to-right with the factory on the left and the circle of tokens on the right, generous negative space, subtle grid floor. Deep navy and teal base palette with a single warm amber accent on the highlighted payout lines and vault glows, consistent with a fintech-engineering brand. Soft directional lighting with gentle rim highlights on the cube edges, no harsh shadows. No text, no logos, no watermarks. Aspect ratio 16:9.
