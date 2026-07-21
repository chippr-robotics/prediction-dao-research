# Social & Image — Sanctions Screening as a Contract Primitive: One Guard, Every Value Path

## X (Twitter)

Frontend sanctions screening on a public blockchain is theater — anyone can call your contracts directly. We made screening a shared building block baked into the contracts: one fail-closed guard consulted by wagers, pools, memberships & token issuance. Entry is gated; exit never is. 🔗 <link> #web3 #compliance

## LinkedIn

If your smart contracts are publicly callable, a sanctions check that lives only in your website is not a control — it's a suggestion. Sanctions exposure is strict liability: it doesn't matter that your interface *would have* blocked the address if the contract accepted its money anyway.

In part 3 of our Identity & Access series, we walk through how FairWins turned sanctions screening into a shared on-chain building block instead of an off-chain afterthought:

- A ~100-line sanctions guard combining a public Chainalysis oracle with an operator block-list whose full history — who, why, when — lives permanently in the on-chain event log
- Fail-closed by construction: a broken or misconfigured oracle means "block everyone," while an intentionally unset oracle degrades to block-list-only
- One guard threading through four independent subsystems — wagers, pools, memberships, token issuance — with re-screening at every money entry point
- The line most teams draw wrong: refund and payout paths are deliberately unscreened, so a newly listed address can always recover its own escrowed funds. Screening gates entry, never exit

We also cover the honest trade-offs: gas on the busy path, trusting a centralized oracle, and accepting brief downtime as the price of failing closed.

Read the full post: <link>

Where do you draw the line between screening new business and freezing existing funds?

#SmartContracts #Compliance #web3 #Sanctions #security

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a single translucent guardhouse checkpoint standing at the convergence of four glowing circuit-board pathways, each path flowing inward from a different abstract structure (a pair of balanced scales, a ring of connected nodes, a stack of membership cards, a minted coin press), with small geometric traveler tokens passing through the checkpoint's gate while one token is halted by a raised barrier; outbound lanes on the far side flow freely with no gate. Deep navy and teal base palette with a single warm amber accent on the checkpoint beacon and the halted token, soft diffuse rim lighting with subtle depth shadows, fine line detail, generous negative space, fintech-engineering editorial mood. No text, no logos, no watermarks. Aspect ratio 16:9.
