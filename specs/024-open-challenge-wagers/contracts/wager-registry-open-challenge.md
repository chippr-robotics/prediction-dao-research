# Contract: WagerRegistry — Open-Challenge Additions

Additive surface only. The `Wager` struct, every existing function/event/error, and the
`ResolutionType`/`Status` enums are **unchanged** (FR-024).

## New state

```solidity
/// @notice Code-derived address committed to an open challenge. 0 ⇒ not an open challenge.
mapping(uint256 => address) public claimAuthority;

/// @notice Reverse index: the single Open open-challenge for a claim authority (0 ⇒ none).
///         Powers code discovery and active-uniqueness.
mapping(address => uint256) public openWagerIdByClaim;
```

## EIP-712

```solidity
// Domain: name="FairWins WagerRegistry", version="1", chainId, verifyingContract=address(this)
bytes32 constant OPEN_ACCEPT_TYPEHASH = keccak256("OpenAccept(uint256 wagerId,address taker)");
```

Implemented via OpenZeppelin **`EIP712Upgradeable`** + `ECDSA` (the registry is a UUPS proxy after spec 025,
so the **upgradeable** EIP712 base is required — `EIP712Upgradeable` uses ERC-7201 namespaced storage, adding
no sequential storage slots).

**Initialization (upgrade-aware — important):** because 024 ships as an *in-place upgrade* of the
already-initialized WagerRegistry proxy, the one-time `initialize(...)` does **not** run again, so EIP-712
cannot be set up there for existing deployments. Set the domain via a **`reinitializer(2)`** that the upgrade
invokes through `upgradeToAndCall`:

```solidity
function initializeOpenChallengeV2() external reinitializer(2) {
    __EIP712_init("FairWins WagerRegistry", "1");
}
```

Also add `__EIP712_init("FairWins WagerRegistry", "1")` to `initialize(...)` so a **fresh** post-024 deploy
(new network / local) is fully configured in one call. Fresh deploys run `initialize` (EIP712 at v1) and
never call the reinitializer; existing proxies run the reinitializer (v2) during the upgrade and never re-run
`initialize`. No double-init.

**Storage (append-only, spec 025 rule):** declare `claimAuthority` + `openWagerIdByClaim` **before** the
trailing `uint256[50] private __gap` and **reduce the gap to `uint256[48]`** (two new mapping slots), so every
subsequent slot position is unchanged and `npm run check:storage-layout` passes `validateUpgrade`.

## New functions

### `createOpenWager`

```solidity
function createOpenWager(
    address claimAuthority_,     // code-derived address (commitment); MUST be non-zero
    address arbitrator,          // non-zero only for ThirdParty
    address token,               // allowlisted ERC20
    uint128 stake,               // single equal stake; creatorStake = opponentStake = stake
    uint64  acceptDeadline,
    uint64  resolveDeadline,
    ResolutionType resolutionType, // Either | ThirdParty | Polymarket | Chainlink* | UMA  (NOT Creator/Opponent)
    bytes32 oracleConditionId,   // required for oracle types, else zero
    bool    creatorIsYes,
    bytes32 metadataHash,
    string  calldata metadataUri
) external nonReentrant whenNotPaused notFrozen(msg.sender) returns (uint256 wagerId);

// + createOpenWagerWithTerms(...) overload binding termsVersionHash, mirroring createWagerWithTerms.
```

Behavior: validates per data-model "createOpenWager Checks", **requires the creator to hold Silver tier or
above** (`membershipManager.getActiveTier(msg.sender, WAGER_PARTICIPANT_ROLE) >= IMembershipManager.Tier.Silver`
else `InsufficientMembershipTier`, FR-005a — in addition to the existing `checkCanCreate` gate), escrows
`stake` from the creator, sets `opponent = address(0)`, `status = Open`,
`claimAuthority[wagerId] = claimAuthority_`, `openWagerIdByClaim[claimAuthority_] = wagerId`, indexes creator
(and arbitrator) in `_userWagerIds`, `recordCreate(creator)`, emits `OpenWagerCreated`
(+ `OracleConditionLinked` for oracle types, `WagerTermsBound` when terms bound). Reverts:
`ZeroClaimAuthority`, `ClaimAuthorityInUse`, `OpenResolutionTypeNotAllowed`, `InsufficientMembershipTier`,
plus the reused `NotAllowedToken` / `ZeroStake` / `BadDeadlines` / `ArbitratorRequired` /
`ArbitratorDisallowed` / oracle / `MembershipDenied` reverts.

