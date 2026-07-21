# Social & Image — Private Prediction Markets: Confidential Terms with Trustless Settlement

## X (Twitter)

A private bet with public enforceability: wager terms encrypted once, the key wrapped per participant with wallet-derived X-Wing keypairs (X25519 + ML-KEM-768), envelope on IPFS, 60-byte CID on-chain. Escrow + oracle pegging settle it automatically. 🔗 <link> #web3 #privacy

## LinkedIn

Public prediction markets have a problem for professionals: your position is the signal. Two analysts who disagree about a publicly covered outcome — a merger clearing review, a policy decision — can't back their views on a public order book without exposing their firms' thinking. And a bilateral handshake means lawyers, escrow, and counterparty risk.

Our engineering post on FairWins' private prediction markets shows how envelope encryption resolves this tension. It covers:

- The five-stage contract lifecycle — creation, offer, consideration, acceptance, execution — mapped onto smart-contract escrow and automatic settlement
- Envelope encryption in practice: terms encrypted once with a random key, then that key wrapped per participant using keypairs derived deterministically from each wallet's signature — no central key custody
- Post-quantum protection via X-Wing (hybrid X25519 + ML-KEM-768) with ChaCha20-Poly1305, defending against harvest-now-decrypt-later attacks
- Off-chain/on-chain separation: the encrypted envelope lives on IPFS while the chain stores only a CID, addresses, stakes, and outcome — so larger post-quantum ciphertexts cost no extra gas

One thing we're explicit about: this privacy protects competitive intelligence and trading strategies, not illegal activity. Participants remain fully subject to applicable law and professional obligations.

Read the full post: <link>

Where else do you see envelope encryption earning its place in on-chain applications?

#encryption #privacy #predictionmarkets #web3 #fintech

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an abstract-geometric style for a fintech engineering blog banner: a large translucent sealed envelope floating at center, containing a glowing document rendered as unreadable ciphertext blocks, with two smaller sealed key-envelopes orbiting it — each tethered by a thin luminous line to one of two stylized geometric wallet shapes at opposite corners, suggesting two counterparties who each hold their own independent access. Beneath the envelope, a horizontal chain of minimal linked blocks anchors the scene, one block highlighted to imply a tiny on-chain reference to the larger off-chain envelope above. Composition is balanced and symmetrical with generous negative space; deep navy and teal base palette with a single warm amber accent reserved for the key-envelopes and their seals; soft diffuse lighting with subtle rim glow on the envelope edges, faint isometric grid in the background. No text, no logos, no watermarks. Aspect ratio 16:9.
