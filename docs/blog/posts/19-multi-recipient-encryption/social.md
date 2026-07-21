# Social & Image — One Ciphertext, N Wrapped Keys: Multi-Recipient Encryption for Private Wagers

## X (Twitter)

Encrypt once, wrap the key N times: FairWins private wagers keep one ChaCha20-Poly1305 ciphertext plus an X25519-wrapped DEK per reader. Adding a neutral arbitrator was a third array entry — not a redesign. 🔗 <link> #encryption #privacy #web3

## LinkedIn

A resolver who can't read the agreement they're supposed to rule on is worse than no resolver. That was the state of FairWins' third-party arbitration: the arbitrator was named and authorized on-chain, but the wager terms were end-to-end encrypted for exactly two participants. Re-encrypting per reader, sharing keys out-of-band, or holding a platform master key were all non-starters.

The fix required zero new cryptography — the envelope format was multi-recipient from day one. The new post walks the mechanism:

- One DEK encrypts the terms once (ChaCha20-Poly1305 AEAD); each reader gets an X25519 + HKDF wrapped copy of the DEK — ~60 bytes per reader, and everyone provably decrypts the same ciphertext.
- An on-chain `KeyRegistry` supplies encryption public keys, sized to fit both X25519 and X-Wing hybrid post-quantum keys without a contract change.
- Fail-closed creation: no registered key for a named arbitrator, no wager — never a wager its own resolver can't read.
- Honest limits: removing a reader from the envelope is not revocation, and the design says so plainly.

Full write-up: 🔗 <link>

Where do you draw the line between access-grant machinery and true revocation in E2EE systems?

#encryption #cryptography #privacy #web3 #ethereum

## Image prompt (Gemini / Nano Banana)

Clean modern editorial illustration, isometric composition: a single large sealed glass envelope or crystalline data vault at center containing an abstract glowing document, orbited by three distinct translucent keys on smooth arcs — two matched keys close in and one slightly apart (the neutral third reader), each key connected to the vault by a thin luminous thread. The vault's surface shows a faint layered lattice suggesting encryption without any readable characters. Deep navy background with teal geometric gradients and subtle grid lines; a single warm amber accent glows on the third key and its thread. Soft studio lighting with gentle rim light on the glass edges, shallow depth, minimalist fintech-engineering aesthetic, generous negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