### `acceptOpenWager`

```solidity
function acceptOpenWager(uint256 wagerId, bytes calldata signature)
    external nonReentrant whenNotPaused notFrozen(msg.sender);
```

Behavior (checks → effects → interaction, `nonReentrant`):
- `status == Open` && `claimAuthority[wagerId] != 0` else `NotOpenChallenge`.
- `block.timestamp <= acceptDeadline` else `AcceptExpired`.
- `digest = _hashTypedDataV4(keccak256(abi.encode(OPEN_ACCEPT_TYPEHASH, wagerId, msg.sender)))`;
  `ECDSA.recover(digest, signature) == claimAuthority[wagerId]` else `BadClaimSignature`.
- `msg.sender != creator` else `SelfWager`.
- ThirdParty: `msg.sender != arbitrator` else `ArbitratorCannotTake`.
- `_screen(msg.sender)`, `_screen(creator)`; `checkCanCreate(msg.sender)` else `MembershipDenied`.
  **No tier floor here** — any active membership tier may accept (the Silver+ gate is creation-only, FR-005a).
- Effects: `opponent = msg.sender`, `status = Active`, `_clearClaim(wagerId)`,
  `_userWagerIds[msg.sender].add(wagerId)`, `recordCreate(msg.sender)`.
- Interaction: `safeTransferFrom(msg.sender, address(this), opponentStake)`.
- Emits `WagerAccepted(wagerId, msg.sender)` (existing event — drives the subgraph opponent backfill).

### Internal `_clearClaim`

```solidity
function _clearClaim(uint256 wagerId) internal {
    address a = claimAuthority[wagerId];
    if (a != address(0)) {
        delete openWagerIdByClaim[a];   // free the code for reuse (FR-006a)
        delete claimAuthority[wagerId];
    }
}
```

Called from `acceptOpenWager`, `cancelOpen`, the `Open` branch of `claimRefund`, and `batchExpireOpen`
(all the paths an open wager can leave `Open`). `cancelOpen` currently `delete`s the wager — call
`_clearClaim` first.

### `declineWager` guard (edit to existing function)

`declineWager` is a named-opponent action. Add a guard at its top so an open challenge can never be declined:

```solidity
if (claimAuthority[wagerId] != address(0)) revert DeclineNotAllowedForOpenChallenge();
```

This makes the rejection explicit and honest (FR-023) rather than relying on the implicit
`msg.sender != opponent` check (an open challenge's `opponent` is `address(0)` while Open). The creator's
`cancelOpen` remains the **only** way to withdraw an unaccepted open challenge, and only the creator may
call it — so no other party can release it or move its funds.

## New views

```solidity
/// @notice Active open wager id for a code-derived authority, or 0 if none. Discovery entrypoint (FR-007).
function openWagerIdForClaim(address authority) external view returns (uint256) {
    return openWagerIdByClaim[authority];
}

/// @notice True iff the wager is an open challenge still awaiting a taker.
function isOpenChallenge(uint256 wagerId) external view returns (bool) {
    return claimAuthority[wagerId] != address(0) && _wagers[wagerId].status == Status.Open;
}
```

## New events & errors

```solidity
event OpenWagerCreated(
    uint256 indexed wagerId,
    address indexed creator,
    address indexed claimAuthority,
    address token,
    uint128 stake,
    ResolutionType resolutionType,
    bytes32 metadataHash,
    string  metadataUri
);

error ZeroClaimAuthority();
error ClaimAuthorityInUse();
error OpenResolutionTypeNotAllowed();
error NotOpenChallenge();
error BadClaimSignature();
error ArbitratorCannotTake();
error InsufficientMembershipTier();          // creator below Silver on createOpenWager (FR-005a)
error DeclineNotAllowedForOpenChallenge();   // declineWager invoked on an open challenge (FR-023)
```

`SelfWager` / `AcceptExpired` / `MembershipDenied` / `NotAllowedToken` / `ZeroStake` / `BadDeadlines` /
`ArbitratorRequired` / `ArbitratorDisallowed` and the oracle reverts are reused unchanged.

## Backward-compatibility checklist

- [ ] `Wager` struct layout unchanged; `getWager` ABI identical.
- [ ] No existing function signature, event, or error modified.
- [ ] Named-opponent `createWager` / `acceptWager` paths untouched (open path is separate functions).
- [ ] New events/functions flow to the frontend only through `sync:frontend-contracts`.
