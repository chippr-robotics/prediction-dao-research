# Social & Image — Earn Without Custody Surprises

## X (Twitter)

Idle USDC between wagers should earn — without custody and without a hidden skim. FairWins deposits straight into Morpho ERC-4626 vaults, and charges its platform fee atomically via a FeeRouter that reverts if the live rate ever exceeds the bps you saw at signing. 🔗 <link>

#DeFi #ERC4626 #SmartContracts

## LinkedIn

Every consumer crypto "earn" feature faces two tempting shortcuts: take custody and become an asset manager, or route into someone else's protocol and quietly keep a slice of the yield. FairWins refused both.

Our new Earn section (spec 050 + 060) deposits idle stablecoins directly from the member's account into curated Morpho ERC-4626 vaults — FairWins never holds funds — and monetizes it with a single honest fee. The post walks through both layers:

- Non-custodial ERC-4626 integration: exact-amount approvals, staticCall dry-runs, `redeem` on full exits so share dust never strands.
- The `FeeRouter`: one on-chain source of truth, each fee a `bytes32 serviceId` with an immovable hard cap (250 bps max on wrapped services).
- Atomic charging: `depositToVaultWithFee` takes the fee and deposits the remainder in one transaction — any failing leg reverts everything.
- Honest disclosure: `maxFeeBps` is a consent ceiling; a member can never pay more than the rate shown on the confirm screen, and a failed rate read blocks the deposit rather than guessing zero.

The rule that generalizes all of it: the member either sees the true number, or the action doesn't happen.

How does your team handle fee disclosure when integrating third-party DeFi protocols? 🔗 <link>

#DeFi #ERC4626 #SmartContracts #Solidity #FinTech

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration, isometric perspective, of a single stablecoin token flowing along a transparent glass conduit into a stylized vault chamber, with one small precise slice diverting cleanly into a separate side channel — the two paths splitting from a single junction to convey an atomic, all-or-nothing transaction. Set against a deep navy and teal base, with a single warm amber accent lighting the diverted fee slice and the junction node. Soft volumetric lighting from the upper left, subtle depth-of-field, geometric precision, restrained and trustworthy fintech-engineering mood, ample negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
