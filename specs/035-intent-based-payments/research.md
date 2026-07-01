# Phase 0 Research: Intent-Based Signatures (Spec 035)

This document resolves the open technical unknowns for spec 035 — bringing gasless, signer-attributed intents to every user-facing money and action flow on FairWins. The work **generalizes and activates two patterns that already ship** — the anonymous pool-join payment authorization (`ZKWagerPool.joinWithAuthorization`, `contracts/pools/ZKWagerPool.sol:147-166`) and the open-challenge typed-signature verifier (`OPEN_ACCEPT_TYPEHASH`, `contracts/wagers/WagerRegistry.sol:45,545-546`) — rather than adopting a new meta-transaction paradigm (spec Assumptions, `spec.md:170-172`). It deliberately does **not** introduce a shared ERC-2771/4337 forwarder that rewrites the effective caller, because nearly every on-chain check authorizes by the direct caller; instead the recovered signer is threaded explicitly and screened, matching the pool-join approach.

The research is organized into four tracks — (A) signer attribution + replay/nonce, (B) EIP-3009 payment-leg generalization + atomic fee-netting, (C) UUPS in-place upgrade + storage-layout path + the immutable-clone pool increment, and (D) frontend intent-signing, honest status, self-submit, and the covered-flow inventory — followed by a consolidated Technical Context resolution.

---

## Track A — Signer attribution + replay/nonce layer

### A1. Signature scheme: a shared inheritable `SignerIntentBase` mixin (not a forwarder, not per-contract copy-paste)

**Decision.** Introduce one reusable abstract contract, `contracts/upgradeable/SignerIntentBase.sol`, inheriting `EIP712Upgradeable`, providing (all logic **plus its own ERC-7201 namespaced storage**, so — exactly like `EIP712Upgradeable` — it contributes **zero sequential slots** and is safe to add as a new base to a live proxy): (1) the replay-nonce storage in a namespaced struct (`mapping(address => mapping(bytes32 => bool)) authState`, see A2); (2) `_useNonce(address signer, bytes32 nonce)` (mark used, revert on reuse); (3) `_verifyIntent(bytes32 structHash, address signer, bytes32 nonce, uint256 validAfter, uint256 validBefore, bytes calldata sig)` which does `_hashTypedDataV4(structHash)`, `ECDSA.recover`, `require(recovered == signer)`, the `validAfter <= block.timestamp <= validBefore` window check, and `_useNonce`; (4) `invalidateNonce(bytes32)` / `cancelNonces(bytes32[])` public entrypoints (FR-006); and (5) `authorizationState(address, bytes32) view` + `DOMAIN_SEPARATOR() view` for clients. Each covered contract inherits the mixin and exposes thin per-action `xxxWithSig(...)` entrypoints that recover the signer via `_verifyIntent`, then call the existing internal logic with `signer` threaded through.

**Rationale.** `WagerRegistry` already carries every primitive the mixin needs — `EIP712Upgradeable` inheritance (`WagerRegistry.sol:6,31`), `_hashTypedDataV4` (`:545`), `ECDSA.recover` (`:34,546`), and `__EIP712_init` in both the fresh-deploy and upgrade paths (`:164,186`). The mixin generalizes the one-off `OPEN_ACCEPT_TYPEHASH` machinery (`:45`) into a reusable base, matching the spec's directive to generalize the existing verifier (`spec.md:170-172`). It reuses the proven "thread the signer explicitly" pattern from `ZKWagerPool.joinWithAuthorization` (`ZKWagerPool.sol:147-166`, `_preJoin(from)` at `:159/168`) that the spec names as the template (FR-009; `spec.md:167`). A single mixin means nonce semantics, invalidation, and domain handling are defined and audited once. Both targets already share `UUPSManaged` (`WagerRegistry.sol:31`, `MembershipManager.sol:19`, base at `UUPSManaged.sol:17`), so a second shared base composes cleanly and preserves the append-only-state-plus-`__gap` discipline (`UUPSManaged.sol:44-46`).

**Alternatives considered.**
- *Shared ERC-2771 / meta-tx forwarder (`_msgSender()` rewrite).* Rejected — explicitly ruled out by the spec (`spec.md:170`). Authorization is done by `msg.sender` in ~20 places (Track A §A4); a forwarder trusts one relayer address to speak for any user, and a mis-set `_trustedForwarder` becomes a platform-wide impersonation bug. Threading the recovered signer keeps "can censor, cannot steal" (FR-013) provable per call.
- *Per-contract bespoke `withSig` with no shared base.* Rejected — duplicates the nonce map, invalidation, and domain logic across `WagerRegistry` and `MembershipManager` and any future adopter; the one-off `OPEN_ACCEPT_TYPEHASH` block is already the "don't repeat this" smell.

**Per-action signer-attributed entrypoints.** Each new entrypoint recovers the signer, verifies + consumes the nonce, then calls the *existing* internal function with `signer` substituted for `msg.sender`; money-in actions additionally carry an EIP-3009 `receiveWithAuthorization` (Track B). Refactor the current bodies to `_fn(address actor, ...)` internals and keep the current external functions as `_fn(msg.sender, ...)` for the self-submit path (FR-014).

*WagerRegistry:*

| Action | Existing entrypoint | New signer-attributed entrypoint |
|---|---|---|
| Create (named) | `createWager` `WagerRegistry.sol:310` | `createWagerWithSig(CreateIntent, nonce, validAfter, validBefore, sig, ERC3009Auth)` |
| Create (terms) | `createWagerWithTerms` `:332` | `createWagerWithTermsWithSig(...)` |
| Create open | `createOpenWager` `:447` | `createOpenWagerWithSig(...)` |
| Accept (named) | `acceptWager` `:582` | `acceptWagerWithSig(wagerId, signer, nonce, validAfter, validBefore, sig, ERC3009Auth)` |
| Accept open | `acceptOpenWager` `:532` | `acceptOpenWagerWithSig(wagerId, signer, claimCodeSig, nonce, validAfter, validBefore, intentSig, ERC3009Auth)` — two sigs |
| Cancel open | `cancelOpen` `:594` | `cancelOpenWithSig(wagerId, signer, nonce, validAfter, validBefore, sig)` |
| Decline | `declineWager` `:611` | `declineWagerWithSig(...)` |
| Declare winner | `declareWinner` `:630` | `declareWinnerWithSig(wagerId, winner, signer, nonce, validAfter, validBefore, sig)` |
| Draw propose/approve | `declareDraw` `:667` | `declareDrawWithSig(...)` |
| Draw revoke | `revokeDraw` `:703` | `revokeDrawWithSig(...)` |
| Claim payout | `claimPayout` `:789` | `claimPayoutWithSig(wagerId, signer, nonce, validAfter, validBefore, sig)` |
| Refund | `claimRefund` `:811` | `claimRefundWithSig(wagerId, signer, nonce, validAfter, validBefore, sig)` |

> **Open-accept nuance.** Today `acceptOpenWager` binds `taker = msg.sender` inside the claim-code signature (`WagerRegistry.sol:545`, `OPEN_ACCEPT_TYPEHASH` at `:45`). Under a relayer `msg.sender` is the relayer, so the claim-code proof must instead cover `(wagerId, signer)` where `signer` is the taker, and the taker also supplies a separate `AcceptOpen` intent (nonce + validity window + payment). The relayed open-accept therefore carries two signatures — the claim-code proof over `(wagerId, taker=signer)` and the taker's own intent — preserving the `taker` binding that provides front-running resistance (`WagerRegistry.sol:43-45`) by binding to `signer` rather than `msg.sender`.

*MembershipManager* (adds `EIP712Upgradeable` + mixin via `reinitializer(2)` — the contract has no reinitializer today, see A5/C1):

| Action | Existing entrypoint | New signer-attributed entrypoint |
|---|---|---|
| Purchase | `purchaseTier` `MembershipManager.sol:192` / `purchaseTierWithTerms` `:198` | `purchaseTierWithSig(role, tier, acceptedTermsHash, signer, nonce, validAfter, validBefore, sig, ERC3009Auth)` |
| Upgrade | `upgradeTier` `:225` / `upgradeTierWithTerms` `:231` | `upgradeTierWithSig(...)` |
| Extend | `extendMembership` `:254` | `extendMembershipWithSig(role, signer, nonce, validAfter, validBefore, sig, ERC3009Auth)` |
| Voucher redeem | `redeemVoucher` `:278` | `redeemVoucherWithSig(voucherId, acceptedTermsHash, signer, nonce, validAfter, validBefore, sig)` (no money leg — USDC paid at mint, `:274`) |

Pool `join` already has `joinWithAuthorization` (`ZKWagerPool.sol:147`) — FR-009 is "activate the dormant path," no contract change for deployed clones.

### A2. Nonce / replay design: 2-D random nonce (EIP-3009 style)

**Decision.** Use a **2-D random nonce** keyed by signer, held in the mixin's **ERC-7201 namespaced** storage: `mapping(address => mapping(bytes32 => bool)) authState` (`false` = unused, `true` = used/cancelled), with `authorizationState(address signer, bytes32 nonce) external view returns (bool used)`. `_verifyIntent` reverts if `authState[signer][nonce]`, else sets it to `true`. Invalidation (FR-006) is the same write from a public entrypoint: `invalidateNonce(bytes32 nonce)` sets `authState[msg.sender][nonce] = true` and emits `NonceInvalidated`; an optional `invalidateNonceWithSig(address signer, bytes32 nonce, uint256 validBefore, bytes sig)` lets a gasless user cancel gaslessly. The nonce is a client-generated random 256-bit value (or a packed `keccak` of the intent), never a counter.

