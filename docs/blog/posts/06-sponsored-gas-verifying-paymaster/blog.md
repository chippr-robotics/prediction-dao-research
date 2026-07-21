# Sponsored Gas Without a Vendor: A Self-Hosted ERC-7677 Verifying Paymaster

*How FairWins made "no network fee" true — with a 173-line contract, a KMS key, and the relay gateway it already ran*

- **Series:** Accounts & Keys, part 3
- **Part:** 6 of 34
- **Audience:** Account-abstraction and infrastructure developers
- **Tags:** `paymaster`, `erc7677`, `erc4337`, `gasless`, `bundler`, `kms`
- **Reading time:** ~9 minutes

---

## The lie in the confirm screen

A member creates a FairWins passkey account, receives 40 USDC from a friend, and tries to send 10 of it onward. The confirm screen says "Gasless · sponsored — no network fee." They tap confirm with their fingerprint. The transfer fails.

Under the hood, the EntryPoint rejected the UserOperation with `AA21 — Smart Account does not have sufficient funds`. The account held USDC and zero POL. With no paymaster configured, every ERC-4337 UserOperation must prefund its own gas from the account's native balance — and a stablecoin-only account has none. Worse, on the account's very first action the prefund also covers on-chain deployment, so during a gas spike even an account holding *some* native token could fail.

The product had promised sponsorship before the infrastructure existed. That violated one of FairWins' standing principles — the UI must never claim a state that isn't true — and there were two ways to fix it: change the copy, or make the claim true. Spec 050 chose the second, with a constraint the product owner set explicitly: no third-party paymaster service. No Pimlico, no Circle. FairWins already ran its own ERC-4337 bundler (pimlico's alto, self-hosted on Cloud Run) and its own relay gateway for gasless intents. Sponsorship had to be built from those parts.

This post walks through what that took: a deliberately minimal verifying paymaster contract on EntryPoint v0.6, an ERC-7677 endpoint bolted onto the existing policy gateway, a KMS-held signing key, and — because the platform's never-stranded rule is non-negotiable — a fallback that keeps every user able to act even when sponsorship is down.

## What a verifying paymaster actually is

ERC-4337 lets a UserOperation name a paymaster: a contract that tells the EntryPoint "I'll pay for this one." The EntryPoint deducts the actual gas cost from the paymaster's deposit and reimburses the bundler's beneficiary. The whole design question is *how the paymaster decides which ops to pay for*.

A *verifying* paymaster answers with a signature. An off-chain service inspects each operation, and if it approves, signs a digest binding that exact op. The contract's only job is to recover the signer:

```solidity
function validatePaymasterUserOp(UserOperation calldata userOp, bytes32, uint256)
    external view override onlyEntryPoint
    returns (bytes memory context, uint256 validationData)
{
    (uint48 validUntil, uint48 validAfter, bytes calldata signature) =
        _parsePaymasterAndData(userOp.paymasterAndData);

    bytes32 digest = MessageHashUtils.toEthSignedMessageHash(
        getHash(userOp, validUntil, validAfter));
    (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
    bool sigFailed = err != ECDSA.RecoverError.NoError || recovered != verifyingSigner;

    // context "" => EntryPoint skips postOp (pure sponsoring, no settlement).
    return ("", _packValidationData(sigFailed, validUntil, validAfter));
}
```

That is the heart of `contracts/account/FairWinsVerifyingPaymaster.sol` — 173 lines including the interface it vendors. The digest from `getHash` commits to the op's sender, nonce, `initCode`, `callData`, all five gas fields, the chain id, the paymaster's own address, and a validity window. An approval therefore cannot be replayed on a different op, a different chain, a different paymaster, or after its TTL. Notably absent: any `senderNonce` mapping. Replay of the *same* op is already impossible — the account's own EntryPoint nonce makes each UserOperation single-use — so the paymaster's validation touches no storage at all. Zero-storage, external-call-free validation is the safest posture under ERC-7562's validation rules, which means the contract stays portable to any public bundler later, even though FairWins' own bundler doesn't enforce them.

The approval travels in `paymasterAndData` with the v0.6 layout: `[paymaster (20)] [validUntil (6)] [validAfter (6)] [signature (65)]` — 97 bytes.

The economics are equally simple. The contract holds a deposit at the EntryPoint (`deposit()` is permissionless; `withdrawTo` is owner-only), and that deposit *is* the sponsorship pool and the hard loss cap. Polygon mainnet runs at `0xe14554D14eB5DeC47f7824ebeeDa6C9f3A50d105` against the canonical v0.6 EntryPoint (`0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789`), recorded in `deployments/`. When the EntryPoint executes a sponsored op, it draws the gas cost from that deposit and reimburses the alto bundler's executor — FairWins pays FairWins's bundler back, per-op, with on-chain accounting.

## The decision half: ERC-7677 on the existing gateway

The signature has to come from somewhere, and *where* is the real policy decision. ERC-7677 standardizes how a wallet client asks a paymaster service for sponsorship: two JSON-RPC methods, `pm_getPaymasterStubData` (a dummy-signature stub so gas estimation sizes `verificationGasLimit` correctly) and `pm_getPaymasterData` (the real, signed approval). Because the frontend already builds UserOps with viem, adopting the standard meant the client work was nearly free — `createPaymasterClient` pointed at the endpoint, unmodified.

Rather than stand up a paymaster microservice, spec 050 added `POST /v1/paymaster` to the relay gateway that already fronts FairWins' relayed-intent rail (spec 036). That gateway already had the three controls sponsorship needs, and the paymaster route composes the *same modules* rather than reimplementing them (`services/relay-gateway/src/paymaster/policy.js`):

1. **Killswitch** — one env flag halts all sponsorship within a single request cycle; clients fall back to self-submit.
2. **Sanctions screening** — keyed off the smart-account address, fail-closed, same screen the intent path uses.
3. **Quotas** — per-account (6 ops/min, 25/day) and global (500/day) rate limits.

Two ceilings are new, because sponsorship spends real money per op: a gas-units sanity cap (3M gas; a deploy-plus-transfer runs under ~2M) and a worst-case cost cap (`totalGas × maxFeePerGas ≤ 2 POL`), so a single deliberately expensive op can't burn a large slice of the deposit. Every refusal happens *before* signing — a refused request costs the operator nothing. Only a granted op reaches step nine of the pipeline: the actual signature.

That signature comes from Google Cloud KMS. The gateway holds no key material; `services/relay-gateway/src/paymaster/sign.js` derives the signer's Ethereum address from the KMS public key at boot, then signs each approval digest via `asymmetricSign`, normalizing the DER output to a low-S 65-byte `{r,s,v}` signature. The contract's `verifyingSigner` is set to that derived address, and the gateway **refuses to boot** if its KMS key doesn't match the on-chain signer — a config drift that would silently break every sponsorship instead fails loudly at deploy time.

One discipline deserves its own paragraph: the digest is computed in two codebases. `FairWinsVerifyingPaymaster.getHash` (Solidity) and `getHash` in `services/relay-gateway/src/paymaster/build.js` (JS) must stay byte-identical — thirteen ABI-encoded fields in exact order — or every sponsored op fails with an opaque `AA34`. A cross-check test deploys the real contract and asserts the two implementations agree, the same struct-sync discipline FairWins already applies to its EIP-712 intent types.

## Never stranded, never dishonest

Sponsorship is best-effort infrastructure, and the platform rule is that optional infrastructure never strands a user. The frontend treats *any* failure to obtain sponsorship — endpoint down, killswitch, quota, sanctions refusal, network error — identically: rebuild the bundler client without a paymaster and retry once, self-funded (`frontend/src/lib/passkey/sendBatch.js`). There's a subtle trap here the code comments call out: an op that reverts in bundler *simulation* (say, a transfer exceeding the account's balance) must be surfaced, not retried — a self-funded retry would revert identically and mask the real error behind a confusing `AA21`. So the fallback classifier lets only genuine sponsorship/transport failures through.

