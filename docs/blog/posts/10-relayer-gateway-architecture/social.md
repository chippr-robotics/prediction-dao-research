# Social & Image — Censor, Never Steal: Splitting a Relayer into a Policy Gateway and an Execution Engine

## X (Twitter)

How do you run a hot gas key in production? Make sure the service that decides is never the service that signs. Our relayer splits policy (screening, quotas, killswitch) from execution (nonces, gas, KMS key) — worst case: censor, never steal. 🔗 <link> #web3 #infrastructure #gasless

## LinkedIn

Gasless transactions sound great until you're the one operating the relayer: a funded key on a server, accepting signed blobs from the open internet, paying gas for strangers.

Part 2 of our Gasless Rails series covers how FairWins made that server safe to run — by splitting it in two. A policy gateway decides whether a transaction should exist; a separate execution engine decides how it gets mined. Neither can do the other's job.

The post walks through:

- The policy/engine seam: the gateway recovers signers, screens them fail-closed against an on-chain sanctions guard, enforces quotas and spend caps — then hands the engine only `{to, data, speed}`, never the intent
- Why the trust budget fits in a table: a full compromise of the hosted stack yields the gas balance plus the ability to refuse service — no user funds, no admin authority
- How the same policy chassis serves two rails: relayed EIP-712 intents and an ERC-7677 verifying-paymaster endpoint for ERC-4337 UserOps, sharing one killswitch, one quota system, one audit stream
- The never-stranded rule: every flow degrades to self-submit with an identical on-chain result, so the kill switch is cheap enough to actually pull

Read it here: <link>

If you operate relayers or paymasters: where do you draw the line between policy and execution — and what does a total compromise of your stack actually buy an attacker?

#web3 #ethereum #infrastructure #accountabstraction #relayer

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in isometric style showing two distinct connected machines as a metaphor for policy/engine separation: on the left, an elegant gatehouse or checkpoint structure with a series of translucent filter gates (some open, some closed) through which small glowing envelope shapes queue and pass; on the right, a compact industrial engine block with visible gears and a single key locked inside a small transparent vault, sending signed envelopes up along a rail toward an abstract blockchain lattice in the background. A thin dashed alternate pathway arcs around both machines, showing one envelope bypassing them entirely — the fallback route. Composition: the two machines occupy the lower two-thirds, connected by a single narrow bridge conduit, with generous negative space above. Color mood: deep navy and teal base palette with one warm amber accent reserved for the glowing envelopes and the vaulted key, consistent with a fintech-engineering brand. Soft directional lighting from the upper left with subtle long shadows, crisp vector-like edges, minimal texture. No text, no logos, no watermarks. Aspect ratio 16:9.
