# Social & Image — One Argument Decides Who Gets the Money Back

## X (Twitter)

When a cross-chain deposit goes unfilled, the bridge refunds it to whatever address the deposit named as its depositor. Name your own router and every failed transfer strands inside it. FairWins names the member — so the failure path fixes itself, and the contract needs no rescue button. 🔗 <link>

#Ethereum #DeFi #SmartContracts

## LinkedIn

The most consequential line in FairWins' new cross-chain bridge is a single argument.

Across, the protocol that settles these transfers, refunds an unfilled deposit on the origin chain — to whatever address the deposit recorded as its "depositor". That's an ordinary parameter, not "whoever sent the transaction". The obvious wrapper implementation names itself, and every successful bridge then behaves identically. Only the *unfilled* deposit diverges, refunding into a contract with no per-member accounting and no way out. A silent failure, surfacing first in production, on the unhappy path, with real money.

So the router passes the member's own address, and gets something better than a fix: the failure path needs no privileged action at all. No rescue function, no claim-refund function, no operator who can reach into an in-flight transfer. The new engineering post walks through that decision and its counterpart on the liquidity side:

- A fork test asserts the depositor field against the real bridge contract, because the refund itself can't be staged — and it's merge-blocking, since the happy-path test passes either way.
- The liquidity fee is charged on what Uniswap actually consumed, not what the member offered. An earlier version skimmed it up front, charging members on capital that was handed straight back to them unsupplied. Adversarial review reproduced it on a live fork.
- Bridge-pool deposits aren't routed at all: that protocol's deposit call has no recipient parameter, so a fee-taking wrapper would own a position the member could never exit. Direct member call, no fee.
- Both platform fee services ship at 0 bps against a permanent 250 bps ceiling, so there's no fee line on either surface today. The relayer fee and network gas are real costs, disclosed as their own lines and never described as free.

Full write-up: 🔗 <link>

Where else does "we don't need that capability, so we didn't build it" beat adding a safety net?

#Ethereum #DeFi #SmartContracts #Fintech #Security

## Image prompt (Gemini / Nano Banana)

Clean modern isometric editorial illustration: two elevated hexagonal platforms separated by open space, connected by a taut arc of small geometric tokens travelling left to right. Midway along the arc sits a small, fully transparent glass module that the stream passes straight through without collecting inside it — visibly empty, nothing resting in its interior. From that midpoint a single fine return filament curves back and terminates precisely at a small figure-marker standing on the origin platform, deliberately *not* at the glass module. On the right platform, a shallow circular basin of layered tokens suggests a shared pool. Deep navy background with teal gradients and a fine engineering grid; one warm amber accent lights only the return filament, making the path home the brightest element in the frame. Soft precise studio lighting, crisp edges, minimalist fintech-engineering aesthetic, generous negative space. No text, no logos, no watermarks. Aspect ratio 16:9.
