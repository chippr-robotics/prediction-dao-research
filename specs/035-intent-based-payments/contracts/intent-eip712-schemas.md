# Contract: EIP-712 Intent Schemas + Replay Nonce

The typed-data contract between the client signer and the on-chain `SignerIntentBase` verifier. Generalizes the existing `OPEN_ACCEPT_TYPEHASH` (`WagerRegistry.sol:45`) into a reusable scheme.

## Domain (per-contract)

```
EIP712Domain { string name; string version; uint256 chainId; address verifyingContract }
```
- WagerRegistry: `name="FairWins WagerRegistry", version="1"` (existing, `WagerRegistry.sol:164`).
- MembershipManager: `name="FairWins MembershipManager", version="1"` (added via `reinitializer(2)` → `__EIP712_init`).
- `chainId` + `verifyingContract` provide network + contract isolation (FR-005/FR-021): a signature is valid only on the network and contract it was signed for; a nonce used on one contract cannot be replayed on another.

## Replay nonce (2-D, EIP-3009 style)

- Storage: `mapping(address signer => mapping(bytes32 nonce => bool used))`, declared in `SignerIntentBase`'s **ERC-7201 namespaced** storage (zero `__gap` cost; safe to add as a base to a live proxy, like `EIP712Upgradeable`).
- `nonce` is a client-generated random 256-bit value (or `keccak` of the intent), **not** a counter — enables out-of-order use and cheap targeted cancel.
- `_verifyIntent` reverts `IntentReplayed` if `used`, else marks `used` before external calls (checks-effects-interactions).
- View: `authorizationState(address signer, bytes32 nonce) → bool`.

## Action structs (each `…Intent`)

Common trailing fields on every struct: `bytes32 nonce; uint256 validAfter; uint256 validBefore;` and an actor address field that MUST equal the recovered signer. **Money-in** intents additionally carry `bytes32 paymentNonce` that MUST equal the EIP-3009 `stakeAuth`/`priceAuth` `nonce` (the entrypoint asserts this on-chain — see the "Payment leg" section and `withsig-entrypoints.md`), stapling the money leg to the action (FR-007/FR-013).

```
CreateWagerIntent   { address creator; address token; uint256 stake; bytes32 termsHash; address opponent; uint256 category; …; bytes32 paymentNonce; bytes32 nonce; uint256 validAfter; uint256 validBefore }
AcceptWagerIntent   { uint256 wagerId; address taker; bytes32 nonce; uint256 validAfter; uint256 validBefore }
ClaimPayoutIntent   { uint256 wagerId; address claimant; bytes32 nonce; uint256 validAfter; uint256 validBefore }
ClaimRefundIntent   { uint256 wagerId; address actor; bytes32 nonce; uint256 validAfter; uint256 validBefore }
DeclareDrawIntent   { uint256 wagerId; address actor; bytes32 nonce; uint256 validAfter; uint256 validBefore }
RevokeDrawIntent    { uint256 wagerId; address actor; bytes32 nonce; uint256 validAfter; uint256 validBefore }
CancelOpenIntent    { uint256 wagerId; address actor; bytes32 nonce; uint256 validAfter; uint256 validBefore }
DeclineIntent       { uint256 wagerId; address actor; bytes32 nonce; uint256 validAfter; uint256 validBefore }
PurchaseTierIntent  { bytes32 role; uint8 tier; bytes32 acceptedTermsHash; address member; bytes32 paymentNonce; bytes32 nonce; uint256 validAfter; uint256 validBefore }
UpgradeTierIntent   { bytes32 role; uint8 tier; bytes32 acceptedTermsHash; address member; bytes32 paymentNonce; bytes32 nonce; uint256 validAfter; uint256 validBefore }
ExtendMembershipIntent { bytes32 role; address member; bytes32 paymentNonce; bytes32 nonce; uint256 validAfter; uint256 validBefore }
RedeemVoucherIntent { uint256 voucherId; bytes32 acceptedTermsHash; address redeemer; bytes32 nonce; uint256 validAfter; uint256 validBefore }
```

## Open-challenge accept (two signatures)

The existing claim-code proof (`OPEN_ACCEPT_TYPEHASH { uint256 wagerId; address taker }`) is **rebound so `taker = signer`** (not `msg.sender`), preserving front-running resistance under a relayer. The taker additionally supplies an `AcceptWagerIntent`. The entrypoint verifies both.

## Payment leg (EIP-3009, token domain — not this contract's)

For money-in intents the client also signs the token's `ReceiveWithAuthorization { from, to, value, validAfter, validBefore, nonce }` with `to = verifyingContract`, `value = signed stake/price`, and `nonce = intent.paymentNonce`. The entrypoint **asserts on-chain** `stakeAuth.value == signed stake/price` and `stakeAuth.nonce == intent.paymentNonce` before pulling, binding the money leg to this exact action (FR-007/FR-013). The token verifies the authorization under **its own** domain (native USDC version `"2"`, bridged `"1"`); this contract only forwards `(v,r,s,…)`. See `withsig-entrypoints.md`.

## Invalidation (FR-006)

- No-stake intents: `invalidateNonce(bytes32)` / `invalidateNonceWithSig(signer, nonce, validBefore, sig)` mark the nonce used.
- Payment intents: the token's `cancelAuthorization(authorizer, nonce, v, r, s)`.