**Rationale.**
- *Out-of-order execution.* A user may sign several intents (create a wager, then claim on a different wager) and a relayer may land them in any order or drop some. A sequential nonce forces strict ordering, so one stuck/dropped intent wedges every later one — unacceptable when the relayer is untrusted and may censor (FR-013). A random 2-D nonce lets any subset execute in any order.
- *Cheap, targeted cancel.* FR-006 requires invalidating *a specific* signed-but-unsubmitted intent. With random nonces, cancel = one SSTORE on that exact nonce; a sequential counter would force bumping past the target and invalidate later intents the user still wants.
- *Matches the primitive already in the codebase.* The money leg uses EIP-3009 `receiveWithAuthorization`, whose `nonce` is exactly this random 2-D scheme (`ZKWagerPool.sol:147-164`, `IERC3009` at `:20-32`, "replay-protected by the token" comment at `:161`). Using the same shape for the action layer keeps the mental model and client code uniform, and lets a money-in action reuse the same nonce value across both legs if desired. The spec explicitly calls for a "new per-signer single-use/validity mechanism" for non-payment intents (`spec.md:172`; FR-004).

**Alternatives considered.**
- *Per-signer sequential nonce* (à la `Permit`/`Nonces.sol`). Rejected for the ordering/cancel reasons above; strict ordering is hostile to an untrusted, possibly-censoring relayer.
- *Hash-of-intent as the single-use key* (`mapping(bytes32 => bool) usedIntent`). Viable and simpler to bind, but not keyed by signer, so it gives no cheap per-user namespace to pre-cancel and grows unbounded with no natural client-side nonce for status tracking. Prefer the 2-D map so `authorizationState(signer, nonce)` is a clean status oracle for the honest-status UI (FR-018). (If chosen, invalidation would require the user to pre-compute and store the intent hash — worse UX.)
- *Bitmap-packed 2-D nonce* (256 flags per slot). A gas optimization over `mapping→mapping→uint256`; adoptable inside the mixin later without changing the external `(signer, nonce)` interface. Noted as a future optimization, not required for correctness.

**Storage note.** The nonce map lives in the mixin's **ERC-7201 namespaced** storage, so it consumes **zero** `__gap` slots — exactly like `EIP712Upgradeable` (`UUPSManaged.sol:45`) — and is safe to introduce as a new base without shifting either proxy's existing sequential layout. The only **sequential** appends are the Track B fee-netting scalars on the payment-carrying contracts: `feeNettingEnabled` (bool) + `gasFeeRecipient` (address) pack into one slot, `maxGasFee` (uint256) is a second — **2 slots**, so `WagerRegistry.sol:96` (`uint256[48] __gap` → `[46]`) and `MembershipManager.sol:49` (`uint256[49] __gap` → `[47]`). Validate with the existing `npm run check:storage-layout` gate (`MembershipManager.sol:47`).

### A3. Binding: what the typed intent commits to

**Decision.** One EIP-712 struct per action; e.g.:

```
CreateWagerIntent(
  address signer, address opponent, address arbitrator, address token,
  uint128 creatorStake, uint128 opponentStake,
  uint64 acceptDeadline, uint64 resolveDeadline, uint8 resolutionType,
  bytes32 polymarketConditionId, bool creatorIsYes,
  bytes32 metadataHash, bytes32 termsVersionHash,
  bytes32 paymentNonce,   // MUST equal the EIP-3009 stakeAuth.nonce — staples the money leg (FR-007)
  bytes32 nonce,          // 2-D replay nonce (A2)
  uint256 validAfter,     // earliest execution (FR-004)
  uint256 validBefore     // latest execution / expiry (FR-004)
)
```

Binding is layered:

| Bound property | How | Requirement |
|---|---|---|
| Network / chainId | `chainId` field of the EIP-712 domain separator (built by `EIP712Upgradeable`, `WagerRegistry.sol:6`), enforced by `_hashTypedDataV4` (`:545`). A chain-A signature fails `recover == signer` on chain B. | FR-005, FR-021 |
| Target contract | `verifyingContract = address(this)` in the domain separator (automatic). A `WagerRegistry` intent cannot verify against `MembershipManager`. | FR-005 |
| Action / selector | The per-action typehash is the discriminator (the struct type string is hashed into `structHash`). `CreateWagerIntent` ≠ `ClaimPayoutIntent`; no separate `bytes4` selector field needed. | FR-005, `spec.md:97` |
| Params / amount / counterparty / target item | Every consequential arg is a struct field (`opponent`, stakes, `token`, `wagerId`, `voucherId`, `role`, `tier`, deadlines). Any relayer deviation breaks `recover`. | FR-005, FR-013 |
| Validity window | `validAfter` + `validBefore` both checked in `_verifyIntent` (`validAfter <= block.timestamp <= validBefore`); the wager deadlines (`_checkDeadlines`, `WagerRegistry.sol:237-242`) still apply on-chain. | FR-004 |
| Single-use | `nonce` via the 2-D map (A2). | FR-004 |
| Atomic money leg | The entrypoint **asserts on-chain** `stakeAuth.nonce == intent.paymentNonce` **and** `stakeAuth.value == intent.creatorStake` (and `stakeAuth.to == address(this)`) before pulling — so a relayer cannot pair the signed action with a different EIP-3009 authorization; the pull and the state change share one transaction. Uses `receiveWithAuthorization` (recipient-bound), not `transferWithAuthorization`. | FR-007, FR-013 |

**Rationale.** Reusing the domain separator for chainId + verifyingContract is the cleanest network- and contract-isolation possible: cryptographically enforced by the same `_hashTypedDataV4` the contract already calls (`WagerRegistry.sol:545`), zero extra fields to get wrong (satisfies FR-021 and the "second network" replay edge, `spec.md:92`). A distinct typehash per action makes the action un-forgeable and un-repurposable without an extra opcode. Stapling the payment nonce into the action intent is what makes FR-007/FR-013 hold: without it, a relayer could pair a user's valid EIP-3009 authorization (which only binds `from,to,value,nonce`) with different action params (a different opponent, worse deadlines).

**Alternatives considered.**
- *Single generic `Intent(bytes32 actionType, bytes params, …)` struct.* Rejected — loses EIP-712's human-readable typed-data display in wallets (users would sign opaque bytes), weakening "sign what you see" (FR-005/US1).
- *Explicit `uint256 chainId` field in the struct.* Redundant with the domain separator and easy to check inconsistently; rely on the domain.
- *`transferWithAuthorization` money leg.* Rejected by spec (front-runnable, independently executable) — must be `receiveWithAuthorization` (`spec.md:167`; matches `ZKWagerPool.sol:162`).

### A4. Threading: every check that must evaluate the SIGNER, not `msg.sender`

The core refactor converts each action body to an internal `_fn(address actor, …)` and passes `actor = recovered signer` from the `withSig` entrypoint (and `actor = msg.sender` from the preserved self-submit entrypoint, FR-014). Every check below currently reads `msg.sender` and MUST read `actor`/`signer` (FR-002, FR-003, FR-022).

*WagerRegistry.sol.*
- **Freeze** (`notFrozen(msg.sender)` modifier `:147-150`) on: `createWager` `:323`, `createWagerWithTerms` `:346`, `createOpenWager` `:459`, `acceptOpenWager` `:536`, `acceptWager` `:582`, `cancelOpen` `:594`, `declineWager` `:611`, `declareWinner` `:630`, `declareDraw` `:667`, `revokeDraw` `:703`, `claimPayout` `:789`, `claimRefund` `:811` → `notFrozen(signer)` (the modifier already takes an explicit `address user`).
- **Sanctions screen** (`_screen(address)` `:211-214`; `isAllowed`/`checkBlocked` take an explicit address, `SanctionsGuard.sol:42,50`): `_createWager` `_screen(msg.sender)` `:366` → `signer`; `createOpenWager` `:461` → `signer`; `_runAcceptGuard` `_screen(msg.sender)` `:267` (taker) → `signer` (the stored `_screen(creator)` at `:266` is already explicit, unchanged).
- **Membership gate** (`checkCanCreate(address user, …)` `MembershipManager.sol:305`, `getActiveTier(address,…)` `:348` — both explicit): `_createWager` `:393` → `signer`; `createOpenWager` `:486` + Silver-floor `getActiveTier` `:487` → `signer`; `_runAcceptGuard` `:267` → `signer`.
- **Ownership / role / counterparty:** `_createWager` self-wager `opponent == msg.sender` `:368` → `signer`; `createOpenWager` `arbitrator == msg.sender` `:477` → `signer`; `acceptOpenWager` claim-code digest `:545`, `msg.sender == w.creator` `:548`, `msg.sender == w.arbitrator` `:549` → `signer` (claim-code sig over `(wagerId, signer)`); `acceptWager` `msg.sender != w.opponent` `:585` → `signer`; `cancelOpen` `:597` → `signer`; `declineWager` `:617` → `signer`; `declareWinner` branches `:639,641,643,645` → `signer`; `declareDraw` `:674` + consent bits `:681,683` → `signer`; `revokeDraw` `:708,710` → `signer`; `claimPayout` `:792` → `signer`.
- **Fund movement / attribution / accounting** (must debit *and* credit the signer): `_settleAccept` `safeTransferFrom(msg.sender,…)` `:273`, `recordCreate(msg.sender,…)` `:274`, `emit WagerAccepted(wagerId, msg.sender)` `:275` → `signer` (the transferFrom becomes the EIP-3009 `receiveWithAuthorization(signer,…)` leg); `_createWager` effects `w.creator = msg.sender` `:398`, `_userWagerIds[msg.sender].add` `:413`, `safeTransferFrom` `:428`, `recordCreate` `:429` → `signer`; `createOpenWager` effects `:494,512,518,519` → `signer`; `acceptOpenWager` effects `w.opponent = msg.sender` `:554`, `_userWagerIds[msg.sender].add` `:557` → `signer`. Note `claimRefund` (`:811`) and `_settleDraw` (`:725`) already pay `w.creator`/`w.opponent` from stored state (comment `:807-810`), so their credit side is already signer-safe — only their `notFrozen(msg.sender)` gate moves to `signer`.