The disclosure follows the same honesty rule that produced this feature in the first place. The account builder returns a `sponsored` boolean — true only when a paymaster is actually wired for this attempt — and the confirm UI renders from it: "Gasless — no network fee" when true, "You pay the POL network fee" when false, including the exact shortfall if the account lacks the native token to self-fund. On networks with no deployed paymaster, the config simply omits the sponsor URL and the path behaves exactly as before, honest copy included. Spec 050's success criteria demand the disclosure match the outcome in 100% of cases; the mechanism makes that structural rather than aspirational.

## Design decisions

**Stay on EntryPoint v0.6.** EntryPoint v0.7 is newer, but the deployed account factory, the Coinbase smart-account implementation, and alto are all v0.6 — and migrating changes every deterministic account *address*, orphaning deployed accounts and any funds sent to their counterfactual addresses. Not worth it for a paymaster. The v0.6 verifying pattern is the most well-trodden path in AA.

**Verifying, not ERC-20.** A fee-in-USDC paymaster was considered and rejected: it needs a price oracle, token-pull-and-refund accounting, and an approval in the first op — more contract surface, more failure modes, for an outcome where the user still pays. Sponsoring is the smallest pattern and the only one that makes "no network fee" literally true.

**Self-hosted, eyes open.** Rejecting vendor paymasters costs real work — KMS plumbing, quota design, runway monitoring — and buys independence: no vendor coupling of bundler to paymaster, no per-op markup, and policy (sanctions, quotas, killswitch) enforced in FairWins' own gateway rather than a third party's dashboard.

**Bounded compromise blast radius.** A stolen `verifyingSigner` key can approve sponsorships — spending the deposit on other people's gas — but *cannot withdraw funds*; withdrawal is owner-only, and the owner key lives on FairWins' air-gapped floppy keystore. Worst-case loss is the deposit, throttled by quotas, cut off by the killswitch, and recovered by rotating the signer via `setVerifyingSigner` (`docs/runbooks/paymaster-operations.md`). Never overfunding the deposit — topping up on a 48-hour runway alert instead — keeps that worst case small by policy, not hope.

**Identity-open eligibility.** Sponsorship isn't gated on membership tier. Any passkey account that passes screening and is within quota qualifies; spend is bounded by the ceilings, the pool, and the killswitch rather than by narrowing who benefits.

## Sources

- `specs/050-sponsored-paymaster/spec.md`, `research.md`, `contracts/gateway-paymaster-api.md`
- `contracts/account/FairWinsVerifyingPaymaster.sol`
- `services/relay-gateway/src/paymaster/build.js`, `sign.js`, `policy.js`
- `services/alto-bundler/README.md`
- `frontend/src/lib/passkey/smartAccount.js`, `frontend/src/lib/passkey/sendBatch.js`
- `docs/runbooks/paymaster-operations.md`
- ERC-4337: Account Abstraction Using Alt Mempool — https://eips.ethereum.org/EIPS/eip-4337
- ERC-7677: Paymaster Web Service Capability — https://eips.ethereum.org/EIPS/eip-7677
- ERC-7562: Account Abstraction Validation Scope Rules — https://eips.ethereum.org/EIPS/eip-7562
