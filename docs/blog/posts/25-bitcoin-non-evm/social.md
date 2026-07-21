# Social & Image — Bitcoin in an EVM-Native App: Guarding Every Boundary

## X (Twitter)

Adding Bitcoin to an EVM app: the tempting shortcut is a fake numeric chainId. FairWins gave it string ids + an `isBitcoinNetworkId` guard so a wrong crossing is a type error, not a runtime landmine. BTC sends are never gasless — the member pays the network fee, quoted as a hard ceiling. 🔗 <link>

#Bitcoin #Web3 #MultiChain

## LinkedIn

In a mature EVM codebase, "a network is a numeric chainId with contracts on it" is an assumption baked into dozens of files — and never written down, because it never had to be. Then the roadmap says: add Bitcoin.

Bitcoin breaks all of it at once — no chainId, no contracts, no accounts, value in UTXOs, fees in sat/vB. The post walks the four boundaries that made it work:

- Parallel registry: Bitcoin gets string ids (`'bitcoin'`, `'bitcoin-testnet'`) with an `isBitcoinNetworkId` guard, so a string id can never reach EVM-typed plumbing by accident.
- One seed, two cryptographies: BIP84/BIP86 keys derive from the same passkey master seed via a domain-separated HKDF subtree — no second recovery phrase, keys and xpubs never leave the client.
- Fail-safe UTXO handling: a coin is spendable only when positively verified stamp-free; if the stamps indexer degrades, coins are protected, never destroyed.
- Fees as a ceiling: quotes expire in 60s and the confirmed fee is a hard signing limit. BTC sends are never gasless — the confirm UI says plainly the member pays the network fee.

The theme throughout: fail safe over available, and make the wrong crossing impossible rather than merely discouraged.

How do you keep non-EVM chains from corrupting EVM-shaped abstractions? 🔗 <link>

#Bitcoin #Web3 #MultiChain #HDWallets #FinTech

## Image prompt (Gemini / Nano Banana)

A clean isometric editorial illustration of two distinct architectural districts separated by a clearly defined boundary line: on one side an orderly grid of numbered EVM blocks, on the other a district of rotating, non-repeating UTXO tiles. A single guarded gateway sits precisely on the seam between them, allowing only a narrow, deliberate passage. Deep navy and teal base for both districts, with a single warm amber accent illuminating the guarded gateway on the boundary. Soft directional lighting, geometric precision, subtle depth, a calm and disciplined engineering mood, generous negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
