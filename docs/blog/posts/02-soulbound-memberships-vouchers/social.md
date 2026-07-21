# Social & Image — Soulbound Memberships, Transferable Vouchers: Splitting a Token in Two

## X (Twitter)

How do you gift a non-transferable membership? Split the token in two: an inert voucher (a prepaid gift card, really) that trades freely, plus a soulbound access record it burns into. Sanctions screening happens once — at redemption, where access is granted. 🎟️ 🔗 <link> #tokendesign #web3

## LinkedIn

"Just make the membership transferable" is the obvious answer to gifting and resale — and the wrong one when your access records feed compliance checks and per-wallet usage limits.

FairWins memberships are soulbound by construction: not a locked NFT, just a ledger entry tied to a wallet, with nothing to hand over. So how do you build a gift-and-resale market on top of that? By making the *right to claim* a membership transferable instead. The new post walks through the split:

- A membership voucher as a plain bearer claim — a prepaid gift card, essentially: bought at the tier's normal price, grants zero access while held, never expires, and locks in its tier at mint so later pricing changes can't touch it
- Redemption as the single control point: sanctions screening applies to the person redeeming, and the voucher is burned last, so a failed redemption leaves it intact and re-tradable
- Why the tradable asset is frozen while the redemption logic stays upgradeable — and why a plain ledger entry beat a locked token
- Honest privacy: redeeming from a fresh wallet gives pseudonymity, not unlinkability, and the interface is required to say so

If you're designing a token that "should" be both transferable and soulbound, the answer may be two artifacts joined by a burn.

Read it here: <link>

Where do you put the compliance checkpoint in a two-token design — mint, transfer, or redemption? #tokendesign #smartcontracts #NFT #accesscontrol

## Image prompt (Gemini / Nano Banana)

Clean modern editorial illustration, isometric style, of a two-part token metaphor: on the left, a glowing paper gift ticket (voucher) being passed between two abstract geometric hands across an open marketplace of floating pedestals; on the right, the ticket dissolving into particles as it feeds into a solid, anchored badge fused into a stone pillar — the badge visibly locked in place with a subtle chain-link base, conveying "soulbound." A thin luminous path connects the two halves through a stylized archway gate (the redemption checkpoint) with a small shield emblem. Deep navy and teal base palette with a single warm amber accent on the ticket and the path of light; soft ambient lighting with gentle rim highlights on the isometric surfaces, faint grid texture in the background for a fintech-engineering feel. Balanced composition with clear left-to-right narrative flow and generous negative space at the top. No text, no logos, no watermarks. Aspect ratio 16:9.
