# Social & Image — Integrating Safe as a Custody Layer, Without Running Safe's Backend

## X (Twitter)

We integrated Safe multisig custody with zero backend: on-chain approveHash + pre-validated sigs (v=1, r=owner) replace the Transaction Service, and a 66-line events-only contract handles proposal discovery. Clients verify every preimage by recomputing the hash. 🔗 <link> #Safe #multisig #web3

## LinkedIn

Most Safe integrations quietly depend on a hosted backend — the Safe Transaction Service stores proposals and signatures off-chain, and if it disappears, coordination stops. FairWins has a hard rule against app backends, so we integrated Safe v1.4.1 as our custody layer using only the chain itself.

The new post walks through the architecture:

- The on-chain-only approval flow: each owner calls approveHash, then anyone executes with pre-validated signature bundles (v=1, r=owner address) — no off-chain ECDSA collection anywhere.
- SafeProposalHub, a stateless, events-only contract for co-owner discovery. Clients recompute the EIP-712 Safe transaction hash from emitted parameters and reject mismatches, so the hub carries data but never trust — plus a signed-payload QR fallback so the feature works with zero infrastructure.
- One "operate as the vault" seam routing every money-moving surface (wagers, payments, swaps) into the vault's threshold-gated queue.
- Why Safe v1.4.1 specifically: canonical addresses are identical across Ethereum Classic, Mordor, and Polygon.

We also cover the honest edge cases — like why a vault-won wager payout still needs threshold approval when refunds don't.

Read the full post: <link>

If you've integrated Safe without the Transaction Service, what did you use for proposal discovery?

#Safe #multisig #custody #DAOtooling #smartcontracts

## Image prompt (Gemini / Nano Banana)

Clean modern editorial illustration, isometric style: a translucent geometric vault shaped like a faceted glass cube floating at center, sealed by three interlocking mechanical keys converging from different angles, each key held by an abstract faceless figure standing on separate floating platforms connected only by thin glowing chain-links of blockchain blocks — no wires to any central server; a small radiant beacon beside the vault emits concentric broadcast rings carrying tiny document glyphs toward the figures, symbolizing an events-only proposal broadcaster. Deep navy and teal base palette with a single warm amber accent on the beacon's rings and the keyways, soft diffused rim lighting, subtle grid horizon fading into darkness, generous negative space, precise vector-like edges, fintech-engineering brand mood, no text, no logos, no watermarks. Aspect ratio 16:9.
