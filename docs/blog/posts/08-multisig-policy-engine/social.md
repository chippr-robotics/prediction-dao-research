# Social & Image — Enough Signatures Is Not Enough: Adding Real Rules to a Shared Vault

## X (Twitter)

A multisig has one control: enough people approve. Phish two owners and the treasury is gone. We added a guard that enforces spending limits, allowlists, and cooldowns at the moment of execution — no admin key, and no way to lock a vault out of its own money. 🔗 <link> #multisig #web3security

## LinkedIn

A shared multisig has exactly one control: enough owners agree. Once that bar is cleared, it will send any amount, to any destination. Every other safeguard most teams rely on is procedure — and procedures fail quietly when someone approves a plausible-looking proposal between meetings.

Our latest post walks through FairWins' on-chain policy engine for shared vaults — a guard contract that enforces real rules on already-approved transactions, at the moment they execute. In plain terms:

- How a "transaction guard" gives a contract veto power over every spend, and why it's one immutable, shared contract with no admin role and no upgrade key
- The rule set — per-transaction limits, daily limits, recipient allowlists, cooldowns — and why counting token approvals closes an obvious drain-later loophole
- Lockout-proofing: managing the vault and changing its rules skip the spending limits (but still require the group's approval), so a too-strict policy can always be loosened and no vault can brick itself
- Honest trade-offs: a fixed daily window vs. a perfectly rolling one, uninterpreted transactions, conservative accounting, and why two dangerous transaction shapes are refused outright

If you run a shared treasury or build custody tooling, the design decisions here — especially what we chose *not* to make upgradeable — may be useful.

🔗 <link>

Where do you draw the line between on-chain enforcement and operational procedure for treasury controls?

#multisig #DAOtreasury #web3security #custody

## Image prompt (Gemini / Nano Banana)

A clean modern editorial illustration in an isometric style: a large translucent vault chamber rendered as a geometric glass cube containing stacked coin columns, with three abstract key shapes converging on its door — but between the keys and the vault stands a slim luminous gate frame, a lattice of horizontal bars and checkpoints suggesting rules being evaluated, one bar glowing as it blocks a single outgoing coin stream while another stream passes cleanly through. Composition: vault cube slightly right of center, gate frame in the foreground left, thin circuit-like paths connecting them across a minimal grid floor. Color mood: deep navy and dark teal base surfaces with cool cyan edge light, and a single warm amber accent reserved for the blocked stream and the active gate bar, consistent with a fintech-engineering brand. Soft directional lighting from the upper left, subtle depth-of-field haze in the background, matte textures with faint isometric grid lines. No text, no logos, no watermarks. Aspect ratio 16:9.
