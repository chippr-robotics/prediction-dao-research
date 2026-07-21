# Social & Image — Three Ways to Break an Escrow

## X (Twitter)

12 lines move money to a wager winner. Slither checks the shape, Manticore proves the sum can't overflow, Medusa hammers 100-tx sequences at escrow solvency. Each catches what the others miss — and Manticore silently ran on nothing until we fixed one import. 🔗 <link>

#SmartContractSecurity #Solidity #Fuzzing

## LinkedIn

A payout function in a peer-to-peer wager protocol has to be right on every axis at once: checks-effects-interactions ordering so a reentrant token can't drain it, an irreversible paid flag so no one claims twice, and arithmetic that sums two stakes without overflowing. No single testing technique gives you confidence across all of that — so FairWins runs three, and this post is a tour of what each one actually catches on the escrow code.

The post covers:

- **Slither** (static analysis, every PR): catches the reentrancy ordering, missing access control, and zero-address gaps that are visible in the shape of the code — but can't tell you whether a payout is arithmetically correct.
- **Manticore** (symbolic execution, weekly): explores paths with symbolic inputs to prove the payout sum can't overflow for any input — plus the story of the OpenZeppelin import bug that left it silently running on nothing.
- **Medusa** (property fuzzing, weekly): throws 100-transaction sequences at the real proxy-deployed stack and re-checks escrow solvency after every call, hunting the emergent bug no single transaction causes.
- **Why the layers overlap on purpose** — and why a green-but-inert security tool is worse than none.

How do you order your verification stack by cost vs. depth? 🔗 <link>

#SmartContractSecurity #Solidity #Fuzzing #SymbolicExecution #Web3Security

## Image prompt (Gemini / Nano Banana)

A clean, modern editorial illustration in isometric style: a single translucent glass vault or escrow box at the center holding two glowing coin-stacks, being examined simultaneously by three distinct abstract instruments arriving from three sides — a fast-scanning grid of light (static analysis) sweeping the surface, a branching tree of luminous forked paths (symbolic execution) wrapping around one face, and a dense swarm of small directional arrows or particles (fuzzing) probing from below. Each instrument rendered in a visually separable treatment so the "three layers" read instantly. Deep navy and teal base palette with a single warm amber accent used only on the coins and the point where each tool touches the vault. Soft volumetric lighting, subtle depth of field, precise geometric linework, fintech-engineering mood, high detail, no text, no logos, no watermarks. Aspect ratio 16:9.
