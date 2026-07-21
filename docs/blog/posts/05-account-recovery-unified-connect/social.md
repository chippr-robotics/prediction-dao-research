# Social & Image — Losing Every Passkey Shouldn't Mean Losing the Account

## X (Twitter)

Passkeys killed the seed phrase. So what happens when the phone dies?

Our answer: any linked wallet is a full 1-of-N owner — recovery is one plain `addOwnerPublicKey(x, y)` tx to the smart account. No bundler, no relayer, no us.

🔗 <link>

#passkeys #AccountAbstraction #selfcustody

## LinkedIn

Recovery is the make-or-break problem for passkey wallets. Seed phrases were brutal, but everyone knew the recovery story. Passkeys deleted the twelve words — and if your credential lived in an unsynced browser profile, platform sync won't save you.

Our latest engineering post covers how FairWins made passkey smart accounts recoverable without reintroducing a seed phrase — and why the contracts needed zero changes:

- One connect surface for passkey, WalletConnect, and browser wallets, with serialized attempts so parallel connects and background session restores can never race into a stuck state
- Root-causing two shipped defects: the Chrome/Brave "reading 'id'" crash (an incomplete local credential record) and Brave silently asserting the first passkey (an unpinned WebAuthn ceremony — fixed with allowCredentials pinning plus an in-app account picker)
- Linking an external wallet as a full 1-of-N controller on the vendored Coinbase Smart Wallet MultiOwnable owner list, sanctions-screened fail-closed, with honest "this wallet gains full control" consent
- Wallet-only recovery: verify isOwnerAddress on-chain, create a fresh passkey, authorize it with one ordinary transaction — reproducible with Foundry's cast even if our service disappears

The hard trade: no guardians, no custodial backstop. An account that never linked a second controller is unrecoverable by design.

Read the full post: <link>

How is your team handling passkey recovery — pre-linked controllers, guardians, or something else?

#AccountAbstraction #passkeys #selfcustody #web3 #walletengineering

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration, abstract-geometric style, for an engineering blog banner about account recovery for passkey wallets. Central metaphor: a large translucent vault-like hexagonal chamber (the smart account) with several distinct keys docked into slots around its rim — one glowing fingerprint-shaped key visibly shattered or fading away, while a second, intact key (an angular hardware-wallet-like shape) turns in its slot and re-lights the chamber, projecting a fresh new fingerprint key into an empty slot. Thin circuit-like connection lines converge from three doorways on the left into a single doorway feeding the chamber, suggesting many entry points unified into one. Composition: chamber slightly right of center, doorways left, generous negative space, strong diagonal flow from left doorways to the re-lit key. Deep navy and teal base palette with a single warm amber accent reserved for the intact key and the newly projected key. Soft ambient lighting with subtle rim glow on geometric edges, faint grid texture in the background, precise vector-like linework, fintech-engineering mood, minimal and confident. No text, no logos, no watermarks. Aspect ratio 16:9.