*MembershipManager.sol.*
- `_purchaseTier`: `_screen(msg.sender)` `:204`, `_memberships[msg.sender][role]` `:210`, `safeTransferFrom(msg.sender,…)` `:213`, emit `:222` → `signer`.
- `_upgradeTier`: `_screen` `:237`, `_memberships[msg.sender]` `:238`, `safeTransferFrom` `:246`, emit `:251` → `signer`.
- `extendMembership`: `_screen` `:255`, `_memberships[msg.sender]` `:256`, `safeTransferFrom` `:262`, emit `:269` → `signer`.
- `redeemVoucher`: `ownerOf(voucherId) != msg.sender` `:281`, `_memberships[msg.sender]` `:285`, `_screen` `:288`, emit `:300` → `signer`.
- `_recordTerms`: writes `memberTermsHash[msg.sender][role]` and emits for `msg.sender` `:151-155` → accept and use `signer`.
- **Leave unchanged:** `onlyAuthorized` (`:79-82`) gates `recordCreate`/`recordClose`, where `msg.sender` is the *WagerRegistry contract* — these are contract-to-contract hooks, not user actions; do not thread a signer.

*Cross-cutting.* The money leg's `safeTransferFrom(msg.sender,…)` calls become EIP-3009 `receiveWithAuthorization(signer, address(this), value, …)` (pattern `ZKWagerPool.sol:162`), so the pull is from the signer with token-level replay protection, atomic with the action (FR-007). Fee-netted mode (FR-015/FR-016) is a second pull inside the same tx from `signer`, same atomicity, declined pre-move if the bounded fee is exceeded.

### A5. Domain: reuse the existing EIP-712 stack, per-contract

**Decision.** Use a **per-contract domain**, reusing WagerRegistry's existing stack.
- *WagerRegistry* already initializes `__EIP712_init("FairWins WagerRegistry", "1")` in both `initialize` (`:164`) and the upgrade path `initializeOpenChallenges` (`:186`). Keep this domain; the mixin's nonce map + new typehashes drop in with no domain change, and the existing `OPEN_ACCEPT_TYPEHASH` verify block (`:45,545-546`) becomes the first consumer of the generalized `_verifyIntent`.
- *MembershipManager* does **not** yet inherit `EIP712Upgradeable`. Add `SignerIntentBase` (which brings it) and initialize its own domain `__EIP712_init("FairWins MembershipManager", "1")` in a new `reinitializer(2)` upgrade function (its current reinit level is the `initializer` at `:89`, so the next is level 2; WagerRegistry set its domain in `initialize` and used `reinitializer(2)` for open-challenges at `:185-187`). Storage-safe: both `EIP712Upgradeable` **and** `SignerIntentBase` are ERC-7201-namespaced (no gap cost), so the nonce map consumes **zero** `__gap` slots; only the fee-netting scalars are appended (2 slots, `:49` → `[47]`).

**Rationale.** `EIP712Upgradeable`'s domain separator sets `verifyingContract = address(this)`. Because `WagerRegistry` and `MembershipManager` are distinct proxies at distinct addresses, a per-contract domain gives free cross-contract replay isolation (FR-005): an intent for the registry cannot verify against membership and vice-versa, even with an identically-named struct. A single shared domain would defeat this and require an extra `targetContract` field to compensate. It reuses the already-audited init pattern (`WagerRegistry.sol:164,185-187`), and distinct domain names add human-readable clarity in the wallet prompt.

**Alternatives considered.**
- *One shared domain separator across all contracts* (central `IntentDomain` singleton). Rejected — removes automatic `verifyingContract` isolation, forcing a manual `targetContract` field and a trusted shared component.
- *Bumping domain `version` to "2".* Unnecessary — new intents use new typehashes, so they coexist under version "1" with `OPEN_ACCEPT_TYPEHASH`; keeping version "1" avoids invalidating in-flight open-accept signatures and keeps the two `__EIP712_init` calls (`:164,186`) consistent.

**Net new artifacts (Track A).** `contracts/upgradeable/SignerIntentBase.sol` (mixin, ERC-7201 namespaced nonce storage); `WagerRegistry` upgrade (inherit mixin, add per-action typehashes + `xxxWithSig`, refactor bodies to `_fn(address actor,…)`, append fee scalars only → `__gap` 48→46); `MembershipManager` upgrade (inherit mixin, `reinitializer(2)` domain init, typehashes + `xxxWithSig`, thread `signer`, append fee scalars only → `__gap` 49→47); pool `join` unchanged (activate `joinWithAuthorization`, `ZKWagerPool.sol:147`).

---

## Track B — EIP-3009 payment-leg generalization + atomic fee-netting

### B0. The pattern to generalize

The only working payment-leg intent is `ZKWagerPool.joinWithAuthorization` (`contracts/pools/ZKWagerPool.sol:147-166`); its three load-bearing properties are the template: (1) it takes an explicit **signer** (`from`) threaded everywhere `join` uses `msg.sender` — `_preJoin(from)` screens/gates `:159,168-176`, `_recordMember(from,…)` attributes membership `:160,178-183`; (2) it pulls via `IERC3009(token).receiveWithAuthorization(from, address(this), value, …)`, recipient-bound, never `transferWithAuthorization` (`:162-164`; inline interface `:19-32`); (3) it re-checks the signed amount against on-chain expectation (`if (value != buyIn) revert BadValue()`, `:158`). The token, not the contract, verifies the EIP-712 signature (`MockUSDCPermit.receiveWithAuthorization` at `contracts/mocks/MockUSDCPermit.sol:43-68`, recover+compare `:59-63`, recipient binding `if (to != msg.sender) revert CallerNotPayee()` `:54`, single-use nonce map `:21,57,65`). Generalization = apply these three properties to `WagerRegistry` and `MembershipManager`, whose value pulls today hardcode `msg.sender` (`WagerRegistry.sol:428,273`; `MembershipManager.sol:213`).

### B1. New payment-carrying entrypoints

**Decision.** Add signer-attributed twins of each money-in action, each consuming one (or two, see B2) `receiveWithAuthorization` pull and running the action attributed to `from` in one transaction:

| New entrypoint | Wraps | Signer maps to | Stake pull replaced |
|---|---|---|---|
| `createWagerWithAuthorization(...)` | `_createWager` `WagerRegistry.sol:350-440` | `creator` (`:398`) | `:428` |
| `createOpenWagerWithAuthorization(...)` | `createOpenWager` `:447-527` | `creator` (`:494`) | `:518` |
| `acceptWagerWithAuthorization(...)` | `acceptWager` `:582-592` | `opponent` (checked `:585`) | `_settleAccept` `:273` |
| `acceptOpenWagerWithAuthorization(...)` | `acceptOpenWager` `:529-559` | `opponent`/`taker` (`:554`) | `_settleAccept` `:273` |
| `purchaseTierWithAuthorization(...)` | `_purchaseTier` `MembershipManager.sol:203-223` | member (`:210,222`) | `:213` |

(Upgrade/extend/redeem twins follow the same shape but are secondary; `upgradeTier` delta pull `:246`, `extendMembership` `:262`.) The required internal refactor parameterizes `actor` in the shared helpers — enumerated in Track A §A4 — otherwise attribution leaks to the relayer. Each twin preserves `nonReentrant whenNotPaused` (`WagerRegistry.sol:323`; `ZKWagerPool.sol:157`), effects-before-interactions, and pulls via `IERC3009(token).receiveWithAuthorization(from, address(this), value, validAfter, validBefore, nonce, v, r, s)` exactly as `ZKWagerPool.sol:162-164`. The `notFrozen(msg.sender)` modifier (`:147-150`) on the twins must gate the **signer** (`_frozen[from]`), not the relayer.

**Rationale.**
- *Atomicity (FR-007, `spec.md:112`).* Pull and state change are two operations in one body under one `nonReentrant` guard; any revert rolls back both — a user is never charged without the wager/tier and no stake is stranded.
- *`receiveWithAuthorization`, not `transferWithAuthorization` (`spec.md:167`).* The `to == msg.sender` binding (`MockUSDCPermit.sol:54`) means only the action contract can redeem the authorization, and only while executing the action; `transferWithAuthorization` has no recipient binding, so a third party could pull the stake standalone — the failure FR-007 forbids.
- *Signer attribution (FR-002/FR-003).* Threading `from` makes every ownership/membership/freeze/sanctions check evaluate the signer (`ZKWagerPool.sol:168-176`); the relayer's own status is never consulted.
- *Amount binding (FR-005).* The signed `value` is bound in the token signature and the twin re-asserts it against on-chain state as `ZKWagerPool.sol:158` does with `buyIn`.
- *Open accept keeps its second signature.* `acceptOpenWagerWithAuthorization` verifies BOTH the EIP-3009 stake authorization AND the `OPEN_ACCEPT_TYPEHASH` claim signature bound to the taker (`WagerRegistry.sol:45,543-546`); the taker is `from`, so the claim digest is built over `from`.

