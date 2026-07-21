# Social & Image — CallsignRegistry: An In-House ENS-Style Naming System That Nothing Depends On

## X (Twitter)

FairWins built an ENS-style naming registry — commit–reveal, ASCII-only to kill homoglyph attacks — then engineered its blast radius to zero. A callsign is optional and never gates the value path: undeploy the registry and every wager still settles, some screens just show hex again. 🔗 <link>

#Ethereum #Solidity #Identity

## LinkedIn

A forty-two-character hex address is a payment-misdirection bug waiting to happen. The ecosystem's answer is ENS — but ENS is Ethereum-mainnet-only, and FairWins runs on Polygon and Mordor with an on-chain membership spine ENS knows nothing about.

So spec 054 built the CallsignRegistry in-house — and wrapped two disciplines around it. The post covers:

- Commit–reveal registration borrowed from ENS, plus a hardening fix that stops an attacker from replaying your public commitment to perpetually reset its age.
- An ASCII-only name format (`a-z0-9`, interior hyphens): less expressive, but the homoglyph attack surface is eliminated rather than mitigated.
- One name, one address — deliberately rejecting ENS's controller/resolver split, the classic payout-redirect vector; repointing is a delayed, cancellable migration, not an everyday edit.
- The optionality doctrine: nothing on the value path may require a callsign (FR-001a). A below-Gold, callsign-less account completing a full wager is a tested invariant, not a marketing line.

The result: ENS's registration security, a narrower resolution model, and a blast radius engineered to zero. If the registry vanished tomorrow, every wager would still settle.

Where's the line for you between a nice-to-have perk and a load-bearing primitive? 🔗 <link>

#Ethereum #Solidity #Identity #ENS #SmartContracts

## Image prompt (Gemini / Nano Banana)

A clean abstract-geometric editorial illustration of a single elegant nameplate token resolving via one clear arrow to exactly one wallet node — deliberately one-to-one, no branching resolver indirection. The nameplate floats slightly apart from a dense core lattice of value-carrying nodes below it, connected by only a thin, clearly detachable thread, conveying that it is an optional layer nothing structurally depends on. Deep navy and teal base, with a single warm gold accent highlighting the nameplate and its single resolution arrow. Soft glow, precise vector forms, subtle background grid, restrained and trustworthy fintech-engineering mood, generous negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
