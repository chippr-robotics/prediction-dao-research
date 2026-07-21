# Social & Image — The Two-Facet Proxy: Beating the 24 KB Contract-Size Limit

## X (Twitter)

Our contract compiled to 24,460 of 24,576 bytes — 116 bytes of headroom — and the next feature needed 16 new entrypoints.

We didn't reach for a Diamond. One proxy, two implementations, one shared storage base, and a CI gate that validates the pair.

🔗 <link>

#Solidity #EVM #SmartContracts

## LinkedIn

Every serious Solidity team eventually hits EIP-170: deployed bytecode is capped at 24,576 bytes, and no optimizer setting saves you once a live, audited contract needs a large new feature. Our wager registry sat at 24,460 bytes when a gasless-transactions spec called for roughly sixteen new EIP-712 entrypoints.

The obvious answer is an EIP-2535 Diamond. We shipped something smaller instead — and the new post walks through exactly how and why:

- One UUPS proxy, two implementation facets: unknown selectors delegatecall from the main contract's fallback to an extension facet, so callers still see one address, one ABI, one event stream, and one EIP-712 domain.
- A single abstract base contract defines the storage layout and all internal action bodies; both facets inherit it, so layouts structurally cannot drift.
- A CI gate runs OpenZeppelin's validateUpgrade on the facet pair, treating the extension as an upgrade of the main implementation — drift fails the build.
- An honest comparison with Diamonds: what we gave up (introspection, per-selector upgrades) and what we kept (direct dispatch on hot paths, existing tooling, a twelve-line routing layer).

If your contract is creeping toward the ceiling, this is a shipped, testable pattern you can borrow before committing to a full facet framework.

🔗 <link>

Where do you draw the line between "split the contract" and "adopt a Diamond"?

#Solidity #EVM #SmartContracts #Web3 #ProtocolEngineering

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a single tall vault-like structure (representing one contract address) whose interior is revealed in cutaway to contain two interlocking crystalline blocks — one large primary block and one slimmer companion block — both plugged into the same glowing foundation slab etched with a fine grid (the shared storage layout). A thin beam of light routes from the vault's front door around the primary block into the companion block, suggesting calls being forwarded internally. Around the vault, a faint measuring gauge or ruler motif nearly filled to its top edge hints at a hard size limit almost reached. Deep navy and teal base palette with a single warm amber accent on the routing beam and the foundation grid lines; soft ambient lighting with gentle rim highlights on the crystalline edges; generous negative space, precise geometry, fintech-engineering mood. No text, no logos, no watermarks. Aspect ratio 16:9.
