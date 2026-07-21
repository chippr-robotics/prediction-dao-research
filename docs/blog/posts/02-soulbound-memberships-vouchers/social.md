# Social & Image — Soulbound Memberships, Transferable Vouchers: Splitting a Token in Two

## X (Twitter)

How do you gift a non-transferable membership? Split the token in two: an inert ERC-721 voucher that trades freely + a soulbound access record it burns into. Sanctions screening happens once — at redemption, where standing is granted. 🎟️ 🔗 <link> #Solidity #tokendesign #web3

## LinkedIn

"Make the membership transferable" is the obvious answer to gifting and resale — and the wrong one when your access records feed compliance checks and per-address usage limits.

FairWins memberships are soulbound by construction: not a locked NFT, just a storage record keyed to an address, with nothing to transfer. So how do you build a gift-and-resale market on top of that? By making the *right to claim* a membership transferable instead. The new post walks through the split:

- A membership voucher as a plain ERC-721 bearer claim: minted at the tier's USDC price, confers zero access while held, never expires, snapshots its (role, tier) at mint so later config changes can't touch it
- Redemption as the single control point: strict checks-effects-interactions, sanctions screening fail-closed on the redeemer only, voucher burned last so a failed redemption leaves it intact and re-tradable
- Why the tradable asset is immutable while the redemption logic lives behind a UUPS proxy — and why the mapping beat an EIP-5192 locked token
- Honest privacy: fresh-wallet redemption gives pseudonymity, not unlinkability, and the UI is required to say so

If you're designing a token that "should" be both transferable and soulbound, the answer may be two artifacts joined by a burn.

Read it here: <link>

Where do you put the compliance choke point in a two-token design — mint, transfer, or redemption? #Solidity #tokenomics #smartcontracts #NFT #accesscontrol

## Image prompt (Gemini / Nano Banana)

Clean modern editorial illustration, isometric style, of a two-part token metaphor: on the left, a glowing paper gift ticket (voucher) being passed between two abstract geometric hands across an open marketplace of floating pedestals; on the right, the ticket dissolving into particles as it feeds into a solid, anchored badge fused into a stone pillar — the badge visibly locked in place with a subtle chain-link base, conveying "soulbound." A thin luminous path connects the two halves through a stylized archway gate (the redemption checkpoint) with a small shield emblem. Deep navy and teal base palette with a single warm amber accent on the ticket and the path of light; soft ambient lighting with gentle rim highlights on the isometric surfaces, faint grid texture in the background for a fintech-engineering feel. Balanced composition with clear left-to-right narrative flow and generous negative space at the top. No text, no logos, no watermarks. Aspect ratio 16:9.
