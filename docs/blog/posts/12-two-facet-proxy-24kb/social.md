# Social & Image — The Two-Facet Proxy: Beating the 24 KB Contract-Size Limit

## X (Twitter)

Our central contract had ~116 bytes of room left — and the next feature needed 16 new entrypoints. Smart contracts have a hard size limit, like a strict page limit for one binder. Our fix: split one contract into two cooperating halves that share one set of records, at one unchanged address. 🔗 <link> #web3 #smartcontracts

## LinkedIn

Ethereum-style blockchains cap how big a single smart contract can be — roughly 24 KB, a hard ceiling you can't optimize your way past. Think of it as a strict page limit for a document that must fit in one binder. Our central wager contract had almost filled its binder when a big new gasless-features effort needed sixteen more entrypoints.

The elaborate industry answer is the "Diamond" pattern. We shipped something smaller — and the new post walks through how and why:

- One address, one public face, but two cooperating halves behind it: the main half handles what it knows; anything it doesn't recognize gets quietly forwarded to an extension half — which runs as if it were the same contract, sharing the same records and identity.
- The record layout is defined in exactly one shared place both halves are built on, so they structurally cannot disagree about where things are stored.
- An automated gate checks the two halves line up before any change can merge.
- An honest comparison with the Diamond pattern: what we gave up, and what we kept (fast common paths, existing tooling, a tiny routing layer).

If your contract is creeping toward the ceiling, this is a shipped, testable pattern worth knowing before you reach for a heavier framework.

🔗 <link>

Where would you draw the line between "split the contract" and "adopt a heavier framework"?

#web3 #smartcontracts #architecture #engineering #fintech

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a single tall vault-like structure (representing one contract address) whose interior is revealed in cutaway to contain two interlocking crystalline blocks — one large primary block and one slimmer companion block — both plugged into the same glowing foundation slab etched with a fine grid (the shared storage layout). A thin beam of light routes from the vault's front door around the primary block into the companion block, suggesting calls being forwarded internally. Around the vault, a faint measuring gauge or ruler motif nearly filled to its top edge hints at a hard size limit almost reached. Deep navy and teal base palette with a single warm amber accent on the routing beam and the foundation grid lines; soft ambient lighting with gentle rim highlights on the crystalline edges; generous negative space, precise geometry, fintech-engineering mood. No text, no logos, no watermarks. Aspect ratio 16:9.
