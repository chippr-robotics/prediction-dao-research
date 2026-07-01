# Data Model: Intent-Based Signatures (Spec 035)

On-chain and client-side entities introduced by this feature. On-chain proxy state is authoritative; the frontend holds only transient + spec-031 activity state (no backend).

## On-chain: `SignerIntentBase` (shared mixin)

Inherited by `WagerRegistry` and `MembershipManager` (and the future pool template). Generalizes the one-off `OPEN_ACCEPT_TYPEHASH` machinery.

| Member | Type | Notes |
|--------|------|-------|
| `intentAuthorizationState` | `mapping(address ⇒ mapping(bytes32 ⇒ bool))` (ERC-7201 **namespaced**) | Per-signer 2-D replay nonce. `false`=unused, `true`=used/cancelled. Held in the mixin's namespaced storage ⇒ **zero** sequential slots, safe to add as a base to a live proxy (like `EIP712Upgradeable`). |
| `_verifyIntent(structHash, signer, nonce, validAfter, validBefore, sig)` | internal | `ECDSA.recover(_hashTypedDataV4(structHash), sig) == signer`; `validAfter <= block.timestamp <= validBefore`; `intentAuthorizationState[signer][nonce] == false` then set `true`. Reverts on any failure. |
| `invalidateNonce(bytes32 nonce)` | external | Sets `intentAuthorizationState[msg.sender][nonce]=true`; emits `NonceInvalidated` (FR-006). |
| `invalidateNonceWithSig(signer, nonce, validBefore, sig)` | external | Gasless cancel of an unsubmitted intent. |
| `authorizationState(address, bytes32) view` / `DOMAIN_SEPARATOR() view` | external view | Client reads. |

**Invariants:** a nonce is single-use per `(signer)`; nonces are contract-scoped (per-contract EIP-712 domain ⇒ a nonce used on WagerRegistry cannot be replayed on MembershipManager); the recovered `signer` is the sole identity used downstream.

## On-chain: EIP-712 Intent (one struct per action)

Domain: **per-contract** — `EIP712Domain{name, version, chainId, verifyingContract}` (enforces network + contract isolation, FR-005/FR-021). Each action has a typed struct binding exactly what the user approved. Representative shapes:

| Struct | Fields (all signed) |
|--------|---------------------|
| `CreateWagerIntent` | `creator, token, stake, terms/opponent…, paymentNonce (== stakeAuth.nonce), nonce, validAfter, validBefore` |
| `AcceptWagerIntent` | `wagerId, taker, nonce, validAfter, validBefore` |
| `ClaimPayoutIntent` | `wagerId, claimant, nonce, validAfter, validBefore` |
| `ClaimRefundIntent` / `DeclareDrawIntent` / `RevokeDrawIntent` / `CancelOpenIntent` / `DeclineIntent` | `wagerId, actor, nonce, validAfter, validBefore` |
| `PurchaseTierIntent` / `UpgradeTierIntent` / `ExtendMembershipIntent` | `role, tier, acceptedTermsHash, member, paymentNonce (== priceAuth.nonce), nonce, validAfter, validBefore` |
| `RedeemVoucherIntent` | `voucherId, acceptedTermsHash, redeemer, nonce, validAfter, validBefore` |

**Validation:** `validAfter <= block.timestamp <= validBefore`; nonce unused; recovered signer == the intent's actor/creator/taker/claimant field; params/amounts bind to the signed struct (any mismatch reverts). For money-in intents the entrypoint additionally **asserts on-chain** `stakeAuth.value == signed stake/price` and `stakeAuth.nonce == intent.paymentNonce` (so a relayer cannot pair the action with a different EIP-3009 authorization). Open-accept carries **two** signatures — the claim-code proof rebound to `(wagerId, taker=signer)` plus the taker's `AcceptWagerIntent`.

## On-chain: EIP-3009 Payment Authorization (money-in actions)

Not FairWins state — lives in the **stablecoin**. The `…WithAuthorization` entrypoint calls `IERC3009(token).receiveWithAuthorization(from, to=address(this), value, validAfter, validBefore, nonce, v, r, s)`.

