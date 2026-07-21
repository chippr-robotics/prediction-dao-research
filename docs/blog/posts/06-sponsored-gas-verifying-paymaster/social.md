# Social & Image — Sponsored Gas Without a Vendor: How "No Network Fee" Became True

## X (Twitter)

Our confirm screen said "no network fee" before that was actually true. Two options: change the words, or make them true. We made them true — quietly covering the fee ourselves, no third-party service, worst-case loss capped at the deposit. Here's how 🔗 <link> #gasless #wallets #web3

## LinkedIn

Our passkey wallets had a broken promise: the confirm screen said "sponsored — no network fee," but with nothing set up to cover it, a member holding only USDC couldn't pay the fee, and the transfer failed. We had two options — change the words, or make them true. We made them true, without any third-party sponsorship service.

The new post walks through how FairWins ships sponsored gas on infrastructure it already runs:

- A deliberately tiny paymaster contract: it just checks an approval "stamp" and covers the fee, keeps no memory of past transactions, and caps worst-case loss at its own deposit
- An approval service added to the gateway FairWins already ran, reusing its sanctions screening, per-account and platform-wide quotas, and kill switch — plus new size and cost ceilings so one expensive transaction can't drain the pool
- A securely managed signing key whose identity must match what the contract expects, enforced by a fail-loud startup check; a stolen key can waste the deposit but can never withdraw it
- A never-stranded fallback: any sponsorship failure quietly degrades to member-paid fees, with honest disclosure — the screen never says "free" unless it is

Full architecture and trade-offs (why sponsor rather than charge in stablecoin, why self-host): <link>

If you run gasless flows in production — would you self-host the sponsorship, or is a vendor the right call at your scale?

#gasless #wallets #selfcustody #web3 #fintech

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style for a fintech-engineering blog banner: a compact, self-contained glass-and-metal toll gate standing on an abstract circuit-board causeway, where a stream of small glowing transaction cubes passes through free of charge while a single mechanical arm below the gate stamps each cube with a tiny luminous seal of approval; behind the gate, a transparent reservoir tank holds a finite pool of warm amber liquid (the gas deposit) with a visible level gauge, slowly metering drops to a relay tower in the background; composition uses strong diagonal flow from lower-left to upper-right with generous negative space at the top for headline overlay; deep navy and teal base palette with a single warm amber accent on the seal stamps and reservoir, soft rim lighting and subtle volumetric glow, precise geometric linework, minimal texture, no text, no logos, no watermarks. Aspect ratio 16:9.
