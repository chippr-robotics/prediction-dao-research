# Contract: Signer-Attributed Entrypoints (ABI additions)

New external functions added by the in-place UUPS upgrades. Each is a **twin** of an existing function: identical effects and checks, but authorized/attributed to the recovered `signer` instead of `msg.sender`. Existing functions remain as the **self-submit** path (FR-014). No existing signature changes → append-only ABI growth.

Shared type: `struct ERC3009Auth { uint256 value; uint256 validAfter; uint256 validBefore; bytes32 nonce; uint8 v; bytes32 r; bytes32 s }`.

## WagerRegistry (proxy — unchanged address)

```solidity
// No-stake (…WithSig): verify intent, recover signer, run existing logic against signer
function claimPayoutWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;
function claimRefundWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;
function declareDrawWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;
function revokeDrawWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;
function cancelOpenWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;
function declineWagerWithSig(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;
function declareWinnerWithSig(uint256 wagerId, address winner, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;

// Money-in (…WithAuthorization): EIP-3009 pull from signer, then create/accept attributed to signer, atomic.
// CreateArgs carries the signed stake + paymentNonce; the entrypoint asserts stakeAuth.value == stake and stakeAuth.nonce == paymentNonce.
function createWagerWithAuthorization(CreateArgs args, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ERC3009Auth stakeAuth, ERC3009Auth feeAuth) external;
function acceptWagerWithAuthorization(uint256 wagerId, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ERC3009Auth stakeAuth, ERC3009Auth feeAuth) external;
function acceptOpenWagerWithAuthorization(uint256 wagerId, address signer, bytes claimCodeSig, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ERC3009Auth stakeAuth, ERC3009Auth feeAuth) external;
```

## MembershipManager (proxy — unchanged address)

```solidity
function purchaseTierWithAuthorization(bytes32 role, uint8 tier, bytes32 termsHash, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ERC3009Auth priceAuth, ERC3009Auth feeAuth) external;
function upgradeTierWithAuthorization(bytes32 role, uint8 tier, bytes32 termsHash, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ERC3009Auth priceAuth, ERC3009Auth feeAuth) external;
function extendMembershipWithAuthorization(bytes32 role, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes intentSig, ERC3009Auth priceAuth, ERC3009Auth feeAuth) external;
function redeemVoucherWithSig(uint256 voucherId, bytes32 termsHash, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external; // no money leg (USDC paid at mint)
```

## Behavioral contract (all twins)

1. `_verifyIntent(structHash, signer, nonce, validAfter, validBefore, intentSig)` — recover signer, enforce `validAfter <= block.timestamp <= validBefore`, single-use nonce (reverts on replay/not-yet-valid/expired/bad-sig).
2. Screen the **signer** (`_screen(signer)`), membership/tier gate on `signer`, ownership/role check on `signer`, freeze check on `signer` — fail-closed (FR-003/FR-013).
3. Money-in: **assert** `stakeAuth.value == signed stake/price`, `stakeAuth.nonce == intent.paymentNonce`, and `stakeAuth.to == address(this)` (binds the money leg to this exact action — a relayer cannot substitute a different authorization; FR-007/FR-013); then `IERC3009(token).receiveWithAuthorization(signer, address(this), stakeAuth…)` pulls the stake and the action runs attributed to `signer`. All in one transaction (FR-007) — revert unwinds everything (no stranded funds).
4. Fee-netted mode: also consume `feeAuth` (`value ≤ maxGasFee`) and transfer the fee to `gasFeeRecipient` (segregated, not the relayer). If `feeNettingEnabled` is false, `feeAuth` is ignored/empty. Decline before any funds move if estimated gas > bounded fee.
5. Emit the same events as the self-submit twin (subgraph/indexers unaffected).

## Admin (fee-netting config)

```solidity
function setFeeNetting(bool enabled, address gasFeeRecipient, uint256 maxGasFee) external onlyRole(<admin>); // floppy-keystore signed
```
`gasFeeRecipient` MUST NOT be the relayer hot key (spec 036 SC-015).

## ZKWagerPool — future template only (not deployed clones)

```solidity
function proposeOutcomeFor(address signer, …, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external; // signer == creator
function closeJoiningFor(address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;        // signer == creator
function cancelFor(address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;              // signer == creator
function refundFor(address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes sig) external;              // pays signer
```
Added to a new pool master, activated via `ZKWagerPoolFactory.setTemplate(newImpl)` for **future** clones. `join`/`approve`/`claim` are already relayable on existing clones; deployed clones are immutable (surface the per-pool limitation honestly, FR-009/FR-012).
