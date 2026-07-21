# Social & Image — UUPS Upgrades Without the Footguns: One Base Contract, One CI Gate

## X (Twitter)

Shipping new logic to a live escrow contract without stranding a wager: 7 UUPS proxies, one ~40-line shared base, and a CI gate that diffs storage layouts against the deployed impl before merge. The `__gap` shrank 50→48→45 — on purpose. 🔗 <link> #Solidity #UUPS #web3

## LinkedIn

Every Solidity team eventually faces the same problem: the contract holding user funds needs new logic, but a fresh deployment starts with empty storage — stranding every balance and mapping at the old address.

Our latest engineering post walks through how FairWins made in-place upgrades boring (in the best way) across seven UUPS proxies, from the wager escrow to the fee router:

- A single shared base, `UUPSManaged`, that locks out implementation hijacking (`_disableInitializers`), separates `UPGRADER_ROLE` from admin, and keeps the upgrade path non-brickable by construction
- Constructor-to-`initialize` conversion, including the silent bug everyone hits: inline state initializers that never run behind a proxy
- Append-only storage with a trailing `__gap` that shrinks by exactly the slots each upgrade appends — with the real history from two shipped upgrades
- A CI-gated storage-layout check that validates new code against the *recorded deployed implementation*, so a state-corrupting upgrade fails the build instead of corrupting funds

We also cover the honest trade-off: upgradeability is a trust statement, and some contracts (like bearer-asset NFTs) deliberately stay immutable.

Read the full post: <link>

How does your team gate storage-layout compatibility — CI, deploy-time validation, or both?

#Solidity #SmartContracts #UUPS #DevOps #Ethereum

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a stable architectural pedestal (representing a proxy contract at a fixed address) on which a glowing modular engine block is being swapped out by a robotic crane arm, while a translucent column of neatly stacked data slots beneath the pedestal remains perfectly undisturbed — the bottom slots solid and locked, a few reserve slots at the top shown as empty outlined placeholders. To one side, a small checkpoint gate with a green scanning beam inspects the incoming engine block before it can dock, suggesting automated validation. Composition: wide 16:9 scene with the pedestal slightly left of center, generous negative space on the right, subtle grid floor fading into the background. Color mood: deep navy and teal base palette with a single warm amber accent on the engine block being installed and the scanner beam highlight. Lighting: soft directional studio light with gentle rim glow on the isometric edges, faint cool ambient haze. Precision-engineered fintech aesthetic, minimal detail noise, no text, no logos, no watermarks. Aspect ratio 16:9.
