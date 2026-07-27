# Social & Image — Rules Your Vault Actually Enforces: Protect Goes Multi-Chain

## X (Twitter)

Protect just grew up. 🛡️ Shared vaults across ETC, Mordor, Polygon, Base, Optimism and Arbitrum — in one list — with spending rules the chain enforces. "Alice and Bob together, or Charlie alone, up to 10k." Per-token daily limits. An approved-contract list. No admin, no upgrade key. 🔗 <link> #multisig #selfcustody #DeFi #web3

## LinkedIn

**A shared vault used to offer one control: enough owners approve, and anything goes through.** Any amount, to anyone, at any time. Fine for two people who talk daily — not how a trading desk runs a treasury or how a family shares savings.

**Protect** now enforces real policy, on-chain, across six networks.

Rules are a numbered list you order yourself. Rule 001 is checked before 002, and each one answers four questions in plain language: **who must approve**, **what can move**, **how much**, and **where it can go**. Combine them and the arrangements people actually asked for fall out:

- **"Alice and Bob together, or Charlie alone, up to 10,000 USDC."** Two rules. When only Charlie signs, the rule immediately below — covering exactly the same ground — takes over. Nothing else falls through: an over-limit transaction is refused by the rule that governs it, never quietly passed to one that would allow it.
- **"Either of us up to 1,000, both of us up to 25,000."** Amount bands.
- **"At most 500 USDC per transaction, 2,000 a day."** Token-scoped, so your USDC limits say nothing about anything else.
- **"Only Uniswap and this lending market."** Approving a contract never exempts it from your amount limits.

Three design decisions worth naming, because they are the difference between a rule and a suggestion:

- **The engine has no owner, no admin and no upgrade switch.** Nobody at FairWins can change your policy, pause it, or move your funds. An upgrade key over a policy engine would be a way around every rule you set — so there isn't one. New rule types arrive as a new engine your owners *choose* to adopt, never as a silent change to the one already guarding your funds.
- **Silence is denial.** Once a vault has rules, anything no rule covers is refused. Rules list what is allowed, not exceptions — and the composer warns you when a policy would refuse everything.
- **We stop rather than guess.** If an owner is removed while a rule still requires their approval, that rule is marked broken and transactions it governs cannot execute until you amend it. We won't treat "the remaining owners" as consent from someone who has left.

Also fixed: your vaults now appear together across every network with the chain on each row, and loading a vault by address **searches every supported network** — you no longer have to know which chain it is on, or find out by switching networks until one sticks. A network we couldn't reach says so, because "not found" and "couldn't look" are different answers.

Read the announcement: <link>

If you share control of funds with anyone — what rule would you want the chain to enforce that your current setup only enforces by trust?

#multisig #selfcustody #treasury #DeFi #Safe #governance #fintech #web3

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a translucent vault plate of brushed deep-navy glass floating in soft space, its face bearing a slim engraved shield. Rising vertically above it, three distinct luminous horizontal bars stacked like a checklist, each numbered by a small glowing tally of dots (one, two, three) — the topmost bar brightest and fully lit, the ones below progressively dimmer, visualizing rules evaluated in order until one decides. Two stylized key-shaped tokens of warm amber hover together above the first bar and touch it simultaneously, while a single distinct teal key hovers beside the second bar alone — showing two different paths to the same approval. Faint hexagonal network plates recede into the background at varied depths, each showing the same shield mark, conveying one vault policy across many chains. Deep navy and teal base palette with a single warm amber accent on the paired keys and the lit rule, soft volumetric lighting from the upper left, generous negative space, precise geometric shapes with slight depth and soft shadows, trustworthy fintech brand mood, no text, no numerals, no logos, no watermarks. Aspect ratio 16:9.