**Alternatives considered.**
- *ERC-2771 forwarder / ERC-4337.* Rejected (`spec.md:170`); nearly every check authorizes the direct caller, so a global `_msgSender()` rewrite is riskier than threading `from`; the relayer submits **bare** calls.
- *Reuse `msg.sender`, require the relayer to be the signer.* Defeats the purpose (the signer holds no gas).
- *Single generic `executeIntent(bytes)` dispatcher.* Collapses per-action ABI type safety and complicates the token's per-call amount binding; rejected for explicit twins.

### B2. Atomic fee-netting (FR-015 / FR-016)

**Decision.** Use **two separate authorizations** plus new admin-configured segregated-fee state on each payment-carrying contract. The signer signs two `receiveWithAuthorization` structs with distinct nonces, both `to = address(this)`: (1) a **stake authorization** (`value = stake`/`priceUSDC`), escrowed as today; (2) a **fee authorization** (`value = fee`, the pre-disclosed **bounded** fee). In fee-netted mode the twin, after effects, executes atomically:

```
receiveWithAuthorization(from, address(this), stake, stakeAuth…)   // escrow
receiveWithAuthorization(from, address(this), fee,   feeAuth…)     // pull fee
IERC20(token).safeTransfer(gasFeeRecipient, fee);                  // route to segregated recipient
```

In platform-sponsored mode the fee authorization is absent (or `fee == 0`) and the stake-only path is byte-for-byte the B1 path. New per-contract admin config (mirroring `setTreasury`/`setTokenAllowed` at `MembershipManager.sol:112-116`, `WagerRegistry.sol:278-282`): `address gasFeeRecipient` + setter (segregated recipient), `bool feeNettingEnabled` + setter (per-flow switch, FR-015), `uint256 maxGasFee` (USDC 6-dp cap) + setter. On-chain guards inside the twin: `require(feeNettingEnabled || fee == 0)`; `if (fee > maxGasFee) revert FeeTooHigh()`; route to `gasFeeRecipient` (must be set, `!= 0`), **never** `msg.sender`. The "decline if est. gas > bounded fee before any funds move" gate is the relayer's off-chain precondition (spec 036 gateway); on-chain, FR-007 atomicity is the backstop — a submitted-anyway losing tx is the relayer's loss and any revert moves zero user funds.

**Rationale.**
- *EIP-3009 pulls an exact value — not partial/variable* (`MockUSDCPermit.sol:67`). So "bounded fee" means the user signs an exact `fee = F` equal to the disclosed cap; the relayer keeps `F − actualGasCost` as its volatility buffer and declines off-chain when `estGas > F`, satisfying FR-016 with no refund leg.
- *Two authorizations, not one combined:* the identical stake authorization is portable across sponsored and fee-netted modes; escrow equals exactly the stake authorization's value (no "escrow minus fee" drift, keeping `escrowTotal`/`accruedFees` clean, `ZKWagerPool.sol:211` / `MembershipManager.sol:214`); toggling modes just adds/drops the fee leg.
- *Fee `to` must be `address(this)`, then forward.* `receiveWithAuthorization` requires `to == msg.sender` (`MockUSDCPermit.sol:54`), so the fee is pulled to the contract and `safeTransfer`ed onward in the same tx — keeping the fee out of the relayer entirely (FR-016).
- *Segregated recipient ≠ hot key.* Settling to a dedicated recipient keeps the hot gas key low-value; refilling it from recovered fees is a separate explicit settlement, and the per-chain fee ledger is a read-model derived from on-chain receipts.
- *Note on `MembershipManager.accruedFees` (`:214`):* the netted gas fee must NOT be added to `accruedFees` (that pool is membership-price revenue withdrawn via `withdrawFees` `:182-188`); the gas fee flows separately to `gasFeeRecipient`.

