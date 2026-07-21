# Social & Image — The FeeRouter: One Source of Truth for Platform Fees

## X (Twitter)

One source of truth for every fee: FairWins' FeeRouter keeps each rate under an immutable per-service cap (wrapped ≤ 250 bps), and the quoted rate rides along as maxFeeBps — charge above what the member saw and the tx reverts. 🔗 <link> #solidity #defi #fintech

## LinkedIn

Three integrations, three fee systems: env vars in the gateway, constants in the frontend, nothing on-chain. The failure mode writes itself — an operator updates one copy of the number, a member confirms a screen showing 0.50% while the backend charges 0.60%. For a platform whose fee doctrine is "the member always sees the real cost before signing," a stale disclosure isn't a display bug; it's a broken promise.

FairWins' spec 060 made fees a first-class on-chain subsystem, and the new post walks the design:

- One `FeeRouter` contract holds every configurable rate as a `bytes32` service id — no fee constant lives anywhere else, and the gateway only reads it.
- Caps are immutable at registration, with an absolute 250 bps ceiling on wrapped services. Admins can zero a fee instantly; nobody can quietly raise a ceiling.
- `maxFeeBps` turns the confirm screen into an enforceable contract: if the live rate exceeds what the member was shown, the transaction reverts.
- Atomic fee-for-value charging via `depositToVaultWithFee` — the treasury can never keep a fee for a deposit that didn't happen.

Full write-up: 🔗 <link>

Should fee disclosure be contract-enforced everywhere, or is UI-level disclosure enough for your users?

#solidity #defi #fintech #web3 #smartcontracts

## Image prompt (Gemini / Nano Banana)

Clean modern isometric editorial illustration: a single transparent routing hub — a faceted glass prism or junction box — at the center of the frame, with several thin conduits entering from the left carrying streams of small geometric tokens; inside the hub each stream visibly splits into a large continuing flow and one small measured sliver diverted to a compact vault, the split governed by a fixed physical gate rendered as a solid immovable bar (the hard cap). Above the hub floats a minimal open ledger panel with abstract bar marks, implying the rate is displayed before anything moves. Deep navy background with teal gradients and a fine engineering grid; a single warm amber accent illuminates the small diverted sliver and the gate, making the fee path the brightest, most visible element in the scene — nothing hidden. Soft precise studio lighting, crisp edges, minimalist fintech-engineering aesthetic, generous negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