| Field | Notes |
|-------|-------|
| `from` | the signer (funds pulled from here; screened as the actor) |
| `to` | MUST be the contract (`address(this)`) — recipient-bound; never `transferWithAuthorization` |
| `value` | stake / price |
| `nonce` | EIP-3009 nonce; MUST equal the action intent's `paymentNonce` (asserted on-chain); single-use in the token's `authorizationState` |
| invalidation | token's `cancelAuthorization` (FR-006) |

**Constraint:** token MUST implement `receiveWithAuthorization` on the active network (native USDC Polygon / Amoy faucet: yes; Mordor USC: no ⇒ money-in intents unavailable there, self-submit only).

## On-chain: Fee-Netting State (payment-carrying contracts)

Appended scalars (**2 sequential slots**: `feeNettingEnabled`+`gasFeeRecipient` pack into one, `maxGasFee` the second) enabling atomic, non-custodial fee recovery (FR-015/FR-016). The per-signer nonce map is namespaced in `SignerIntentBase` and consumes no gap.

| Member | Type | Notes |
|--------|------|-------|
| `feeNettingEnabled` | `bool` | admin toggle per contract/network |
| `gasFeeRecipient` | `address` | **segregated** recipient — never the relayer hot key |
| `maxGasFee` | `uint256` | bounded fee ceiling |

In fee-netted mode the signer signs a **second** `receiveWithAuthorization` (`value = fee ≤ maxGasFee`, `to = address(this)`); after effects the contract transfers the fee to `gasFeeRecipient` atomically. If estimated gas > the bounded fee, the action declines before any funds move.

## Entrypoint pairing (twin invariant)

Every covered action has **two** entrypoints with identical effects and identical checks against the acting identity:

| Existing (self-submit, `msg.sender`) | New (relayed, recovered `signer`) |
|--------------------------------------|-----------------------------------|
| `createWager` / `acceptWager` / `claimPayout` / `claimRefund` / `declareDraw` / `revokeDraw` / `cancelOpen` / `declineWager` | `…WithSig` / `…WithAuthorization` twin |
| `purchaseTier` / `upgradeTier` / `extendMembership` / `redeemVoucher` | `…WithSig` / `…WithAuthorization` twin |

Refactor: extract each body to `_fn(address actor, …)`; the existing function calls `_fn(msg.sender, …)`, the new twin calls `_fn(signer, …)` after `_verifyIntent`. **Every** `_screen`, membership gate, ownership check, and freeze check inside `_fn` uses `actor` (research Track A4 enumerates all sites).

## Client-side: Intent (relay-gateway body)

Matches spec 036 `specs/036-relayer-infrastructure/contracts/frontend-relay-client.md`. Built by `frontend/src/lib/relay/intentClient.js#signIntent`:
`{ intentClass: 'payment'|'signer-attributed', chainId, targetContract, action, params, signature, authorization?, validAfter, validBefore, uniquenessMarker, fundingMode, maxFee? }`.

## Client-side: Stablecoin domain config (per network)

Added to `frontend/src/config/networks.js` `stablecoin`: `{ address, symbol, name, decimals, domainVersion }` where `domainVersion` = `'2'` (native Circle USDC) or `'1'` (bridged USDC.e). Drives the EIP-712 domain for the payment leg; a client-side pre-sign check rejects a wrong-domain token with a specific error → self-submit (FR-020).

## Intent Status (client lifecycle)

`signed → submitted/pending → confirmed | expired | invalidated | rejected/failed` (mirrors spec 036 `data-model.md`). Surfaced via `IntentStatus.jsx` + spec 031 `ActivityEntry` (`type ∈ intent-submitted|intent-confirmed|intent-expired|intent-invalidated|intent-failed`). **Never** shows `confirmed` before on-chain inclusion (FR-018/SC-007). A `signed`-but-unsubmitted intent lives only in transient state with **Invalidate** (FR-006) and **Self-submit** (FR-014) actions.

## State transitions (nonce)

```
unused ──_verifyIntent (relayed) or _fn (self-submit)──▶ used   (single-use; replay reverts)
unused ──invalidateNonce / invalidateNonceWithSig──────▶ used   (FR-006; intent can never execute)
```
Payment-leg nonce follows the same machine inside the stablecoin (`receiveWithAuthorization` / `cancelAuthorization`).
