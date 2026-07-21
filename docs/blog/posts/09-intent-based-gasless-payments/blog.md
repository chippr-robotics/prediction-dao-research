# One Signature, Zero Gas: Intent-Based Payments with EIP-712 and EIP-3009

*How FairWins turned every user action into a signed intent — and the byte-identical struct discipline that keeps three codebases honest*

---

| | |
|---|---|
| **Series** | Gasless Rails (part 1 of 2) |
| **Part** | 9 of 34 |
| **Audience** | dApp developers, meta-transaction and relayer engineers |
| **Tags** | `eip712`, `eip3009`, `meta-transactions`, `gasless`, `intents` |
| **Reading time** | ~8 minutes |

---

## The Stranded User

A user wins a wager on FairWins. Fifty USDC sits in escrow with their address recorded as the winner. All they have to do is call `claimPayout`. One problem: their wallet holds exactly zero POL. They funded it with USDC from an exchange, they've never touched Polygon's native token, and they have no intention of learning what a gas station is. Their money is on-chain, provably theirs, and unreachable.

The pre-intent flow was worse than one stranded action — it was two transactions per money-in action. Creating a wager meant an ERC-20 `approve()` followed by the create call. Accepting one meant the same dance. Every step required native gas, and the spec for this feature (`specs/035-intent-based-payments/spec.md`) named the failure mode plainly: a user who holds only the platform stablecoin is stranded — they cannot act at all.

The worst version of this is asymmetric: a user who scraped together gas to *stake* but can't afford gas to *claim*. Money in, no money out. Any gasless design that fixes deposits but not withdrawals has built a lobster trap.

Spec 035's answer is to make the entire platform operate on **signed intents**. The user signs a structured message off-chain — free — describing exactly what they want. Anyone can carry that message on-chain, but the on-chain effect is always attributed to the *signer*, never the submitter. One signature replaces approve-plus-act, and a relayer's gas wallet pays the transaction fee.

## Anatomy of an Intent

