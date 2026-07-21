# Social & Image — Censor, Never Steal: Splitting a Relayer into a Policy Gateway and an Execution Engine

## X (Twitter)

How do you run a funded gas wallet on the open internet safely? Make sure the service that decides is never the service that signs. FairWins splits the gasless server into a bouncer (screening, limits, emergency switch) and an engine (pays and confirms). Worst case: censor, never steal. 🔗 <link> #web3 #gasless #security

## LinkedIn

Gasless transactions sound great until you're the one running the server behind them: a funded wallet, accepting signed instructions from anyone on the internet, paying network fees for strangers.

Part 2 of our Gasless Rails series covers how FairWins made that server safe to run — by splitting it in two. A bouncer decides whether a transaction should exist at all; a separate engine decides how it gets paid for and confirmed. Neither can do the other's job.

The post walks through:

- The seam between the two: the bouncer works out who really signed, screens them, enforces limits and spend caps — then hands the engine only a finished transaction, never the original instruction
- Why the worst case fits in a small table: a full takeover of the hosted system yields the small gas balance plus the ability to refuse service — no user funds, no admin authority
- How one checklist serves two gasless systems — user-signed instructions and sponsored fees for passkey (Face ID) wallets — sharing one emergency switch, one set of limits, one audit trail
- The never-stranded rule: every flow falls back to self-pay with an identical on-chain result, so the emergency switch is cheap enough to actually pull

Read it here: <link>

Where would you draw the line between deciding and executing — and what would a total compromise of your setup actually buy an attacker?

#web3 #gasless #infrastructure #security #fintech

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in isometric style showing two distinct connected machines as a metaphor for policy/engine separation: on the left, an elegant gatehouse or checkpoint structure with a series of translucent filter gates (some open, some closed) through which small glowing envelope shapes queue and pass; on the right, a compact industrial engine block with visible gears and a single key locked inside a small transparent vault, sending signed envelopes up along a rail toward an abstract blockchain lattice in the background. A thin dashed alternate pathway arcs around both machines, showing one envelope bypassing them entirely — the fallback route. Composition: the two machines occupy the lower two-thirds, connected by a single narrow bridge conduit, with generous negative space above. Color mood: deep navy and teal base palette with one warm amber accent reserved for the glowing envelopes and the vaulted key, consistent with a fintech-engineering brand. Soft directional lighting from the upper left with subtle long shadows, crisp vector-like edges, minimal texture. No text, no logos, no watermarks. Aspect ratio 16:9.
