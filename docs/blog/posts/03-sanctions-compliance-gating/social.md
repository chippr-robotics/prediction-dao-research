# Social & Image — Sanctions Screening as a Contract Primitive: One Guard, Every Value Path

## X (Twitter)

Frontend sanctions screening on a public chain is theater — anyone can call your contracts directly. We made screening a contract primitive: one fail-closed SanctionsGuard consulted by wagers, pools, memberships & token issuance. Entry is gated; exit never is. 🔗 <link> #Solidity #web3 #compliance

## LinkedIn

If your smart contracts are publicly callable, a sanctions check that lives only in your frontend is not a control — it's a suggestion. OFAC exposure is strict liability: it doesn't matter that your UI *would have* blocked the address if the contract accepted its escrow anyway.

In part 3 of our Identity & Access series, we walk through how FairWins turned sanctions screening into a shared on-chain primitive instead of an off-chain afterthought:

- A ~100-line SanctionsGuard combining the Chainalysis on-chain oracle with an operator deny-list whose full history (actor, reason, timestamp) lives in event logs
- Fail-closed by construction: a low-level staticcall treats a broken, codeless, or malformed oracle as "block everyone" — while an intentionally unset oracle degrades to deny-list-only
- One guard threading through four independent subsystems — wagers, pools, memberships, token issuance — with re-screening at every value entry point
- The line most teams draw wrong: refund and payout paths are deliberately unscreened, so a newly listed address can always recover its own escrowed funds. Screening gates entry, never exit

We also cover the honest trade-offs: gas on the hot path, trusting a centralized oracle, and accepting downtime as the price of fail-closed.

Read the full post: <link>

Where do you draw the line between screening new business and freezing existing funds? 

#SmartContracts #Compliance #Solidity #web3 #Sanctions

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a single translucent guardhouse checkpoint standing at the convergence of four glowing circuit-board pathways, each path flowing inward from a different abstract structure (a pair of balanced scales, a ring of connected nodes, a stack of membership cards, a minted coin press), with small geometric traveler tokens passing through the checkpoint's gate while one token is halted by a raised barrier; outbound lanes on the far side flow freely with no gate. Deep navy and teal base palette with a single warm amber accent on the checkpoint beacon and the halted token, soft diffuse rim lighting with subtle depth shadows, fine line detail, generous negative space, fintech-engineering editorial mood. No text, no logos, no watermarks. Aspect ratio 16:9.