An intent is an [EIP-712](https://eips.ethereum.org/EIPS/eip-712) typed struct. Every action on the platform has one — `CreateWagerIntent`, `AcceptWagerIntent`, `ClaimPayoutIntent`, `DeclareDrawIntent`, `PurchaseTierIntent`, and so on. Each struct binds three things:

1. **The acting address** — a named field (`creator`, `taker`, `claimant`, `member`) that must equal the recovered signer.
2. **Every action parameter** — stake amounts, deadlines, the wager ID, the metadata hash. Nothing is left for the submitter to fill in.
3. **A replay guard and validity window** — a random 32-byte `nonce`, plus `validAfter` / `validBefore` timestamps.

Here is the accept-wager struct as the contract declares it in `contracts/wagers/WagerRegistryIntents.sol`:

```solidity
bytes32 private constant ACCEPT_WAGER_INTENT_TYPEHASH = keccak256(
    "AcceptWagerIntent(uint256 wagerId,address taker,bytes32 paymentNonce,"
    "bytes32 nonce,uint256 validAfter,uint256 validBefore)"
);
```

Signatures are verified under a **per-contract domain**: `("FairWins WagerRegistry", "1", chainId, proxyAddress)` for wager actions, `("FairWins MembershipManager", "1", ...)` for membership actions. Chain ID and verifying contract in the domain mean a signature is valid on exactly one contract on exactly one network — a nonce consumed on one contract can never be replayed on another.

The verification machinery lives in one shared mixin, `contracts/upgradeable/SignerIntentBase.sol`. Its `_verifyIntent` checks the validity window, recovers the signer (ECDSA first, then an [ERC-1271](https://eips.ethereum.org/EIPS/eip-1271) `isValidSignature` staticcall so contract accounts — including FairWins' passkey smart wallets — can sign intents too), and burns the nonce before the action body runs any external interaction. A failed intent never consumes its nonce; a succeeded one can never run twice.

One detail worth stealing: the nonce map lives in [ERC-7201](https://eips.ethereum.org/EIPS/eip-7201)-namespaced storage rather than sequential slots. That made `SignerIntentBase` safe to add to two *already-live* UUPS proxies (`WagerRegistry` and `MembershipManager`) without shifting a single existing storage slot or spending `__gap` reserve.

## The Payment Leg: EIP-3009

Signature-based actions are the easy half. The hard half is money-in actions — the intent says "stake 50 USDC," but the contract still has to actually pull 50 USDC without a prior `approve()`.

This is what [EIP-3009](https://eips.ethereum.org/EIPS/eip-3009) exists for. Circle's USDC implements `receiveWithAuthorization`: the token holder signs an authorization — under the *stablecoin's own* EIP-712 domain, not FairWins' — naming a payee, an amount, a validity window, and a random nonce. The payee contract presents that signature to the token and the transfer executes. No allowance ever exists.

So a money-in intent carries two signatures: the FairWins intent and the USDC authorization. Which raises the attack that defines this design: **what stops a relayer from mixing and matching?** Take Alice's payment authorization, pair it with a different action; take her accept-intent for wager 41, staple on an authorization meant for something else.

The answer is that the two legs are cryptographically stapled. Every money-in intent struct carries a `paymentNonce` field — you can see it in the typehash above — and the contract asserts that the relayer-supplied authorization is exactly the one the signer committed to:

```solidity
function _pullWithAuthorization(
    address token, address from, uint256 expectedValue,
    bytes32 expectedPaymentNonce, ERC3009Auth memory auth
) internal {
    if (auth.value != expectedValue || auth.nonce != expectedPaymentNonce)
        revert PaymentAuthMismatch();
    IERC3009(token).receiveWithAuthorization(
        from, address(this), auth.value,
        auth.validAfter, auth.validBefore, auth.nonce,
        auth.v, auth.r, auth.s
    );
}
```

The token itself enforces the third edge: `receiveWithAuthorization` requires the payee to be the calling contract, so the money can only land in the registry. The net result, stated in `docs/developer-guide/gasless-intents.md`: a relayer can *censor* an intent, but it can never substitute, redirect, or resize a payment. That is the correct trust boundary for optional infrastructure.

## The Twin Invariant

Every gasless entrypoint is a *twin* of an existing self-submit function — `acceptWager` gains `acceptWagerWithAuthorization`, `claimPayout` gains `claimPayoutWithSig` — and both twins run **identical checks and effects against the acting identity**: sanctions screening, membership gating, ownership, account freeze. For self-submit that identity is `msg.sender`; for the intent path it is the recovered signer. The submitter's own entitlements are never consulted. Both facets of the wager registry inherit the same `WagerRegistryCore` action bodies, so the twins cannot drift apart behaviorally: the twin is a thin verification wrapper around the exact same internal function the direct call uses.

(The registry hosts these twins on a second implementation facet reached by delegatecall, because the main implementation sits 116 bytes shy of the EVM's 24 KB code limit — a story that deserves, and gets, its own post.)

## The Three-Way Struct Sync

Here is the lesson most meta-transaction tutorials skip. The EIP-712 struct definitions exist in **three places**:

- the Solidity typehash strings in `contracts/wagers/WagerRegistryIntents.sol` (and `MembershipManager.sol`),
- the frontend signing definitions in `frontend/src/lib/relay/intentTypes.js`,
- the gateway verification definitions in `services/relay-gateway/src/intent/intentTypes.js`.

These must stay **byte-identical**. Not semantically equivalent — byte-identical. EIP-712 hashes the full type string, so `uint256 wagerId` versus `uint wagerId`, a reordered field, or a renamed one produces a different typehash, a different digest, and a signature that recovers to a random address. The failure is silent at build time and absolute at runtime: `InvalidIntentSignature`, every time, for every user.

The discipline FairWins landed on: the deployed contract typehashes are *authoritative*; each JS file declares in its header comment which spec document it mirrors and where deviations from the spec doc were resolved in the contract's favor (the schemas doc elided fields with `…`; the deployed `AcceptWagerIntent` really does carry `paymentNonce`, so both JS files do too). The gateway file goes further and makes itself the single source its own verification, encoding, and tests all derive from — a schema change inside that service is a one-file edit. When later features added intent structs (wager pools, the callsign registry), each new struct shipped simultaneously in all three places with cross-references in comments. It is unglamorous, and it is the difference between a working gasless rail and a support queue.

## Never Stranded

The final rule is architectural humility: the relayer is optional infrastructure, and the design must survive its absence. Every gasless flow keeps a **self-submit fallback** — the original pay-your-own-gas path is never removed, and the frontend hook `frontend/src/lib/relay/useIntentAction.js` enforces it at wiring time: the hook *throws during development* if a call site fails to supply a `selfSubmit` function, so no screen can ship a gasless-only dead end. Relayer unset, unhealthy, rate-limiting, timing out — the hook transparently falls back, and the on-chain result is identical.

The fallback also covers chains where the payment leg simply doesn't exist. Mordor's USC stablecoin lacks EIP-3009; the frontend's `stablecoinDomain()` check throws `PaymentUnsupportedOnChain` *before* the wallet prompt ever opens, and the flow self-submits. And status is honest end to end: the UI never shows `confirmed` before a mined transaction exists — signed, pending, confirmed, expired, and failed are distinct, truthful states.

## Design Decisions

**Random nonces, not sequential.** Nonces are client-generated random 32-byte values, usable out of order — EIP-3009's own scheme, adopted for intents too. Sequential nonces serialize a user's actions and let one stuck intent block everything behind it; random nonces let a user sign three intents and have them land in any order. Cancellation is targeted: `invalidateNonce(nonce)` kills one specific unsubmitted intent, and `invalidateNonceWithSig` makes even *cancellation* gasless.

**Sign everything, trust nothing.** Every parameter the action consumes is inside the signed struct. The alternative — signing a hash of parameters delivered out-of-band — is fewer bytes but gives wallets nothing legible to display. EIP-712 typed data means the wallet shows the user the actual stake, deadline, and counterparty they are authorizing.

**Fee netting is bounded and segregated.** An optional second EIP-3009 authorization lets the platform recover gas costs in USDC, but it is capped on-chain (`FeeExceedsCap`), settles atomically with the action, and pays a segregated `gasFeeRecipient` — never the relayer's hot key. A compromised relayer gains no fee-redirection power.

**Censorship is the accepted residual risk.** A relayer can decline to submit. It cannot forge, alter, or replay. Because self-submit always exists, censorship degrades to inconvenience — the user pays their own gas and proceeds. That trade — accept censorship, eliminate custody — is the entire design in one sentence.

---

> **Note**: FairWins wagers are peer-to-peer agreements based on publicly available information and legitimate forecasting. Gasless submission changes who pays the transaction fee, not who is accountable: every intent is attributed to its signer, who remains fully subject to applicable law and the platform's compliance screening.

## Sources

- `specs/035-intent-based-payments/spec.md` — feature spec, user stories, never-stranded rule
- `specs/035-intent-based-payments/contracts/intent-eip712-schemas.md` — intent struct schemas
- `docs/developer-guide/gasless-intents.md` — architecture overview, twin invariant, rollout
- `contracts/upgradeable/SignerIntentBase.sol` — shared verification mixin, nonce map, fee netting
- `contracts/wagers/WagerRegistryIntents.sol` — the `…WithSig` / `…WithAuthorization` twins
- `frontend/src/lib/relay/intentTypes.js` — frontend struct definitions and domain builders
- `frontend/src/lib/relay/useIntentAction.js` — never-stranded enforcement point
- `services/relay-gateway/src/intent/intentTypes.js` — gateway struct definitions
- [EIP-712: Typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712)
- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
- [ERC-1271: Standard Signature Validation Method for Contracts](https://eips.ethereum.org/EIPS/eip-1271)
- [ERC-7201: Namespaced Storage Layout](https://eips.ethereum.org/EIPS/eip-7201)
