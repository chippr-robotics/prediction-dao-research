# Social & Image — Sponsored Gas Without a Vendor: A Self-Hosted ERC-7677 Verifying Paymaster

## X (Twitter)

We rejected every vendor paymaster and built our own: a 173-line ERC-4337 v0.6 verifying paymaster with zero-storage validation, an ERC-7677 endpoint on our existing relay gateway, and a KMS-held signer. Worst-case loss = the deposit. Here's the full writeup 🔗 <link>

#ERC4337 #AccountAbstraction #paymaster

## LinkedIn

Our passkey smart accounts had a broken promise: the confirm screen said "sponsored — no network fee," but with no paymaster configured, every UserOperation from a USDC-only account failed with AA21. We had two options — change the copy, or make it true. We made it true, without a third-party paymaster service.

The new post walks through how FairWins ships sponsored gas on infrastructure it already runs:

- A minimal EntryPoint v0.6 verifying paymaster whose validation is signature-only and zero-storage — ERC-7562-safe, portable to any bundler, with the EntryPoint deposit as a hard loss cap.
- An ERC-7677 endpoint (pm_getPaymasterStubData / pm_getPaymasterData) added to the existing relay gateway, reusing its sanctions screening, per-account and global quotas, and killswitch — plus per-op gas and cost ceilings so one expensive op can't drain the pool.
- A Cloud KMS signing key whose derived address must match the on-chain verifyingSigner, enforced by a fail-loud boot check; a compromised signer can grief the deposit but can never withdraw it.
- A never-stranded fallback: any sponsorship failure degrades to self-funded submission with honest fee disclosure — the UI never claims "free" unless it is.

Full architecture and trade-offs (why v0.6, why verifying over ERC-20, why self-hosted): <link>

If you run account abstraction in production — would you self-host the paymaster, or is a vendor the right call at your scale?

#AccountAbstraction #ERC4337 #ERC7677 #web3infrastructure #Ethereum

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style for a fintech-engineering blog banner: a compact, self-contained glass-and-metal toll gate standing on an abstract circuit-board causeway, where a stream of small glowing transaction cubes passes through free of charge while a single mechanical arm below the gate stamps each cube with a tiny luminous seal of approval; behind the gate, a transparent reservoir tank holds a finite pool of warm amber liquid (the gas deposit) with a visible level gauge, slowly metering drops to a relay tower in the background; composition uses strong diagonal flow from lower-left to upper-right with generous negative space at the top for headline overlay; deep navy and teal base palette with a single warm amber accent on the seal stamps and reservoir, soft rim lighting and subtle volumetric glow, precise geometric linework, minimal texture, no text, no logos, no watermarks. Aspect ratio 16:9.
