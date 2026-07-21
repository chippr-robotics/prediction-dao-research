# Social & Image — The Nullifier System: A Privacy-Preserving Blocklist That Never Shipped

## X (Twitter)

"Nullifier" in Tornado = anti-double-spend. FairWins' "nullifier" = something else entirely: an RSA-accumulator blocklist that voids bad markets and proves a market is NOT revoked in ~256 bytes — no public blacklist. It's archived, and we explain honestly why. 🔗 <link>

#ZK #privacy #cryptography

## LinkedIn

Moderating a permissionless market venue has an awkward requirement: you sometimes need to revoke a malicious market or a bad-actor address — but publishing a plaintext, fully-enumerable blocklist on-chain leaks your threat model and grows gas with every entry.

FairWins' archived "nullifier system" reached for the same primitive the ZK-mixer world uses for its nullifier sets — an RSA accumulator — and pointed it at moderation instead of anonymity. The latest engineering post walks the design and is candid about the fact that it never reached a live network:

- Why "nullifier" here means *void*, not the Tornado/Semaphore anti-replay value — and where the two ideas genuinely overlap
- Deterministic hash-to-prime + `A = g^(product of primes) mod n`: the whole revoked set collapses to one 256-byte value
- Non-membership proofs via a Bezout witness — prove a market is clean without revealing the blocklist
- The honest limits: a trusted-setup ceremony that was never run, enforcement off by default, and why FairWins shipped a sanctions guard instead

A clean case study in applying real accumulator cryptography to a set-membership problem — with the trade-offs on the label.

🔗 <link>

When does a compact cryptographic accumulator actually beat a plain on-chain mapping for your use case — and is the trusted setup worth it?

#ZeroKnowledge #Cryptography #Blockchain #SmartContracts #Privacy

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in isometric style for a fintech-engineering blog banner. Central subject metaphor: a single glowing sealed vault-node or lockbox that many faint, ghostly geometric tokens flow toward, but instead of being listed on a public ledger they are absorbed and compressed into one small luminous cube — visualizing many blocked items collapsing into a single compact cryptographic value. Around it, a scattering of prime-number motifs and thin mathematical filament lines (modular-arithmetic curves) drift as translucent overlays. Composition: off-center focal cube on the right third, negative space on the left, subtle depth with layered planes. Color mood: deep navy and teal base with a single warm amber accent used only on the compressed cube and one proof-witness beam. Lighting: soft volumetric glow from the cube, cool ambient fill, gentle rim light on the geometric shapes. Slightly muted, precise, engineering-grade aesthetic — not flashy, not neon. No text, no logos, no watermarks. Aspect ratio 16:9.