**Alternatives considered.** Single combined `stake+fee` authorization (couples stake to funding mode, forces on-chain subtraction — rejected for accounting fragility); on-chain gas-cost estimation to self-decline (the EVM can't reliably introspect its own eventual gas cost/price — decline belongs at the relayer, contract only enforces `maxGasFee` + atomicity); fee to the relayer reconciled off-chain (forbidden — hot key must not accumulate fees); fee to the existing `treasury` (`MembershipManager.sol:31`) (usable, but a distinct `gasFeeRecipient` lets gas-fee revenue reconcile independently).

### B3. Native-vs-bridged USDC EIP-712 domain-version footgun

**Decision.** The contract stays **domain-agnostic**: it only calls `IERC3009(token).receiveWithAuthorization(...)` and never builds/verifies the digest — the **token** does, using its own domain inside `_hashTypedDataV4` (`MockUSDCPermit.sol:59-62`). Domain version is purely the **client's** concern (native Circle USDC = version "2", bridged USDC.e = "1"; `spec.md:90,167`; mock note `MockUSDCPermit.sol:12-14`, OZ default "1" via `ERC20Permit("USD Coin")` `:31`). The only on-chain control over which token/domain is used is the allowlist — `_allowedTokens` (`WagerRegistry.sol:58,278-282`, checked `:369,464`) and the single `paymentToken` (`MembershipManager.sol:30,118-122`); it MUST contain only tokens that (a) implement `receiveWithAuthorization` and (b) have a published domain version the client can target. Clients map `network → {token address, domain version}` from the token's own `eip712Domain()`/`DOMAIN_SEPARATOR()`, not a hardcoded "1".

**Rationale.** Failure is safe, not silent-corrupt: a wrong-version signature recovers a signer ≠ `from`, so the token reverts `InvalidSignature` (`MockUSDCPermit.sol:62-63`), no funds move, and the twin's whole tx reverts (FR-019, `spec.md:133-134`); the UI surfaces "wrong token domain" (edge `spec.md:90`). Keeping the contract agnostic avoids baking a version constant on-chain that would break at a native/bridged migration.

**Alternatives considered.** Contract verifies the domain / stores expected version per token (duplicates the token's EIP-712 logic, adds upgrade liability, no security gain — rejected); allowlisting both native and bridged USDC on one network (invites mismatch — curate a single canonical 3009 token per network, treat the other as self-submit-only).

### B4. Invalidating a signed-but-unsubmitted payment authorization (FR-006)

**Decision.** For the payment leg, invalidation uses the token's EIP-3009 `cancelAuthorization(authorizer, nonce, v, r, s)` — no FairWins contract code required. The user signs a cancel over the same `nonce`; anyone (including the relayer) may submit it; afterward `authorizationState[from][nonce] == true` and any later `receiveWithAuthorization` with that nonce reverts `AuthorizationUsed` (`MockUSDCPermit.sol:21,57,65`). The cancel is itself a gasless meta-tx. **Gap to close:** the reference `MockUSDCPermit` implements `receiveWithAuthorization` + the nonce map but **not** `cancelAuthorization` (`MockUSDCPermit.sol:16-68`); real Circle USDC does — add `cancelAuthorization` to the mock so FR-006 can be exercised in tests. No-stake intents (claim/refund/draw/redeem) carry no EIP-3009 nonce; their FR-006 invalidation is the Track A per-signer nonce layer's concern (`spec.md:172`), not the token's.

**Rationale.** The stablecoin's single-use nonce is the canonical, already-trusted invalidation primitive; canceling it guarantees the authorization can never subsequently execute (FR-006) at the source of funds, independent of any relayer state.

**Alternatives considered.** A FairWins-side revocation registry for the payment leg (redundant — the token already gates the nonce; adds trusted state — rejected; reserve a revocation mechanism only for the non-3009 no-stake intents).

### B5. Chain/token support matrix & non-3009 degradation

**Decision — support matrix.**

| Network | Token | EIP-3009 payment leg | Source |
|---|---|---|---|
| Polygon 137 | native Circle USDC (domain v"2") | **YES** | `spec.md:167` |
| Polygon Amoy 80002 | faucet USDC | **YES** | `spec.md:167` |
| Polygon | bridged USDC.e (domain v"1") | conditional; version footgun (B3) | `spec.md:90,167` |
| ETC 61 / Mordor 63 | USC (Brale, permit-only) | **NO** — `receiveWithAuthorization`/`authorizationState`/`cancelAuthorization` absent | spec 036 research |

USC additionally carries a token-level allow/deny blocklist and is Brale-upgradeable, so a transfer can revert at the token even after `SanctionsGuard` passes — treat as a governed asset.

**Decision — degradation.** The contract does not "degrade"; on a non-3009 token the `…WithAuthorization` twin's call reverts (no selector), moving zero funds. Degradation is a **client** decision driven by a per-network capability flag (probe `authorizationState`/`receiveWithAuthorization`): 3009-capable → use the gasless twin (B1); non-3009 (USC/ETC) → surface a specific "gasless payment unavailable on this network" error (FR-020, `spec.md:134`) and fall back to the pre-existing self-submit path (`createWager`/`acceptWager`/`purchaseTier` at `WagerRegistry.sol:310,582`; `MembershipManager.sol:192`) with the user paying gas after `approve`. No-stake intents remain gasless on ETC via the Track A signer-attributed layer since they move no stablecoin.

**Rationale.** EIP-2612 `permit` is technically available on USC but was deliberately **not** chosen (`spec.md:167`): its approval is not action-bound, so it is front-runnable/griefable — a mempool observer can consume the permit standalone, decoupling payment from action and violating FR-007. Gasless USC payment is therefore blocked pending an EIP-3009-capable token, not routed through permit. Fail-closed + explicit self-submit fallback satisfies FR-014/FR-020 and never presents a gasless-only dead end.

**Alternatives considered.** `permitAndCreateWager` (permit + `transferFrom`) as the ETC gasless path (rejected — front-runnable, non-action-bound; recorded only as a possible future fallback); commission an EIP-3009 `FiatToken`-style USC from Brale (the clean unblock, but out of FairWins' control — tracked as the gating dependency).

**Cross-cutting invariants for every twin.** `nonReentrant` + effects-before-interactions on all value paths (`WagerRegistry.sol:323`, `ZKWagerPool.sol:157`); screening/membership/freeze on the **signer** (`from`), never the relayer (`WagerRegistry.sol:211-214,264-268,393`; `MembershipManager.sol:145-148,204`); signed amount re-asserted on-chain (`ZKWagerPool.sol:158`); network isolation via the token's chainId + per-network allowlist (FR-021); storage-layout safety — new `gasFeeRecipient`/`feeNettingEnabled`/`maxGasFee` appended consuming 2 `__gap` slots (bool+address pack into one, `maxGasFee` the second; `WagerRegistry.sol:94-96`, `MembershipManager.sol:46-49`), while the per-signer nonce map is namespaced (zero gap), shipped as in-place upgrades (`spec.md:174`).

---

## Track C — UUPS in-place upgrade + storage-layout path + immutable-clone increment

### C1. Signer-attributed entrypoints + per-signer nonce as IN-PLACE UUPS upgrades

**Decision.** Ship the new signer-attributed write entrypoints and the replay/invalidation layer as **in-place UUPS upgrades** of the two existing proxies. The per-signer nonce map lives in `SignerIntentBase`'s **ERC-7201 namespaced** storage (zero sequential slots, safe as a new base — like `EIP712Upgradeable`); the only **sequential** appends are the fee-netting scalars on each payment-carrying contract (**2 slots**: packed `feeNettingEnabled`+`gasFeeRecipient`, plus `maxGasFee`), appended immediately above `__gap` with the gap decremented by two so total slot count is constant.

*WagerRegistry* (`contracts/wagers/WagerRegistry.sol`): the proxy already inherits `EIP712Upgradeable` (`:31`) with domain `"FairWins WagerRegistry","1"` set in `initialize` (`:164`) and reinitializer `initializeOpenChallenges` `reinitializer(2)` (`:185-187`), and already carries one app-level typehash `OPEN_ACCEPT_TYPEHASH` (`:45`) — the intent machinery reuses infrastructure that is present, not new. The nonce map is namespaced inside `SignerIntentBase` (no sequential slot); the only append is the fee-netting scalars, after the last existing state var `openWagerIdByClaim` (`:92`) and before `__gap` (`:96`):

```solidity
mapping(address => uint256) public openWagerIdByClaim;                          // :92 (slot N)
// NEW (035): fee-netting config (Track B) — nonce map is namespaced in SignerIntentBase, 0 slots
bool    public feeNettingEnabled;      // packs with gasFeeRecipient →           // slot N+1
address public gasFeeRecipient;        // segregated, never the relayer          // slot N+1
uint256 public maxGasFee;              //                                        // slot N+2
uint256[46] private __gap;                                                      // was [48] at :96
```

`__gap` is `uint256[48]` today (`:96`; header `:94-95` records the earlier `50→48` when feature-024 appended `claimAuthority` + `openWagerIdByClaim`); the fee scalars = 2 slots (bool+address pack into one) ⇒ `48→46`. The per-signer nonce map adds **no** sequential slot (namespaced). New typehashes are `private constant` (bytecode, not storage — like `OPEN_ACCEPT_TYPEHASH` `:45`), zero slots. New signer-attributed entrypoints (`claimPayoutWithSig`/`claimRefundWithSig`/`declareDrawWithSig`/`acceptWagerWithAuthorization`, mirroring `:789,811,667,582`) verify the intent, recover `signer`, consume the namespaced nonce via `_verifyIntent`, and run every existing check against `signer` via `_screen` (`:211`) and the membership gate (`:267`), fail-closed. A `reinitializer(3)` is **not** needed (domain already set); add one only if a new intent typehash needs a domain-version bump.

*MembershipManager* (`contracts/access/MembershipManager.sol`): inherits **only** `UUPSManaged` (`:19`), not `EIP712Upgradeable`. The upgrade adds **both** `EIP712Upgradeable` and `SignerIntentBase` to the inheritance list — storage-safe because both use ERC-7201 namespaced storage and contribute no sequential slots (`UUPSManaged.sol:45`), so adding these bases does not shift the contract's own layout. A new `reinitializer(2)` (the contract has none today — `initialize` is plain `initializer` `:89`, and spec-026's `voucher` was wired via admin `setVoucher` `:137`, not a reinitializer) calls `__EIP712_init("FairWins MembershipManager","1")`. Append only the fee-netting scalars after `voucher` (`:44`) and before `__gap` (`:49`):

```solidity
address public voucher;                                                         // :44 (026, slot M)
// NEW (035): fee-netting config — nonce map is namespaced in SignerIntentBase, 0 slots
bool    public feeNettingEnabled;      // packs with gasFeeRecipient →           // slot M+1
address public gasFeeRecipient;        // segregated, never the relayer          // slot M+1
uint256 public maxGasFee;              //                                        // slot M+2
uint256[47] private __gap;                                                      // was [49] at :49
```

`__gap` is `uint256[49]` (`:49`; header `:46-48` records the `50→49` for `voucher` in spec 026); fee scalars = 2 slots ⇒ `49→47` (the namespaced nonce map adds none). New variants (`purchaseTierWithAuthorization`/`upgradeTierWithAuthorization`/`extendMembershipWithAuthorization`/`redeemVoucherWithSig`, mirroring `:203,236,254,278`) recover the signer, consume the namespaced nonce, screen the signer via `_screen` (`:145`); money-in variants replace `safeTransferFrom(msg.sender,…)` `:213` with the EIP-3009 `receiveWithAuthorization` pull bound to the signer (atomic, FR-007).

**Gate / CI.** `npm run check:storage-layout` (`package.json:29` → `scripts/deploy/check-storage-layout.js`) already lists both contracts (`check-storage-layout.js:21-22`). Where a prior impl exists it runs OZ `upgrades.validateUpgrade(deployedImpl, Factory, {kind:"uups"})` (`:55`), which fails loudly on any reorder/insert/retype and passes for a pure append; `upgrades.upgradeProxy` (`scripts/deploy/lib/upgradeable.js:38-48`) re-runs the same validation before broadcasting, so an unsafe upgrade throws before it hits chain.

**Rationale.** Append-only + `__gap` decrement is the mandated pattern (CLAUDE.md upgradeable rules; `UUPSManaged.sol:16`; ADR-004), proven twice already (WagerRegistry feature-024 `50→48`, MembershipManager spec-026 `50→49`). One keyed `mapping(address => mapping(bytes32 => bool))` (EIP-3009 `authorizationState` shape), held in the mixin's namespaced storage, satisfies FR-004 single-use, FR-005 binding, and FR-006 user-invalidation — arbitrary per-signer nonces let a user pre-consume a specific unsubmitted intent, which a sequential counter cannot. Reusing `_screen`/membership gates against the recovered signer meets FR-002/FR-003 and SC-006 with no compliance re-implementation (FR-022).

**Alternatives considered.** Sequential `mapping(address=>uint256)` counter (one slot, but cannot invalidate an arbitrary out-of-order intent — breaks FR-006 — rejected); fresh redeploy at a new address (violates CLAUDE.md/ADR-004; strands state, forces frontend/subgraph repoint — rejected); shared ERC-2771 forwarder (rejected `spec.md:170`); inserting the mapping mid-layout (corrupts storage, fails `validateUpgrade` — rejected).

### C2. ZKWagerPool immutable-clone constraint

**Decision.** **Deployed pools are frozen; do not retrofit them.** `ZKWagerPool` is an ERC-1167 clone initialized once by the factory (`ZKWagerPoolFactory.sol:117` `Clones.clone(poolImpl)` → `ZKWagerPool.sol:99` `initialize`), the master disables initializers (`ZKWagerPool.sol:94`), and the pool inherits `Initializable`/`ReentrancyGuardUpgradeable` but **not** `UUPSUpgradeable` — no upgrade gate; clones share the master's fixed logic. No in-place path exists (`spec.md:168`).

Per-action verification:

| Pool action | Line | Attribution today | Gasless on deployed pools? |
|---|---|---|---|
| `join` | `:138` | `msg.sender` | via existing `joinWithAuthorization` |
| `joinWithAuthorization` | `:147` | **signer via `from`** (EIP-3009 `:162`) | **Yes — already signer-attributed** (FR-009) |
| `approve` | `:230` | sender-agnostic — Semaphore ZK proof, nullifier-gated (`:234-238`) | **Yes — already anonymous** |
| `claim` | `:267` | sender-agnostic — recipient in `proof.message` (`:277`), ZK-verified (`:283`) | **Yes — already anonymous** |
| `pokeDeadline` | `:201` | permissionless | Yes |
| `proposeOutcome` | `:220` | `msg.sender != creator` (`:221`) | **No — creator-only** |
| `closeJoining` | `:194` | `msg.sender != creator` (`:195`) | **No — creator-only** |
| `cancel` | `:301` | `msg.sender != creator` (`:302`) | **No — creator-only** |
| `refund` | `:291` | keyed to `msg.sender` (`:294`, pays `msg.sender` `:297`) | **No — caller-bound member action** |

So only `proposeOutcome`, `closeJoining`, `cancel`, `refund` need signer attribution; a relayer submitting these today fails the creator check or (for `refund`) pays the relayer. `join`/`approve`/`claim` are already relayable, matching FR-009 (`spec.md:117`). **Increment plan (FUTURE pools only):** author a new pool implementation adding signer-attributed variants (`proposeOutcomeFor`/`closeJoiningFor`/`cancelFor`/`refundFor`, verifying an EIP-712 pool-intent + per-signer nonce, checking `signer == creator` / `hasJoined[signer]`); deploy the new master; `ZKWagerPoolFactory.setTemplate(newPoolImpl)` (`ZKWagerPoolFactory.sol:221`, admin-gated) so all subsequently created clones use it; record the new master under the `poolImpl` key in `deployments/` (currently `mordor-chain63-v2.json` → `poolImpl: 0x6da67B…`). Existing clones keep their logic; the per-pool limitation is surfaced honestly (FR-009/FR-012). This is a **template swap for future clones**, not a UUPS upgrade — the factory (`zkWagerPoolFactoryImpl`) is separately UUPS-upgradeable but that does not change deployed clones.

**Rationale.** `setTemplate` (`:221`) is the built-in, documented seam; clone bytecode cannot change post-deploy. Reuses the pool's proven signer-attributed primitive (`joinWithAuthorization` `:147`) rather than inventing a new pattern.

**Alternatives considered.** Beacon proxy for pools (would upgrade all pools at once but contradicts spec 034's immutable-isolation guarantee and ADR-004's UUPS-per-impl decision — rejected); migrate members from old clones to new (high-risk fund movement, breaks each Semaphore group — rejected); wrap creator actions behind a relayer-only adapter (cannot bypass the baked-in `msg.sender != creator` check — impossible).

### C3. Deploy / rollout order and `deployments/` recording

**Decision.** Order the shipment to satisfy the cross-contract dependency (WagerRegistry calls MembershipManager's hooks; membership money-in intents depend on the payment primitive):
1. **MembershipManager upgrade first** — gains `EIP712Upgradeable` + `reinitializer(2)`; land, verify, confirm the membership gate still serves WagerRegistry unchanged. Run via `upgradeProxy({ name:"MembershipManager", proxyAddress, call:{ fn:<reinitializer> } })` (`scripts/deploy/lib/upgradeable.js:38-48`).
2. **WagerRegistry upgrade second** (P1 create/accept, then P2 claim/refund/draw).
3. **New `poolImpl` + `factory.setTemplate`** (C2), independent, sequenced where pools are live.

Each step: `npm run check:storage-layout` (gating) → `upgradeProxy` (re-validates, `:42-44`) → record. `upgradeProxy` returns `{ proxy, implementation }` (`:47`) and `getImplementation` (`:51-53`) reads it back. Per CLAUDE.md, `deployments/<net>.json` records the **stable proxy** (`wagerRegistry`, `membershipManager`, `zkWagerPoolFactory`) unchanged and updates the **new implementation** under `wagerRegistryImpl` / `membershipManagerImpl` / `poolImpl` — the exact keys `check-storage-layout.js` reads for the next append-only diff (`:38` `${deploymentsKey}Impl`). Proxy address, frontend, and subgraph do not repoint (ADR-004 Consequences); only the ABI grows.

**Rationale.** Matches CLAUDE.md upgradeable rules verbatim. Membership-first avoids a window where WagerRegistry's new money-in intents reference a not-yet-upgraded membership contract. Recording `…Impl` arms the CI append-only gate for the following upgrade.

**Alternatives considered.** WagerRegistry first (leaves membership-purchase intents unshippable, risks the reverse dependency — rejected); single batched upgrade of both (larger blast radius; ADR-004 favors independent, individually-validated upgrades — rejected).

### C4. Multi-network sequencing and blockers

**Decision / state** (verified against `deployments/`):

| Network | Chain | Registry / Membership | Pools | 035 readiness |
|---|---|---|---|---|
| Polygon mainnet | 137 | **Pre-UUPS, plain non-proxy** — `polygon-chain137-v2.json` has no `wagerRegistryImpl`/`membershipManagerImpl` keys (`architecture.md:171`, `docs/adr/004:26`: "live non-upgradeable registry on Polygon cannot be retro-wrapped") | none | **BLOCKED for in-place upgrade** |
| Polygon Amoy | 80002 | UUPS proxies — `wagerRegistryImpl:0xa217…`, `membershipManagerImpl:0xb649…` present | none | **Upgrade target** (native + faucet USDC support EIP-3009, `spec.md:167`) |
| Mordor (ETC) | 63 | UUPS proxies — `wagerRegistryImpl:0xa7cf…`, `membershipManagerImpl:0x7D38…` present; **only network with `zkWagerPoolFactory`/`zkWagerPoolFactoryImpl`/`poolImpl`** | live | No-stake intents only; **gasless payment BLOCKED** |

**Sequencing:** (1) **Amoy first** — feature-complete UUPS set + an EIP-3009-capable stablecoin; validate all four US on testnet. (2) **Mordor** — same UUPS upgrades (registry + membership), but only the **no-stake** signer-attributed intents work; gasless stablecoin pulls do not. (3) **Polygon mainnet** — the in-place path cannot run until Polygon's UUPS migration lands (specs 025/027 cutover); per ADR-004 the pre-UUPS contracts are settle-only and "cannot be retro-wrapped," so 035's registry/membership intents ship on Polygon only after that migration deploys fresh proxies (coexistence cutover, `docs/adr/004:35`, `025/plan.md:39-40`).

**Blockers.** (a) *Polygon (primary) is pre-UUPS* — the single hard blocker for the flagship P1 flow on mainnet; `check:storage-layout --network polygon` won't even diff (no `…Impl` key ⇒ `loadDeployedImpl` returns null, `check-storage-layout.js:28-45`, falling back to `validateImplementation` `:59`), because there is no proxy to upgrade. Resolution is the pending 025/027 migration, not spec 035. (b) *Mordor gasless payment* — USC (`0xDE0936…`) is a permit-only Brale token with no `receiveWithAuthorization`/`transferWithAuthorization`; EIP-3009 money-in intents cannot verify there. Mordor is limited to no-stake signer-attributed intents (claim/refund/cancel/draw/voucher-redeem) + self-submit until USC EIP-3009 support is verified/added; pool creator-action gasless on Mordor also needs the new `poolImpl` (C2).

**Rationale.** Rollout follows where the relevant contracts are live and where the stablecoin supports the payment primitive (`spec.md:173-174`). Amoy is the only place both conditions hold today for the full flow.

**Alternatives considered.** Retro-wrap Polygon with a proxy (impossible for an already-deployed non-proxy per ADR-004 — rejected); force gasless USC on Mordor via a 3009-faking adapter (violates honest-state FR-019/FR-020, can't move funds atomically — rejected; surface the limitation and fall back to self-submit).

---

## Track D — Frontend intent-signing, honest status, self-submit, covered-flow inventory

### D0. Current state (what we're replacing)

Every money-in flow is a hard-coded 2-tx approve+action sequence requiring native gas: create (`useFriendMarketCreation.js:340-361` approve, `:417-420` action), accept (`MarketAcceptanceModal.jsx:368-373` approve, `:378` action), open-challenge accept (`useOpenChallengeAccept.js:138-143` approve; already signs EIP-712 `signOpenAccept` `:147-162` then `acceptOpenWager`), pool join (`usePools.js:191-194` approve, `:195-197` `createPoolIdentity` + `pool.join`), membership (`blockchainService.js:1189-1198`/`1297-1341` approve, `:1207-1219` action; legacy `1358`), voucher mint (`useVouchers.js:79-96` approve, `:84,98` mint). No-new-stake actions are single gas-paying txs: voucher redeem (`useVouchers.js:159-180`), claim (`MyMarketsModal.jsx:714`), refund (`:663,773,1403`), cancel (`:1349`), draw (`:1869`), decline (`MarketAcceptanceModal.jsx:466`), pool vote/claim/refund (`usePools.js:271-338`). The only existing intent primitives are the dormant EIP-3009 signer in `lib/pools/gasless.js:28-46` (default `tokenVersion='2'`, domain `:42`) + the relayer client `lib/pools/relayerClient.js:51-94` (gated on `VITE_POOL_RELAYER_URL`, POSTs `/relay/pool-join`), and the app-level verifier `signOpenAccept` in `utils/claimCode/deriveFromCode.js:61-71` (domain `FairWins WagerRegistry`/v`1`, types `:23-28`). There is no `frontend/src/lib/relay/` yet, and no gasless UI is wired (`GroupPoolModal.jsx:182` calls the gas-paying `joinPool`).

### D1. Shared intent-signing client (`frontend/src/lib/relay/`)

**Decision.** Create `frontend/src/lib/relay/` generalizing `lib/pools/gasless.js` + `relayerClient.js` into a flow-agnostic client matching spec 036's contract (`specs/036-relayer-infrastructure/contracts/frontend-relay-client.md:14-18`):
- `intentClient.js` — `signIntent(action, params, { chainId, intentClass, targetContract, funding })` returns the spec-036 `Intent` body (`data-model.md:9-21`): `{ intentClass, chainId, targetContract, action, params, signature, authorization?, validAfter, validBefore, uniquenessMarker, fundingMode, maxFee? }`. For `intentClass:'payment'` it lifts `signReceiveAuthorization` from `gasless.js:28-46` verbatim (EIP-3009 `ReceiveWithAuthorization`, `gasless.js:13-22`), setting `authorization = {from,to,value,validAfter,validBefore,nonce}` with `to = targetContract` (recipient-bound, never `transferWithAuthorization` — `spec.md:167`) and copying `nonce` into `uniquenessMarker` (`data-model.md:19`). For `intentClass:'signer-attributed'` it builds an EIP-712 typed intent over `(signer, params, replayNonce, validAfter, validBefore)` against the target contract's own domain — generalizing `signOpenAccept` (`deriveFromCode.js:61-71`) from open-accept-only to every no-stake action; `uniquenessMarker = replayNonce` (`spec.md:172`, FR-004). `makeRelayer(chainId)` replaces `makePoolRelayer` (`relayerClient.js:51`), reads `VITE_RELAYER_URL` (renamed from `VITE_POOL_RELAYER_URL`, `relayerClient.js:16`), returns `null` when unset ⇒ caller self-submits. `relayIntent(intent)` → `POST /v1/intents` (`relay-gateway-api.md:11`); on 2xx returns `{intentId,status,txHash?}`, on `429/503`/timeout throws typed `RelayerUnavailable`. `pollStatus(intentId)` → `GET /v1/intents/{id}` (`relay-gateway-api.md:46`). `probeHealth(chainId)` → `GET /healthz` (`relay-gateway-api.md:50`), bounded budget, routes to self-submit when unhealthy.
- `intentTypes.js` — EIP-712 typed-data structs per action (mirrors `gasless.js:13-22` / `deriveFromCode.js:23-28`), keyed by `action` name (`data-model.md:14`).
- `useIntentAction.js` — a React hook wrapping `probeHealth → signIntent → relayIntent → pollStatus`, falling back to a caller-supplied `selfSubmit()` closure on any RelayerUnavailable/unset/`payment_unsupported_on_chain`. The single enforcement point for the never-stranded rule (`frontend-relay-client.md:20-22`).

**Rationale.** The pattern already exists and is proven end-to-end (`spec.md:170`); the design generalizes and activates rather than inventing. Concentrating the never-stranded branch, EIP-712/3009 domain construction, and status polling in one client means each call site changes from "approve+action" to "call `useIntentAction` with a `selfSubmit` fallback," so the 2→1-signature win (SC-002) and the identical-fallback guarantee (SC-005/FR-014) are structural, not per-flow reimplementations (FR-022).

**Alternatives considered.** ERC-2771 forwarder rewriting `msg.sender` (rejected `spec.md:170`); keep per-flow bespoke signing (duplicates fallback/status/domain logic 5+ times, violates FR-022, makes SC-005 unauditable); reuse `relayerClient.js` as-is (its payload is pool-join-specific, `relayerClient.js:59-64` `identityCommitment`, can't carry arbitrary `action`+`params`).

### D2. Per-flow changes: 2 txs → 1 signature + relay, with self-submit fallback

**Decision.** Each flow keeps its existing function as the **`selfSubmit` fallback** (identical on-chain result, FR-014) and gains an intent path in front via `useIntentAction`:

| Flow (call site) | Intent class | New signed path | Self-submit fallback |
|---|---|---|---|
| Create wager `useFriendMarketCreation.js:114-488` | payment | EIP-3009 for `creatorStakeWei` (`:172-193`) → `action:'createWager'`, params = `createArgs` (`:376-383`); drop `approve` `:340-361` | `approve`+`createWager` `:340-420` |
| Accept wager `MarketAcceptanceModal.jsx:303-440` | payment | EIP-3009 for `w.opponentStake` (`:335`) → `action:'acceptWager'`, `{wagerId}`; drop `approve` `:368-373` | `approve`+`acceptWager` `:368-378` |
| Open-challenge accept `useOpenChallengeAccept.js:102-172` | payment | already signs `signOpenAccept` `:147`; add EIP-3009 stake leg, relay `acceptOpenWager` `:162`; drop `approve` `:138-143` | `approve`+`acceptOpenWager` `:138-162` |
| Pool join `usePools.js:181-205` | payment | activate dormant path: `signReceiveAuthorization` + `relayGaslessJoin` (`gasless.js:54`) wired to `GroupPoolModal.jsx:182`; drop `approve` `:191-194` | `approve`+`join` `:191-197` |
| Membership purchase/upgrade/extend `blockchainService.js:1121-1236` | payment | EIP-3009 for resolved `price` (`:1172-1180`) → `purchaseTier`/`upgradeTier`/`extendMembership`; drop `approve` `:1189-1198`; extend `checkApprovalNeeded` `:1409` to report "gasless available" | `approve`+`purchaseTier` `:1189-1219` |
| Voucher mint `useVouchers.js:51-122` | payment | EIP-3009 for `price`/`total` → `mint`/`mintBatch`; drop `approve` `:79-96` | approve+mint `:79-98` |
| Voucher redeem `useVouchers.js:159-180` | signer-attributed | EIP-712 redeem intent → `redeemVoucher`, `{tokenId,termsHash}` | `manager.redeemVoucher` `:168` |
| Claim payout `MyMarketsModal.jsx:714` | signer-attributed | `claimPayout`, `{wagerId}` | `claimPayout` `:714` |
| Refund `MyMarketsModal.jsx:663,773,1403` | signer-attributed | `claimRefund` | `claimRefund` |
| Cancel `MyMarketsModal.jsx:1349` | signer-attributed | `cancelOpen` | `cancelOpen` |
| Draw declare `MyMarketsModal.jsx:1869` | signer-attributed | `declareDraw` (and `revokeDraw` per `WagerRegistry.js:2139`) | `declareDraw` |
| Decline `MarketAcceptanceModal.jsx:466` | signer-attributed | `declineWager` | `declineWager` |
| Pool vote/claim/refund `usePools.js:271-338` | signer-attributed (join-attributed pools only, FR-009) | relay member-attributed proofs | proof+send `:286,312,329` |

The `payment` branch collapses money-in wallet interactions from 2 (approve tx + action tx) to 1 signature (SC-002/SC-009); the `signer-attributed` branch replaces one gas tx with one signature.

**Rationale.** Reusing each existing function as the fallback is the cheapest way to guarantee identical on-chain result (SC-005) and honest capability: if `VITE_RELAYER_URL` is unset, or the chain is ETC/Mordor where the token lacks EIP-3009 (`frontend-relay-client.md:28-30`, `data-model.md:33`), the flow silently uses code that already ships. The payment vs signer-attributed split is dictated by spec 036's Intent-Class table (`data-model.md:31-35`).

**Alternatives considered.** Gasless-only, removing the approve+action code (creates the "gasless-only dead end" FR-014/US4 forbids, breaks Mordor — rejected); auto-select per flow without user choice (kept, but the UI must still expose "pay your own gas" per US4-1 `spec.md:81` so the choice is honest when a relayer exists but the user prefers self-submit).

### D3. Honest status UI (FR-018 / FR-023), reusing spec 031 activity

**Decision.** Model intent lifecycle on spec 036's status enum — `signed → queued/submitted(pending) → confirmed | expired | invalidated | rejected/failed` (`data-model.md:121-135`) — surfaced two ways: (1) an in-flow `IntentStatus.jsx` under `components/intents/`, driven by `pollStatus` (`frontend-relay-client.md:17`), replacing the boolean-ish local step states that jump straight to success — e.g. `MarketAcceptanceModal.jsx:90` `step` enum and its "Done" button `:945-947`/`:912-914`, which today render success as soon as `tx.wait()` returns (`:381-383`). Under the new model the UI shows `submitted-pending` until `pollStatus`/receipt reports on-chain inclusion and NEVER shows a terminal "done"/"confirmed" before then (FR-018, SC-007, `data-model.md:133`). (2) Feed integration via spec 031: emit an `ActivityEntry` (`specs/031-platform-notifications/data-model.md:7-26`) per intent with `domain` (`'wagers'|'membership'`), `refId`, `type` (`'intent-submitted'`/`'intent-confirmed'`/`'intent-expired'`/`'intent-invalidated'`/`'intent-failed'`), and `severity` (`info/success/warning/error`, `data-model.md:18`); consume through `useActivity()` (`hooks/useActivity.js:9-25`); persist through the pure store API `appendEntries`/`markRead` (`specs/031-platform-notifications/contracts/store-schema.md:45-46`). A `signed-but-unsubmitted` intent has no on-chain existence, so it lives only in transient hook state + an `actionable` feed entry offering **Invalidate** (FR-006) and **Self-submit** (FR-014), never persisted as confirmed.

**WCAG 2.1 AA (FR-023 / `frontend-relay-client.md:24-26`).** Each status renders a text label (never color/icon alone), transitions announced via `aria-live` (reuse the `severity`→aria-live mapping in `031 data-model.md:18`), and error/reason strings (`relay-gateway-api.md:37-42`) rendered as accessible text. The existing modal already has dialog semantics (`MarketAcceptanceModal.jsx:509-511`); the reason surface generalizes the existing `translateRevert` (`useFriendMarketCreation.js:493`) / `translateAcceptRevert` (`useOpenChallengeAccept.js:178`) maps to cover relayer error codes.

**Rationale.** Spec 031 already implements a versioned, per-(account,chain) activity store with dedup, honest corrupt-recovery, and an accessible feed/bell — FR-022's reuse mandate and FR-018's honesty requirement are met by mapping intent states onto existing `ActivityEntry` semantics rather than inventing a parallel notifier; the severity→aria-live plumbing already exists.

**Alternatives considered.** Keep per-modal `step` state as source of truth (conflates "tx sent" with "confirmed," shows "Done" pre-inclusion — violates FR-018/SC-007); a new toast/store just for intents (duplicates spec 031, fails FR-022, splits status across two systems).

### D4. Native-vs-bridged USDC domain-version handling (FR-020)

**Decision.** Add a `domainVersion` field to each network's `stablecoin` config in `config/networks.js` (currently absent — Polygon `:238-245`, Amoy `:55-60`, Mordor USC `:118-119` carry only `address/symbol/name/decimals`). Populate `'2'` for native Circle USDC (Polygon `:238`, Amoy faucet `:52-56`) and `'1'` for any bridged USDC.e. `signIntent`'s payment path reads `tokenName`/`tokenVersion` from this config instead of the hard-coded default `tokenVersion='2'` in `gasless.js:31-32`, and builds the EIP-712 domain (`gasless.js:42`) accordingly. Before signing, `signIntent` verifies the token supports the chosen domain (recover its own signature locally, or read `version()`/`DOMAIN_SEPARATOR` where exposed) and on mismatch throws a specific typed error — surfaced as "This USDC variant uses a different signing domain (native '2' vs bridged '1'); gasless payment isn't available for it — pay your own gas instead" — routing to self-submit (`frontend-relay-client.md:22`, edge `spec.md:90`). For chains where the token has no EIP-3009 (Mordor USC `:118-119`), the relayer returns `payment_unsupported_on_chain` (`relay-gateway-api.md:42`, `data-model.md:33`) and the flow self-submits (FR-020, `spec.md:167`).

**Rationale.** A wrong-domain signature silently fails to verify (`spec.md:90,167`); catching it client-side before submission is the only way to give a specific, actionable reason (FR-019/FR-020) rather than an opaque relayer 400 (`invalid_signature`, `relay-gateway-api.md:37`). Storing the version alongside the address keeps token/domain selection network-scoped and synced-config-driven (Principle V), matching `getContractAddressForChain`.

**Alternatives considered.** Always sign with `version:'2'` (current `gasless.js:32` default — breaks silently on bridged USDC.e, exactly the FR-020 edge); probe `version()` at every sign with no config (extra RPC per action, still needs a fallback when the token doesn't expose `version()` — config-first with a probe as verification is cheaper and deterministic).

### D5. Covered-flow scope vs FR-008..FR-012 and SC targets

**Decision & confirmation.**
- **FR-008 (wager lifecycle)** — fully covered: create (`useFriendMarketCreation.js:417`), accept (`MarketAcceptanceModal.jsx:378`), open-challenge accept (`useOpenChallengeAccept.js:162`), claim (`MyMarketsModal.jsx:714`), refund (`:663/773/1403`), cancel/decline (`:1349`, `MarketAcceptanceModal.jsx:466`), draw declare/revoke (`:1869`, `WagerRegistry.js:2139`). Payment class for create/accept; signer-attributed for the rest.
- **FR-009 (pools)** — join/vote/claim covered on already-deployed pools by activating `gasless.js`/`relayerClient.js` (`usePools.js:181-338`); creator-only actions (`createPool :110`, `proposeOutcome :261`, `cancelPool :254`) remain self-submit and this per-pool limitation is surfaced honestly (FR-012) — deployed clones are immutable (`spec.md:168`). Pool payment additionally gated on the chain's stablecoin supporting EIP-3009 (`spec.md:167`).
- **FR-010 (membership)** — purchase/upgrade/extend (`blockchainService.js:1207-1219`) as payment; voucher redeem (`useVouchers.js:168`) as signer-attributed; voucher mint (`:84,98`) as payment.
- **FR-011/FR-012 (best-effort writes)** — ZK key register (`blockchainService.js:1491`), external-DAO — offered where the target carries the signer; NOT counted toward the 100% SC targets (`spec.md:169`).

**SC targets met:** SC-002 (2→1 sig, 0 approvals, money-in) — the `payment` branch removes the `approve` step at every money-in site (D2) and replaces the action tx with one EIP-3009 signature. SC-009 (native-gas→0 for no-stake) — the `signer-attributed` branch replaces the gas-paying tx at claim/refund/cancel/draw/decline/redeem with one EIP-712 signature. SC-005 (100% self-submit, identical result) — structural, keeping each existing function as the `useIntentAction` fallback. SC-007 (honest status) — D3. SC-010 (WCAG AA in CI) — D3, axe/Lighthouse over the new `IntentStatus` + feed entries.

**Rationale / Alternatives.** Scope is confirmed against the spec's own "covered flows = FR-008–FR-010 P1/P2 core" definition (`spec.md:169`); FR-011/012 are explicitly best-effort and excluded from the 100%-style criteria, so the design does not over-claim gasless where the contract can't attribute the signer (FR-012). No alternative scope is proposed — narrowing below FR-008–FR-010 would miss SC-001's zero-native-balance end-to-end guarantee.

---

## Technical Context resolution

All prior NEEDS CLARIFICATION items are resolved by the four tracks above. Concrete values:

**Language/Version**: Solidity 0.8.24 (contracts, `hardhat.config.js:247`); JavaScript/JSX on React 19.2 + Vite 7.2 (frontend); Node.js with Hardhat 2.28 as the contract test runner. viaIR off, optimizer on.

**Primary Dependencies**: OpenZeppelin Contracts & Contracts-Upgradeable 5.4.0 (`EIP712Upgradeable`, `ECDSA`, `UUPSUpgradeable` via `UUPSManaged`, `ReentrancyGuardUpgradeable`, `SafeERC20`, `Clones`); `@openzeppelin/hardhat-upgrades ^3.9` (drives `validateUpgrade`/`upgradeProxy`); ethers ^6.16 (contracts) / ^6.17 (frontend); EIP-3009 `receiveWithAuthorization`/`cancelAuthorization` on the platform stablecoin (native Circle USDC / Amoy faucet USDC; `MockUSDCPermit` in tests); Semaphore (pools, unchanged); the existing `SanctionsGuard`/`MembershipManager` compliance controls (reused, FR-022); spec 031 activity store (`useActivity`, store-schema); spec 036 relayer gateway API + frontend-relay-client contracts. New artifact: `contracts/upgradeable/SignerIntentBase.sol`.

**Storage**: On-chain proxy storage, append-only with trailing `__gap`. The per-signer nonce map (`mapping(address => mapping(bytes32 => bool))`) lives in `SignerIntentBase`'s ERC-7201 **namespaced** storage — zero gap cost, safe as a new base (like `EIP712Upgradeable`). The only sequential appends are the fee-netting scalars (`feeNettingEnabled`+`gasFeeRecipient` packed = 1 slot, `maxGasFee` = 1 slot) on the payment-carrying contracts ⇒ `WagerRegistry` `__gap` 48→46; `MembershipManager` 49→47. Payment-leg replay state lives in the stablecoin (EIP-3009 `authorizationState`), not in FairWins. Address book of record: `deployments/<net>.json` (proxy keys stable; `…Impl` keys updated). Frontend state: client-side spec 031 activity store + transient hook state — **no application backend** (FR-017/SC-008).

**Testing**: Hardhat (`npm test`) — unit `test/*.test.js`, `test/integration/`, `test/fork/`, `test/oracles/`; Slither + Medusa security gates + `.github/agents/` review; `npm run check:storage-layout` (gating, OZ `validateUpgrade`) before every upgrade; Vitest for the frontend (`npm run test:frontend`); axe/Lighthouse accessibility in CI at WCAG 2.1 AA (SC-010). Add `cancelAuthorization` to `MockUSDCPermit` so FR-006 payment-leg invalidation is exercisable.

**Target Platform**: EVM chains — Polygon Amoy 80002 (first upgrade target, full flow), Mordor/ETC 63 (no-stake intents only until USC EIP-3009 lands; only network with a live pool factory), Polygon mainnet 137 (flagship, blocked until the specs 025/027 UUPS migration deploys fresh proxies); browser SPA served by nginx on Cloud Run (fixed footprint), IPFS + Cloudflare + Cloud Logging as today.

**Project Type**: Web — Solidity contracts (in-place UUPS upgrades + one new mixin + a future pool template) plus a React/Vite SPA (`frontend/`) plus the subgraph; **no new backend** (the submitter is a third-party relayer or the user's own wallet).

**Performance Goals**: Money-in flows drop from 2 user signatures + 1 approval tx to **1 signature, 0 approvals** (SC-002); no-stake flows drop from 1 gas-paying tx to **1 off-chain signature, 0 native gas** (SC-009); zero-native-balance wallets complete create/accept/claim/pool-join/membership-purchase end-to-end (SC-001); per-payment-proxy storage footprint grows by exactly two gap slots (fee-netting scalars; the nonce map is namespaced, zero gap); honest-status polling runs within a bounded health/status budget; zero successful replays across all testing (SC-004).

**Constraints**: No new stateful FairWins backend, deployment footprint must not grow (FR-017/SC-008); append-only storage + `__gap`, must pass `check:storage-layout`; checks-effects-interactions + `nonReentrant` on every value path; screen the **signer** fail-closed, reuse existing compliance/membership controls (FR-003/FR-022); money leg uses `receiveWithAuthorization` only (never `transferWithAuthorization`), atomic with the action (FR-007); untrusted-relayer posture "can censor, cannot steal" (FR-013); per-contract EIP-712 domain enforcing chainId + verifyingContract isolation (FR-005/FR-021); deployed pool clones are immutable (creator-action gasless only for future-template pools, FR-009); native-vs-bridged USDC domain-version must be config-driven with a client-side pre-sign check (FR-020); WCAG 2.1 AA for all new intent UI (FR-023); admin keys stay on the air-gapped floppy-keystore flow.

**Scale/Scope**: 2 UUPS proxy upgrades (`WagerRegistry`, `MembershipManager`) + 1 new shared mixin (`SignerIntentBase`) + 1 future `ZKWagerPool` template (via `setTemplate`); ~16 new signer-attributed `xxxWithSig`/`…WithAuthorization` entrypoints across the two contracts, each with a preserved self-submit twin; ~12 frontend flow call sites migrated to `useIntentAction`; 1 new `frontend/src/lib/relay/` module (3 files) + `components/intents/IntentStatus.jsx`; 3 target networks with staged rollout (Amoy → Mordor → Polygon-post-migration); covered scope = FR-008–FR-010 P1/P2 core, FR-011/FR-012 best-effort and excluded from the 100%-style success criteria.