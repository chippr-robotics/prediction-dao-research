# Social & Image — Enough Signatures Is Not Enough: An On-Chain Policy Engine for Safe Multisigs

## X (Twitter)

Your multisig has one control: k-of-n signatures. Phish two owners and the treasury is gone. We built a Safe transaction guard enforcing spending limits, allowlists + cooldowns at execution — no admin key, no way to brick a vault. 🔗 <link> #Safe #multisig #web3security

## LinkedIn

A threshold multisig has exactly one control: k of n owners agree. Once that bar is cleared, the Safe will send any amount, to any destination. Every other safeguard most teams rely on is procedural — and procedures fail quietly when someone approves a plausible-looking proposal between meetings.

Our latest engineering post walks through FairWins' on-chain multisig policy engine: a singleton Safe v1.4.1 transaction guard that enforces rules on approved transactions at execution time. It covers:

- How Safe's guard interface (checkTransaction / checkAfterExecution) gives a contract veto power over every execution, and why the engine is one immutable singleton per chain with no admin role and no upgrade key
- The v1 rule set — per-transaction limits, 24-hour window limits, recipient allowlists, cooldowns — and why counting ERC-20 approve() closes the approve-then-pull bypass
- Lockout-proofing: vault self-management and policy configuration bypass fund rules (but still require the threshold), so a too-strict policy can always be loosened and no vault can brick itself
- Honest trade-offs: fixed-reset windows vs. rolling, unvalued calldata, conservative pre-execution accounting, and why delegatecall and gas refunds are hard-denied

If you run a DAO treasury or build custody tooling, the design decisions here — especially what we chose *not* to make upgradeable — may be useful.

🔗 <link>

Where do you draw the line between on-chain enforcement and operational procedure for treasury controls?

#Safe #multisig #DAOtreasury #smartcontracts #web3security

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a large translucent vault chamber rendered as a geometric glass cube containing stacked coin columns, with three abstract key shapes converging on its door — but between the keys and the vault stands a slim luminous gate frame, a lattice of horizontal bars and checkpoints suggesting rules being evaluated, one bar glowing as it blocks a single outgoing coin stream while another stream passes cleanly through. Composition: vault cube slightly right of center, gate frame in the foreground left, thin circuit-like paths connecting them across a minimal grid floor. Color mood: deep navy and dark teal base surfaces with cool cyan edge light, and a single warm amber accent reserved for the blocked stream and the active gate bar, consistent with a fintech-engineering brand. Soft directional lighting from the upper left, subtle depth-of-field haze in the background, matte textures with faint isometric grid lines. No text, no logos, no watermarks. Aspect ratio 16:9.
